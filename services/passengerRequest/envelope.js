// «Конверт» мутаций ФАП: чтение заявки, публикация в подписку, проверки
// аргументов и дефолты embedded-сервисов. Вынесено из резолвера как есть.

import { GraphQLError } from "graphql"
import { prisma } from "../../prisma.js"
import { pubsub, PASSENGER_REQUEST_UPDATED } from "../infra/pubsub.js"
import { hydratePassengerRequest } from "./hydratePassengerRequest.js"
import { logPassengerRequestAction } from "./logging.js"
import { notifyPassengerRequestSite } from "./notify.js"
import { assertCanAccessRequest } from "./fapScopeGuard.js"

export const getSubjectName = (context) => {
  if (context.user?.name) return context.user.name
  if (context.externalUser?.name) return context.externalUser.name
  if (context.externalUser?.email)
    return `Внеш. пользователь (${context.externalUser.email})`
  if (context.subject?.name) return context.subject.name
  if (context.subject?.email) return context.subject.email
  return "Неизвестный пользователь"
}

// ── Общие хелперы мутаций ФАП (единый «конверт») ──
// ВНИМАНИЕ: мутации читают заявку ТОЛЬКО отсюда — это сырьё из Prisma, и менять
// это на hydratePassengerRequest нельзя. Гидрация накладывает на пассажира ключ
// seat, которого нет в composite-типе PassengerServiceDriverPerson, а
// normalizeDriversForWrite пассажиров не фильтрует, а спредит как есть — любой
// путь записи водителей, прочитавший заявку через гидрацию, упадёт на неизвестном
// аргументе. Гидрация — исключительно для чтения и публикации в подписку.
export const loadRequestOrThrow = async (id) => {
  const existing = await prisma.passengerRequest.findUnique({ where: { id } })
  if (!existing) throw new GraphQLError("PassengerRequest not found")
  return existing
}

export const publishPassengerRequestUpdated = (passengerRequest) =>
  pubsub.publish(PASSENGER_REQUEST_UPDATED, {
    passengerRequestUpdated: hydratePassengerRequest(passengerRequest)
  })

export const assertIndex = (index, length, label) => {
  if (index < 0 || index >= length) {
    throw new GraphQLError(`Invalid ${label}`)
  }
}

export const assertReason = (reason) => {
  const trimmed = reason?.trim()
  if (!trimmed) throw new GraphQLError("Reason is required")
  return trimmed
}

// Составной ключ записи отчёта. Пять дословных повторов на два файла; ошибка
// в нём молча уводит чтение или запись на отчёт другой гостиницы.
export const reportWhere = (passengerRequestId, hotelIndex) => ({
  passengerRequestId_hotelIndex: { passengerRequestId, hotelIndex }
})

// Дефолты embedded-сервисов, когда сервис ещё не создан
export const emptyPeopleService = () => ({
  plan: null,
  status: "NEW",
  times: null,
  earlyCompletionReason: null,
  earlyCompletedAt: null,
  people: []
})

export const emptyLivingService = () => ({
  plan: null,
  status: "NEW",
  times: null,
  hotels: [],
  evictions: []
})

export const emptyDriversService = () => ({
  plan: null,
  status: "NEW",
  times: null,
  drivers: []
})

// Хвост любой мутации ФАП: история заявки → публикация в подписку → сайтовое
// уведомление. Вынесен ОТДЕЛЬНО от полного конверта, потому что мутации отчёта
// пишут не заявку, а запись PassengerRequestHotelReport, и полный конверт им не
// подходит — а хвост у них тот же самый.
//
// Хелпер намеренно механический: он подставляет только context, oldData и
// newData (они всегда одни и те же), а всё остальное переносит из log как есть,
// включая необязательные поля. Ничего не выводит и не подставляет по умолчанию —
// иначе рефактор незаметно изменил бы маршрутизацию писем.
//
// channels существует только ради тестов: в бою используются настоящие каналы.
export async function finishPassengerRequestMutation({
  context,
  oldData,
  newData,
  // Расхождение «что логируем» и «что публикуем» есть ровно у трёх мутаций
  // отчёта: в лог у них уходит запись PassengerRequestHotelReport (дефект №2
  // реестра), а в подписку — сама заявка в до-состоянии. И то и другое
  // наблюдаемо и закреплено характеризационными тестами, поэтому расхождение
  // выражено отдельным параметром, а не спрятано в newData. Всем остальным
  // мутациям publishData не нужен: у них публикуется тот же newData.
  publishData = null,
  log,
  notify = null,
  notifyBeforePublish = false,
  channels = {}
}) {
  const logAction = channels.logAction ?? logPassengerRequestAction
  const publish = channels.publish ?? publishPassengerRequestUpdated
  const notifySite = channels.notifySite ?? notifyPassengerRequestSite

  await logAction({ context, oldData, newData, ...log })

  const toPublish = publishData ?? newData

  // Сайтовое уведомление — такой же побочный канал, как история и письмо выше,
  // и те давно обёрнуты (logging.js). Это был единственный незащищённый шаг
  // хвоста: notifyPassengerRequestSite делает два обращения в базу, и его
  // бросок ронял всю мутацию по УЖЕ ЗАПИСАННОЙ заявке, а при
  // notifyBeforePublish съедал ещё и публикацию — подписчики не узнавали об
  // изменении никогда, потому что повторное сохранение отсекает patchIsNoop.
  // Дефект №20 реестра.
  const runNotify = async () => {
    if (!notify) return
    try {
      await notifySite(notify)
    } catch (error) {
      console.error("Ошибка сайтового уведомления ФАП:", error)
    }
  }

  // Порядок notify относительно publish в модуле неоднороден: у
  // updatePassengerRequest уведомление идёт первым, у cancelPassengerRequest —
  // последним. Оба воспроизводятся дословно, приведение к единому порядку —
  // отдельный пункт реестра дефектов, а не часть этого рефактора.
  if (notifyBeforePublish) {
    await runNotify()
    publish(toPublish)
    return
  }

  publish(toPublish)
  await runNotify()
}

// Полный конверт мутации ФАП: загрузить заявку → применить изменение →
// записать → хвост. Подходит восьми модулям из одиннадцати. Не подходит
// отчёту (пишет не заявку), deletePassengerRequest (удаляет запись) и
// removePassengerRequestHotel (идёт через $transaction) — им остаётся хвост.
//
// apply(existing) возвращает либо { data, log, notify?, notifyBeforePublish? },
// либо null — сигнал «изменений нет». Второе нужно для двух update-мутаций
// водителей: при пустом патче они возвращают заявку нетронутой, без записи,
// без истории и без публикации.
export async function withPassengerRequest({
  requestId,
  context,
  apply,
  channels = {}
}) {
  const existing = await loadRequestOrThrow(requestId)
  // Единственная точка перехвата для 48 мутаций из 55: конверт всё равно грузит
  // заявку, второго обращения в базу проверка не стоит.
  assertCanAccessRequest(context, existing)
  const applied = await apply(existing)
  if (!applied) return existing

  const passengerRequest = await prisma.passengerRequest.update({
    where: { id: requestId },
    data: applied.data
  })

  // Изменился состав или размещение гостей — отчёт этой гостиницы больше не
  // соответствует тому, что отправляли на проверку: суммы в нём пересчитываются
  // из текущих данных (вид размещения выводится из числа жильцов номера). Гасим
  // отметку, чтобы отчёт исчез у авиакомпании до повторной отправки.
  //
  // Порядок несущий: сброс идёт ДО хвоста. Публикация в подписку заставляет
  // открытый клиент перечитать заявку, и сделай мы это после — клиент успел бы
  // прочитать отчёт ещё отправленным.
  //
  // Условие submittedAt: { not: null } делает сброс идемпотентным: вторая правка
  // подряд в базу уже не ходит.
  if (applied.unsubmitReports?.length) {
    await prisma.passengerRequestHotelReport.updateMany({
      where: {
        passengerRequestId: requestId,
        hotelIndex: { in: [...new Set(applied.unsubmitReports)] },
        submittedAt: { not: null }
      },
      data: { submittedAt: null }
    })
  }

  // log и notify можно вернуть функцией от результата записи. Это нужно ровно
  // одной мутации — updatePassengerRequest: только она способна изменить
  // airlineId, поэтому у неё значение обязано браться из записанного документа,
  // а не из существующего. Остальным достаточно объекта.
  // Билдер лога/уведомления может быть async: у updatePassengerRequest он читает
  // авиакомпанию из базы, и это чтение обязано идти ПОСЛЕ записи заявки — как
  // было до конверта. Без await промис ушёл бы в спред `...log`, у промиса нет
  // собственных перечислимых свойств, и все поля лога исчезли бы молча.
  const resolve = async (value) =>
    typeof value === "function" ? value(passengerRequest) : value

  await finishPassengerRequestMutation({
    context,
    oldData: existing,
    newData: passengerRequest,
    log: await resolve(applied.log),
    notify: (await resolve(applied.notify)) ?? null,
    notifyBeforePublish: applied.notifyBeforePublish ?? false,
    channels
  })

  return passengerRequest
}

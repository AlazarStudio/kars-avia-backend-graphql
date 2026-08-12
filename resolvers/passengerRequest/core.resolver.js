// Каркас заявки: создание, обновление, файлы, статусы, экипаж, распознавание документа.

import { prisma } from "../../prisma.js"
import { GraphQLError } from "graphql"
import {
  resolveUserId,
  updateTimes
} from "../../services/passengerRequest/utils.js"
import { normalizeDriversForWrite } from "../../services/passengerRequest/baggageDelivery.js"
import { normalizeCrewMember } from "../../services/passengerRequest/normalizers.js"
import { patchIsNoop } from "../../services/passengerRequest/patchIsNoop.js"
import {
  assertReason,
  finishPassengerRequestMutation,
  getSubjectName,
  loadRequestOrThrow,
  withPassengerRequest
} from "../../services/passengerRequest/envelope.js"
import {
  findPassengerService,
  PASSENGER_SERVICE_FIELDS,
  PASSENGER_SERVICE_TABLE
} from "../../services/passengerRequest/serviceTable.js"
import { recognizePassengerDocument as recognizeDocumentService } from "../../services/docRecognition/recognizePassengerDocument.js"
import { recognitionRateLimiter } from "../../services/docRecognition/recognitionRateLimit.js"
import { logger } from "../../services/infra/logger.js"
import { recomputeServiceStatus } from "../../services/passengerRequest/serviceStatus.js"
import {
  deleteAllPassengerRequestFilesFromDisk,
  deletePassengerRequestFileFromDisk,
  findPassengerRequestFileIndex,
  uploadPassengerRequestFiles
} from "../../services/passengerRequest/files.js"
import {
  pubsub,
  PASSENGER_REQUEST_CREATED
} from "../../services/infra/pubsub.js"
import { formatDate } from "../../services/format/dateTimeFormater.js"
import { logPassengerRequestAction } from "../../services/passengerRequest/logging.js"
import {
  notifyPassengerRequestSite,
  passengerRequestFlightDateChanged
} from "../../services/passengerRequest/notify.js"
import { generateRepresentativeLinksForRequest } from "../../services/passengerRequest/externalLinks.js"
import { assertCanAccessRequest } from "../../services/passengerRequest/fapScopeGuard.js"

export default {
  Mutation: {
    // создание
    createPassengerRequest: async (_, { input, files }, context) => {
      const {
        airlineId,
        airportId,
        crewMembers,
        status,
        createdById: inputCreatorId,
        ...rest
      } = input

      // Заявки ещё нет, поэтому проверяем то, чем она станет: субъект не должен
      // заводить заявку чужой авиакомпании.
      assertCanAccessRequest(context, {
        id: null,
        airlineId: airlineId ?? null,
        airportId: airportId ?? null,
        livingService: null
      })

      const createdById = resolveUserId(context, inputCreatorId)
      if (!createdById) {
        throw new GraphQLError("createdById is required")
      }
      if (!airlineId || !airportId) {
        throw new GraphQLError("airlineId and airportId are required")
      }

      // Услуги в остатке входа тоже лежат, но уходить в документ как есть не
      // должны: у каждой свой дефолт, он собирается ниже по таблице.
      const data = {}
      for (const [key, value] of Object.entries(rest)) {
        if (!PASSENGER_SERVICE_FIELDS.has(key)) data[key] = value
      }
      data.airline = { connect: { id: airlineId } }
      data.createdBy = { connect: { id: createdById } }

      data.airport = { connect: { id: airportId } }
      if (status) {
        data.status = status
        // Тот же штамп, что у setPassengerRequestStatus: заявка, созданная
        // сразу в ACCEPTED или IN_PROGRESS, обязана нести отметку перехода.
        // Раньше её не было — дефект №5 реестра: из пяти путей к статусу
        // штамповали только три. У CREATED отметки нет по построению
        // (в updateTimes для него ветки нет), поэтому пустой composite в
        // документ не пишем. null вместо existing.statusTimes намеренно:
        // документа ещё не существует.
        const statusTimes = updateTimes(null, status)
        if (Object.keys(statusTimes).length > 0) data.statusTimes = statusTimes
      }

      if (Array.isArray(crewMembers)) {
        data.crewMembers = crewMembers.map(normalizeCrewMember)
      }

      // Услуга заводится, только если пришла во входе. Из входа берётся один
      // план, остальное — дефолт услуги: статус и отметки времени услуги
      // рождаются пустыми независимо от того, что прислал клиент.
      for (const entry of PASSENGER_SERVICE_TABLE) {
        const service = input[entry.field]
        if (service) {
          data[entry.field] = { ...entry.empty(), plan: service.plan || null }
        }
      }
      // Формирование уникального requestNumber: {seq4}{airportCode}{MM}{YY}f
      const now = new Date()
      const month = String(now.getMonth() + 1).padStart(2, "0")
      const year = String(now.getFullYear()).slice(-2)
      const lastRequest = await prisma.passengerRequest.findFirst({
        where: { requestNumber: { not: null } },
        orderBy: { createdAt: "desc" },
        select: { requestNumber: true }
      })
      let sequenceNumber = "0001"
      if (lastRequest?.requestNumber) {
        const lastNumber = parseInt(lastRequest.requestNumber.slice(0, 4), 10)
        if (Number.isFinite(lastNumber)) {
          sequenceNumber = String(lastNumber + 1).padStart(4, "0")
        }
      }
      const airportForNumber = await prisma.airport.findUnique({
        where: { id: airportId },
        select: { code: true }
      })
      const airportCode = airportForNumber?.code || "XXX"
      data.requestNumber = `${sequenceNumber}${airportCode}${month}${year}f`

      let passengerRequest = await prisma.passengerRequest.create({ data })
      const adminId =
        context.subjectType === "USER" ? context.subject?.id : null
      const representativeLinks = await generateRepresentativeLinksForRequest({
        requestId: passengerRequest.id,
        airlineId: passengerRequest.airlineId,
        airportId: passengerRequest.airportId,
        adminId
      })
      passengerRequest = await prisma.passengerRequest.update({
        where: { id: passengerRequest.id },
        data: { representativeLinks }
      })

      if (files?.length > 0) {
        const uploadedPaths = await uploadPassengerRequestFiles(
          passengerRequest.id,
          files
        )
        if (uploadedPaths.length > 0) {
          passengerRequest = await prisma.passengerRequest.update({
            where: { id: passengerRequest.id },
            data: { files: uploadedPaths }
          })
        }
      }

      // Хвост конверта здесь неприменим: он публикует гидрированную заявку в
      // топик обновления, а создание уходит СЫРЫМ в собственный топик.
      await logPassengerRequestAction({
        context,
        action: "create_passenger_request",
        description: "ФАП создан",
        fulldescription: `Пользователь ${getSubjectName(context)} создал ФАП ${passengerRequest.requestNumber || passengerRequest.flightNumber}`,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
      })

      pubsub.publish(PASSENGER_REQUEST_CREATED, {
        passengerRequestCreated: passengerRequest
      })

      const airport = passengerRequest.airportId
        ? await prisma.airport.findUnique({
            where: { id: passengerRequest.airportId },
            select: { name: true }
          })
        : null
      const routeParts = [
        passengerRequest.routeFrom,
        passengerRequest.routeTo
      ].filter(Boolean)
      const routePart = routeParts.length
        ? `, маршрут <span style='color:#545873'>${routeParts.join(" → ")}</span>`
        : ""
      const airportPart = airport?.name
        ? `, аэропорт <span style='color:#545873'>${airport.name}</span>`
        : ""
      await notifyPassengerRequestSite({
        action: "create_passenger_request",
        passengerRequestId: passengerRequest.id,
        airlineId: passengerRequest.airlineId,
        descriptionHtml: `Создан ФАП <span style='color:#545873'>${passengerRequest.flightNumber}</span>${routePart}${airportPart}`,
        __typename: "PassengerRequestCreatedNotification"
      })

      return passengerRequest
    },

    // обновление шапки + планов
    updatePassengerRequest: async (_, { id, input }, context) =>
      withPassengerRequest({
        requestId: id,
        context,
        apply: async (existing) => {
          const { airlineId, airportId, crewMembers, ...rest } = input

          const data = {}

          Object.entries(rest).forEach(([key, value]) => {
            if (value === undefined) return
            // Услуги разбираются ниже поштучно; попав сюда, сервисный объект
            // уехал бы в документ как есть — без пересчёта статуса и без
            // нормализации водителей.
            if (PASSENGER_SERVICE_FIELDS.has(key)) return
            data[key] = value
          })

          if (Array.isArray(crewMembers)) {
            data.crewMembers = crewMembers.map(normalizeCrewMember)
          }

          if (airlineId) {
            data.airline = { connect: { id: airlineId } }
          }

          if (airportId !== undefined) {
            if (airportId === null) data.airport = { disconnect: true }
            else data.airport = { connect: { id: airportId } }
          }

          // Правка плана меняет статус, не меняя факта: число людей до и после
          // одно и то же, поэтому пересчёт зовётся с одинаковыми счётчиками —
          // сработать может только правило «факт >= плана» и обратное ему.
          // Чем именно меряется факт у каждой услуги — в serviceTable.js.
          for (const entry of PASSENGER_SERVICE_TABLE) {
            const service = input[entry.field]
            if (!service) continue

            const prev = existing[entry.field] || {}
            // План — embedded composite, а composite Prisma ЗАМЕНЯЕТ целиком, а
            // не сливает по полям. Клиент присылает подмножество: при
            // выключении услуги это `{ enabled: false }`, и без слияния
            // peopleCount и плановые даты обнулялись безвозвратно. Для
            // проживания это особенно больно: плановый период — единственный
            // источник суток у гостя, который сейчас в гостинице (его интервал
            // размещения открыт, а закрытого нет), поэтому весь ещё не
            // сохранённый отчёт начинал считать ноль суток.
            // Присланные ключи по-прежнему побеждают, в том числе явный null —
            // слияние защищает только те поля, которых во входе НЕТ.
            const mergedPlan =
              service.plan !== undefined
                ? { ...(prev.plan || {}), ...service.plan }
                : prev.plan
            const current = entry.factCount(prev)
            // Досрочное завершение — решение диспетчера, а не следствие счётчиков:
            // услуга закрыта ИМЕННО при факте ниже плана. Пересчёт видел ровно эту
            // картину (`nextCount < planCount`) и возвращал услугу в работу, снимая
            // finishedAt, — то есть обычное «Сохранить» в сайдбаре услуг молча
            // откатывало закрытие, писало историю и рассылало письмо. Признаки
            // досрочного закрытия при этом оставались в документе, и карточка
            // показывала «в работе» с причиной завершения.
            // Явный откат есть отдельной мутацией — reopenPassengerRequestService,
            // она гасит и признаки, и требует причину.
            const completedEarly =
              prev.status === "COMPLETED" && prev.earlyCompletedAt != null
            const recalc = completedEarly
              ? { status: prev.status, times: prev.times || {} }
              : recomputeServiceStatus(
                  { ...prev, plan: mergedPlan },
                  current,
                  current
                )
            data[entry.field] = {
              ...prev,
              ...(service.plan !== undefined && { plan: mergedPlan }),
              // Пассажиров чинят только водительские услуги; вода, питание и
              // проживание уносят своих людей из prev как есть.
              ...(entry.hasDrivers && {
                drivers: normalizeDriversForWrite(prev.drivers)
              }),
              status: recalc.status,
              times: recalc.times
            }
          }

          // Ничего не изменилось — выходим без записи, истории, публикации и
          // письма. Условие «в патче есть хоть один ключ» этого не ловило: форма
          // CRM шлёт все пять сервисных блоков безусловно, поэтому сохранение без
          // правок писало историю и рассылало участникам письмо об обновлении,
          // которого не было.
          if (patchIsNoop(existing, data)) return null

          // Статус заявки правится здесь как обычное поле шапки, поэтому
          // переход штампуем тем же updateTimes, что и
          // setPassengerRequestStatus, — иначе один и тот же переход даёт
          // разный документ в зависимости от того, какой мутацией его сделали
          // (дефект №5 реестра).
          // ⚠️ Порядок относительно patchIsNoop несущий: statusTimes в
          // присланном патче не приходит никогда, и внутри проверки такой ключ
          // всегда читался бы как «изменилось» — штамп до неё убил бы защиту от
          // сохранения без правок.
          if (data.status && data.status !== existing.status) {
            data.statusTimes = updateTimes(existing.statusTimes, data.status)
          }

          const isDateChange = passengerRequestFlightDateChanged(
            existing.flightDate,
            rest.flightDate
          )
          const emailAction = isDateChange
            ? "passenger_request_dates_change"
            : "update_passenger_request"

          return {
            data,
            // Единственная мутация модуля, способная сменить airlineId, поэтому
            // лог собирается по ЗАПИСАННОМУ документу, а не по прочитанному.
            // Билдер асинхронный: название авиакомпании для письма о переносе
            // даты читается ПОСЛЕ записи заявки, как было до конверта.
            log: async (passengerRequest) => {
              let emailExtras = {}
              if (isDateChange) {
                const airline = passengerRequest.airlineId
                  ? await prisma.airline.findUnique({
                      where: { id: passengerRequest.airlineId },
                      select: { name: true }
                    })
                  : null
                emailExtras = {
                  oldFlightDate: formatDate(existing.flightDate),
                  newFlightDate: formatDate(passengerRequest.flightDate),
                  airlineName: airline?.name
                }
              }
              return {
                action: "update_passenger_request",
                description: "ФАП обновлен",
                fulldescription: `Пользователь ${getSubjectName(context)} обновил ФАП ${passengerRequest.flightNumber}`,
                airlineId: passengerRequest.airlineId,
                passengerRequestId: passengerRequest.id,
                emailAction,
                emailExtras
              }
            },
            // Условие «есть что писать» стоит только на уведомлении: пустой
            // патч всё равно доходит до записи и до истории.
            notify:
              Object.keys(data).length > 0
                ? (passengerRequest) => ({
                    action: emailAction,
                    passengerRequestId: passengerRequest.id,
                    airlineId: passengerRequest.airlineId,
                    descriptionHtml: `Обновлён ФАП <span style='color:#545873'>${passengerRequest.flightNumber}</span>`,
                    __typename: "PassengerRequestUpdatedNotification"
                  })
                : null,
            // Здесь уведомление уходит ПЕРЕД публикацией — в отличие от
            // соседнего cancelPassengerRequest. Расхождение наблюдаемо.
            notifyBeforePublish: true
          }
        }
      }),

    addPassengerRequestFiles: async (_, { requestId, files }, context) =>
      withPassengerRequest({
        requestId,
        context,
        apply: async (existing) => {
          // Проверка стоит уже ПОСЛЕ чтения заявки: пустой список отбивается,
          // сходив в базу. Асимметрия с пакетными мутациями закреплена тестом.
          if (!files?.length) {
            throw new GraphQLError("At least one file is required")
          }

          // Файлы кладутся на диск ДО записи документа и без транзакции:
          // упавшая загрузка роняет мутацию, не оставив ни записи, ни истории.
          const uploadedPaths = await uploadPassengerRequestFiles(
            requestId,
            files
          )

          return {
            data: { files: [...(existing.files || []), ...uploadedPaths] },
            log: (passengerRequest) => ({
              action: "add_passenger_request_files",
              description: "Файлы добавлены в ФАП",
              fulldescription: `Пользователь ${getSubjectName(context)} добавил ${uploadedPaths.length} файл(ов) в ФАП ${passengerRequest.flightNumber}`,
              airlineId: passengerRequest.airlineId,
              passengerRequestId: passengerRequest.id
            })
          }
        }
      }),

    removePassengerRequestFile: async (_, { requestId, filePath }, context) =>
      withPassengerRequest({
        requestId,
        context,
        apply: async (existing) => {
          const fileIndex = findPassengerRequestFileIndex(
            existing.files,
            filePath
          )
          if (fileIndex < 0) {
            throw new GraphQLError("File not found on this passenger request")
          }

          // С диска файл стирается ДО записи документа — порядок закреплён
          // тестом, менять его нельзя.
          const removedPath = existing.files[fileIndex]
          await deletePassengerRequestFileFromDisk(removedPath)

          return {
            data: {
              files: (existing.files || []).filter(
                (_, index) => index !== fileIndex
              )
            },
            log: (passengerRequest) => ({
              action: "remove_passenger_request_file",
              description: "Файл удалён из ФАП",
              fulldescription: `Пользователь ${getSubjectName(context)} удалил файл из ФАП ${passengerRequest.flightNumber}`,
              airlineId: passengerRequest.airlineId,
              passengerRequestId: passengerRequest.id
            })
          }
        }
      }),

    deletePassengerRequest: async (_, { id }, context) => {
      const existing = await loadRequestOrThrow(id)
      assertCanAccessRequest(context, existing)

      await deleteAllPassengerRequestFilesFromDisk(existing.files)

      // Полный конверт неприменим: документ не обновляется, а удаляется.
      // Остаётся хвост — история и публикация.
      const passengerRequest = await prisma.passengerRequest.delete({
        where: { id }
      })

      await finishPassengerRequestMutation({
        context,
        oldData: passengerRequest,
        // newData у удаления нет вовсе, а в подписку тем не менее уезжает
        // удалённый документ: топика PASSENGER_REQUEST_DELETED не существует.
        newData: undefined,
        publishData: passengerRequest,
        log: {
          action: "delete_passenger_request",
          description: "ФАП удален",
          fulldescription: `Пользователь ${getSubjectName(context)} удалил ФАП ${passengerRequest.flightNumber}`,
          airlineId: passengerRequest.airlineId,
          passengerRequestId: passengerRequest.id
        }
      })

      return true
    },

    // общий статус заявки
    setPassengerRequestStatus: async (_, { id, status }, context) => {
      // Отмена идёт ТОЛЬКО через cancelPassengerRequest: там пишется
      // cancelReason, письмо уходит маршрутом cancel_passenger_request и
      // создаётся сайтовое уведомление об отмене. Общий сеттер не делает
      // ничего из этого, поэтому принятый им CANCELLED давал отменённую
      // заявку без причины, с письмом «Обновлён ФАП» и вовсе без уведомления —
      // дефект №6 реестра. Своего аргумента под причину у сеттера в схеме нет,
      // так что единственная честная форма — отказ.
      // ⚠️ Дверь закрыта не вся: updatePassengerRequest тоже пропускает status
      // в патч и остаётся вторым путём к CANCELLED без причины (дефект №5).
      if (status === "CANCELLED") {
        throw new GraphQLError(
          "Use cancelPassengerRequest to cancel a passenger request",
          { extensions: { code: "BAD_USER_INPUT" } }
        )
      }

      // Проверка стоит ДО конверта сознательно: она не стоит обращения в базу
      // и не должна зависеть от охраны скоупа внутри него.
      return withPassengerRequest({
        requestId: id,
        context,
        apply: (existing) => ({
          data: {
            status,
            statusTimes: updateTimes(existing.statusTimes, status)
          },
          log: (passengerRequest) => ({
            action: "update_passenger_request_status",
            description: "Статус ФАП обновлен",
            fulldescription: `Пользователь ${getSubjectName(context)} сменил статус ФАП ${passengerRequest.flightNumber} на ${status}`,
            airlineId: passengerRequest.airlineId,
            passengerRequestId: passengerRequest.id
          })
        })
      })
    },

    // ростер экипажа заявки
    updatePassengerRequestCrew: async (
      _,
      { requestId, crewMembers },
      context
    ) =>
      withPassengerRequest({
        requestId,
        context,
        apply: () => {
          // Не массив стирает ростер: пустой список — это тоже результат.
          const normalizedCrew = Array.isArray(crewMembers)
            ? crewMembers.map(normalizeCrewMember)
            : []

          return {
            data: { crewMembers: normalizedCrew },
            log: (passengerRequest) => ({
              action: "update_passenger_request_crew",
              description: "Обновлён ростер экипажа ФАП",
              fulldescription: `Пользователь ${getSubjectName(context)} обновил ростер экипажа ФАП ${passengerRequest.flightNumber} (${normalizedCrew.length} чел.)`,
              airlineId: passengerRequest.airlineId,
              passengerRequestId: passengerRequest.id
            })
          }
        }
      }),

    // общий статус заявки
    cancelPassengerRequest: async (_, { id, cancelReason }, context) =>
      withPassengerRequest({
        requestId: id,
        context,
        apply: (existing) => {
          const status = "CANCELLED"
          // Причина обязательна: отменить заявку может и авиакомпания (кнопка
          // отмены в поповере статусов не гейтится ролью), а причина —
          // единственное, из чего диспетчер узнаёт основание. Экран «ФАП v1»
          // требовал её и раньше, теперь правило одно на все пути.
          // ⚠️ Аргумент в схеме сознательно оставлен String, а не String!:
          // non-null сломал бы уже задеплоенный фронт на валидации запроса,
          // ещё до выката новой версии.
          const cleanReason = assertReason(cancelReason)

          return {
            data: {
              status,
              statusTimes: updateTimes(existing.statusTimes, status),
              cancelReason: cleanReason
            },
            // Слаг лога тот же, что у обычной смены статуса: отмену видно
            // только по description и reason.
            log: (passengerRequest) => ({
              action: "update_passenger_request_status",
              description: "Заявка по ФАП отменена",
              fulldescription: `Пользователь ${getSubjectName(context)} отменил ФАП ${passengerRequest.flightNumber}`,
              reason: cleanReason,
              cancelReason: cleanReason,
              airlineId: passengerRequest.airlineId,
              passengerRequestId: passengerRequest.id,
              emailAction: "cancel_passenger_request"
            }),
            notify: (passengerRequest) => ({
              action: "cancel_passenger_request",
              passengerRequestId: passengerRequest.id,
              airlineId: passengerRequest.airlineId,
              descriptionHtml: `Отменён ФАП <span style='color:#545873'>${passengerRequest.flightNumber}</span>`,
              __typename: "PassengerRequestUpdatedNotification"
            })
          }
        }
      }),

    // статус конкретного сервиса
    setPassengerRequestServiceStatus: async (
      _,
      { id, service, status },
      context
    ) =>
      withPassengerRequest({
        requestId: id,
        context,
        apply: (existing) => {
          const entry = findPassengerService(service)

          // Валидации имени услуги нет: неизвестная услуга даёт пустой апдейт,
          // но лог и публикация всё равно случаются.
          const data = {}
          if (entry) {
            const prev = existing[entry.field] || entry.statusFallback()
            data[entry.field] = {
              ...prev,
              ...(entry.hasDrivers && {
                drivers: normalizeDriversForWrite(prev.drivers)
              }),
              ...(entry.statusExtra && entry.statusExtra(prev)),
              status,
              times: updateTimes(prev.times, status)
            }
          }

          return {
            data,
            log: (passengerRequest) => ({
              action: "update_passenger_request_service_status",
              description: `Статус сервиса обновлен: ${service}`,
              fulldescription: `Пользователь ${getSubjectName(context)} сменил статус сервиса ${service} в ФАП ${passengerRequest.flightNumber} на ${status}`,
              airlineId: passengerRequest.airlineId,
              passengerRequestId: passengerRequest.id
            })
          }
        }
      }),

    recognizePassengerDocument: async (_, { image }, context) => {
      // Каждый вызов стоит двух платных обращений в Yandex Cloud, поэтому
      // считаем по субъекту. Анонимных вызовов здесь уже не бывает — их
      // отбивает withFapAuthGuard на экспорте модуля.
      //
      // http-статус намеренно НЕ ставим: Apollo Client на любом статусе ≥300
      // бросает ServerError с пустым graphQLErrors, и текст сообщения до
      // клиента не доходит вовсе. Обычная GraphQL-ошибка с кодом читается.
      if (!recognitionRateLimiter.check(context?.subject?.id)) {
        logger.warn(
          `[FAP] Распознавание документа отклонено лимитом, субъект ${context?.subject?.id}`
        )
        throw new GraphQLError("Слишком много запросов на распознавание", {
          extensions: { code: "TOO_MANY_REQUESTS" }
        })
      }
      return await recognizeDocumentService(image)
    }
  }
}

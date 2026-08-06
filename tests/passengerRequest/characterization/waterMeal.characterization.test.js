// Характеризационные тесты группы «Вода и питание»: добавление получателя,
// пакетное добавление, правка, удаление и пакетное удаление.
//
// Фиксируют поведение КАК ЕСТЬ, включая дефекты. Тест, закрепляющий дефект,
// помечен номером из реестра спеки — при починке дефекта обязан измениться
// именно он.

import test from "node:test"
import assert from "node:assert/strict"
import resolvers from "../../../resolvers/passengerRequest/passengerRequest.resolver.js"
import { installPrismaDouble } from "../../helpers/prismaDouble.js"
import {
  installPubsubSpy,
  normalizeSnapshot,
  releasePubsubAfterTests
} from "../../helpers/fapHarness.js"
import { runFapMutation } from "../../helpers/runFapMutation.js"
import { resolveEmailActionForLog } from "../../../services/notification/passengerRequestEmailActions.js"
import { makeRequest, makeContext } from "../fixtures/passengerRequest.js"

// Обязательно в каждом файле, импортирующем резолвер: иначе при заданном
// REDIS_URL клиенты Redis удержат процесс и раннер не завершится.
releasePubsubAfterTests()

// Общий хелпер отдаёт нормализованный срез. Части тестов этой группы нужен
// более сырой доступ: следы УПАВШЕЙ мутации (кто успел прочитаться до отказа)
// и несглаженный uuid сгенерированного personId. Форму runFapMutation ради
// них не расширяем — она общая на все группы, поэтому стенд ставим здесь.
async function runRaw(
  name,
  args,
  { request = makeRequest(), context = makeContext() } = {}
) {
  const double = installPrismaDouble({ documents: { passengerRequest: request } })
  const spy = installPubsubSpy()
  let result = null
  let error = null
  try {
    result = await resolvers.Mutation[name](null, args, context)
  } catch (e) {
    error = e
  } finally {
    spy.restore()
    double.restore()
  }
  return { result, error, double, published: spy.published }
}

// Получатель воды/питания в том виде, в каком он лежит в документе.
const person = (personId, fullName) => ({
  personId,
  fullName,
  personType: "PASSENGER",
  personCategory: "ADULT"
})

// Заявка с четырьмя получателями воды: на четырёх видно порядок обхода
// индексов, на двух — нет.
const requestWithFourWaterPeople = () => {
  const request = makeRequest()
  request.waterService.people = [
    person("wm-a", "Пассажир А"),
    person("wm-b", "Пассажир Б"),
    person("wm-c", "Пассажир В"),
    person("wm-d", "Пассажир Г")
  ]
  return request
}

const names = (people) => people.map((p) => p.fullName)

// ───────────────────── addPassengerRequestPerson ─────────────────────

test("addPassengerRequestPerson (WATER): весь документ, лог, отсутствие уведомления, публикация", async () => {
  const run = await runFapMutation("addPassengerRequestPerson", {
    requestId: "req-1",
    service: "WATER",
    person: {
      personId: "wm-new-1",
      fullName: "Сидоров Сидор",
      phone: "+79001112233",
      seat: "12A",
      personCategory: "CHILD"
    }
  })

  assert.equal(run.written.length, 1, "документ пишется одним апдейтом")
  // Апдейт трогает ровно два поля: услугу и реестр заявки.
  assert.deepEqual(Object.keys(run.written[0]).sort(), [
    "savedPassengers",
    "waterService"
  ])

  assert.deepEqual(run.written[0].waterService, {
    // План и времена уносятся из prev как есть: 1 → 2 при плане 4 статус не
    // трогает (услуга уже IN_PROGRESS, плана не достигла).
    plan: { enabled: true, peopleCount: 4 },
    status: "IN_PROGRESS",
    times: { acceptedAt: "<DATE>" },
    people: [
      {
        fullName: "Иванов Иван",
        personCategory: "ADULT",
        personId: "<UUID>",
        personType: "PASSENGER"
      },
      // Белого списка полей у воды/питания нет: вход спредится как есть,
      // добавляется только personId и нормализованная категория.
      {
        fullName: "Сидоров Сидор",
        personCategory: "CHILD",
        personId: "wm-new-1",
        phone: "+79001112233",
        seat: "12A"
      }
    ]
  })

  // Реестр заявки дорос на одного; прежние записи ушли байт в байт.
  assert.deepEqual(run.written[0].savedPassengers, [
    {
      fullName: "Иванов Иван",
      personCategory: "ADULT",
      personId: "<UUID>",
      personType: "PASSENGER"
    },
    {
      fullName: "Петров Пётр",
      personCategory: "CHILD",
      personId: "<UUID>",
      personType: "PASSENGER"
    },
    {
      addedAt: "<DATE>",
      airlinePersonalId: null,
      fullName: "Сидоров Сидор",
      personCategory: "CHILD",
      personId: "wm-new-1",
      personType: "PASSENGER",
      phone: "+79001112233",
      placementRequirement: null,
      seat: "12A"
    }
  ])

  assert.equal(run.logged.length, 1)
  assert.equal(run.logged[0].action, "add_passenger_request_person")
  assert.equal(run.logged[0].description, "Пассажир добавлен в сервис: WATER")
  assert.equal(
    run.logged[0].fulldescription,
    "Пользователь Диспетчер Тестовый добавил пассажира в сервис WATER ФАП TEST001"
  )
  assert.equal(run.notified.length, 0, "сайтового уведомления в группе нет")
  assert.deepEqual(run.published, ["PASSENGER_REQUEST_UPDATED"])

  // Публикация — последняя: и запись, и лог уже случились.
  assert.ok(
    run.order.indexOf("passengerRequest.update") < run.order.indexOf("log.create")
  )
  assert.ok(
    run.order.indexOf("log.create") <
      run.order.indexOf("publish:PASSENGER_REQUEST_UPDATED")
  )
})

test("addPassengerRequestPerson (MEAL): пустая услуга из NEW переходит в IN_PROGRESS", async () => {
  const run = await runFapMutation("addPassengerRequestPerson", {
    requestId: "req-1",
    service: "MEAL",
    person: { personId: "wm-new-2", fullName: "Сидоров Сидор" }
  })

  assert.deepEqual(Object.keys(run.written[0]).sort(), [
    "mealService",
    "savedPassengers"
  ])
  assert.equal(run.written[0].waterService, undefined, "вода не трогается")
  assert.equal(run.written[0].mealService.status, "IN_PROGRESS")
  assert.deepEqual(run.written[0].mealService.times, { inProgressAt: "<DATE>" })
  assert.equal(run.logged[0].description, "Пассажир добавлен в сервис: MEAL")
})

test("addPassengerRequestPerson без personId генерирует uuid и кладёт ТОТ ЖЕ id в реестр", async () => {
  // Через нормализованный снимок этого не увидеть: любой uuid схлопывается в
  // <UUID>, и совпадение id в услуге и в реестре стало бы невидимым.
  const run = await runRaw("addPassengerRequestPerson", {
    requestId: "req-1",
    service: "WATER",
    person: { fullName: "Безымянный Пассажир" }
  })

  const data = run.double.callsTo("passengerRequest", "update")[0].args.data
  const added = data.waterService.people[1]
  assert.match(
    added.personId,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  )
  assert.equal(data.savedPassengers.length, 3)
  assert.equal(data.savedPassengers[2].personId, added.personId)
})

test("addPassengerRequestPerson НЕ понижает категорию в реестре: там existing-wins", async () => {
  // Контроль к дефекту №13: путь добавления и путь правки расходятся.
  // upsertSavedPassenger склеивает через mergeSavedPerson, где
  // personCategory берётся из существующей записи, а не из входа.
  const run = await runFapMutation("addPassengerRequestPerson", {
    requestId: "req-1",
    service: "WATER",
    // Петров Пётр в реестре — CHILD, категорию не передаём.
    person: {
      personId: "aaaaaaaa-0000-4000-8000-000000000002",
      fullName: "Петров Пётр"
    }
  })

  // В услуге он всё равно ADULT — нормализация отсутствующей категории.
  assert.equal(run.written[0].waterService.people[1].personCategory, "ADULT")
  // А в реестре сохранился CHILD.
  assert.equal(run.written[0].savedPassengers.length, 2, "реестр не вырос")
  assert.equal(run.written[0].savedPassengers[1].fullName, "Петров Пётр")
  assert.equal(run.written[0].savedPassengers[1].personCategory, "CHILD")
})

// ───────────────────── addPassengerRequestPeople ─────────────────────

test("addPassengerRequestPeople: пачка добавляется одним апдейтом, статус пересчитывается один раз", async () => {
  const run = await runFapMutation("addPassengerRequestPeople", {
    requestId: "req-1",
    service: "WATER",
    people: [
      { personId: "wm-p1", fullName: "Первый Пакетный" },
      { personId: "wm-p2", fullName: "Второй Пакетный" },
      { personId: "wm-p3", fullName: "Третий Пакетный" }
    ]
  })

  assert.equal(run.written.length, 1)
  const water = run.written[0].waterService
  assert.deepEqual(names(water.people), [
    "Иванов Иван",
    "Первый Пакетный",
    "Второй Пакетный",
    "Третий Пакетный"
  ])
  // Факт 1 → 4 при плане 4: автозавершение.
  assert.equal(water.status, "COMPLETED")
  assert.deepEqual(water.times, { acceptedAt: "<DATE>", finishedAt: "<DATE>" })

  assert.equal(run.written[0].savedPassengers.length, 5, "реестр вырос на троих")

  assert.equal(run.logged.length, 1, "пачка = одна запись в истории")
  assert.equal(run.logged[0].action, "add_passenger_request_people")
  assert.equal(
    run.logged[0].description,
    "Пакетно добавлены пассажиры в сервис WATER (3)"
  )
  assert.equal(
    run.logged[0].fulldescription,
    "Пользователь Диспетчер Тестовый добавил 3 пассажиров в сервис WATER ФАП TEST001"
  )
  assert.equal(run.notified.length, 0)
  assert.deepEqual(run.published, ["PASSENGER_REQUEST_UPDATED"])
})

test("СЛИЯНИЕ: одиночная и пакетная версии на одном элементе дают идентичный документ", async () => {
  // Доказательство, на котором стоит будущее слияние пары мутаций. Вход
  // намеренно плотный: заданный personId, все поля схемы, категория CHILD и
  // пассажир, которого в реестре ещё нет.
  const input = {
    personId: "wm-merge-1",
    fullName: "Сидоров Сидор",
    phone: "+79001112233",
    seat: "12A",
    personCategory: "CHILD",
    issuedAt: "2026-08-02T08:00:00.000Z"
  }

  const single = await runFapMutation("addPassengerRequestPerson", {
    requestId: "req-1",
    service: "WATER",
    person: { ...input }
  })
  const bulk = await runFapMutation("addPassengerRequestPeople", {
    requestId: "req-1",
    service: "WATER",
    people: [{ ...input }]
  })

  // 1. Записанный патч совпадает целиком — включая порядок людей, статус,
  //    времена и весь реестр.
  assert.deepEqual(bulk.written, single.written)
  // 2. Совпадает и документ, который мутация вернула наружу.
  assert.deepEqual(
    normalizeSnapshot(bulk.result),
    normalizeSnapshot(single.result)
  )
  // 3. Совпадают побочные каналы и их хронология.
  assert.deepEqual(bulk.published, single.published)
  assert.deepEqual(bulk.notified, single.notified)
  assert.deepEqual(bulk.order, single.order)

  // 4. В логе различаются ровно три текстовых поля. Остальное — автор,
  //    причина, привязки, свёрнутые old/new — байт в байт.
  const withoutText = ({ action, description, fulldescription, ...rest }) => rest
  assert.deepEqual(withoutText(bulk.logged[0]), withoutText(single.logged[0]))
  assert.notEqual(bulk.logged[0].action, single.logged[0].action)
  assert.equal(single.logged[0].action, "add_passenger_request_person")
  assert.equal(bulk.logged[0].action, "add_passenger_request_people")

  // 5. emailExtras ни одна из двух не передаёт — маршрут письма общий.
  assert.equal(
    resolveEmailActionForLog(single.logged[0].action),
    resolveEmailActionForLog(bulk.logged[0].action)
  )
})

test("addPassengerRequestPeople проверяет вход ДО чтения заявки, одиночная — ПОСЛЕ", async () => {
  // Асимметрия конверта: пакетная версия отбивает пустой список и чужую
  // услугу, не сходив в базу; одиночная сначала грузит заявку.
  const emptyList = await runRaw("addPassengerRequestPeople", {
    requestId: "req-1",
    service: "WATER",
    people: []
  })
  assert.match(emptyList.error.message, /people must be a non-empty array/)
  assert.equal(emptyList.double.calls.length, 0, "в базу не ходили вовсе")

  const badServiceBulk = await runRaw("addPassengerRequestPeople", {
    requestId: "req-1",
    service: "LUNCHBOX",
    people: [{ fullName: "Кто-то" }]
  })
  assert.match(
    badServiceBulk.error.message,
    /PassengerWaterFoodKind must be WATER or MEAL/
  )
  assert.equal(badServiceBulk.double.calls.length, 0)

  const badServiceSingle = await runRaw("addPassengerRequestPerson", {
    requestId: "req-1",
    service: "LUNCHBOX",
    person: { fullName: "Кто-то" }
  })
  assert.match(
    badServiceSingle.error.message,
    /PassengerWaterFoodKind must be WATER or MEAL/
  )
  assert.equal(
    badServiceSingle.double.callsTo("passengerRequest", "findUnique").length,
    1,
    "заявка уже прочитана"
  )
  assert.equal(
    badServiceSingle.double.callsTo("passengerRequest", "update").length,
    0
  )
  assert.equal(badServiceSingle.published.length, 0)
})

// ───────────────────── пересчёт статуса услуги ─────────────────────

test("статус: добавление до плана оставляет IN_PROGRESS, достижение плана даёт COMPLETED", async () => {
  // Дефолт фикстуры: вода — план 4, факт 1, IN_PROGRESS.
  const below = await runFapMutation("addPassengerRequestPeople", {
    requestId: "req-1",
    service: "WATER",
    people: [
      { personId: "wm-s1", fullName: "Второй" },
      { personId: "wm-s2", fullName: "Третий" }
    ]
  })
  assert.equal(below.written[0].waterService.people.length, 3)
  assert.equal(below.written[0].waterService.status, "IN_PROGRESS")
  assert.deepEqual(
    below.written[0].waterService.times,
    { acceptedAt: "<DATE>" },
    "времена не тронуты: услуга уже была IN_PROGRESS"
  )

  const exact = await runFapMutation("addPassengerRequestPeople", {
    requestId: "req-1",
    service: "WATER",
    people: [
      { personId: "wm-s1", fullName: "Второй" },
      { personId: "wm-s2", fullName: "Третий" },
      { personId: "wm-s3", fullName: "Четвёртый" }
    ]
  })
  assert.equal(exact.written[0].waterService.people.length, 4)
  assert.equal(exact.written[0].waterService.status, "COMPLETED")
  assert.equal(exact.written[0].waterService.times.finishedAt, "<DATE>")
})

test("статус: превышение плана НЕ переоткрывает COMPLETED", async () => {
  const request = requestWithFourWaterPeople()
  request.waterService.status = "COMPLETED"
  request.waterService.times = {
    acceptedAt: "2026-08-01T10:00:00.000Z",
    finishedAt: "2026-08-02T10:00:00.000Z"
  }

  const run = await runFapMutation(
    "addPassengerRequestPerson",
    {
      requestId: "req-1",
      service: "WATER",
      person: { personId: "wm-e", fullName: "Пятый Сверх Плана" }
    },
    { request }
  )

  assert.equal(run.written[0].waterService.people.length, 5, "факт 5 при плане 4")
  assert.equal(run.written[0].waterService.status, "COMPLETED")
  assert.deepEqual(run.written[0].waterService.times, {
    acceptedAt: "<DATE>",
    finishedAt: "<DATE>"
  })
})

test("статус: падение факта НИЖЕ плана переоткрывает COMPLETED и гасит finishedAt", async () => {
  const request = requestWithFourWaterPeople()
  request.waterService.status = "COMPLETED"
  request.waterService.times = {
    acceptedAt: "2026-08-01T10:00:00.000Z",
    finishedAt: "2026-08-02T10:00:00.000Z"
  }

  const run = await runFapMutation(
    "removePassengerRequestPerson",
    { requestId: "req-1", service: "WATER", personIndex: 0 },
    { request }
  )

  assert.equal(run.written[0].waterService.people.length, 3)
  assert.equal(run.written[0].waterService.status, "IN_PROGRESS")
  assert.deepEqual(run.written[0].waterService.times, {
    acceptedAt: "<DATE>",
    finishedAt: null,
    inProgressAt: "<DATE>"
  })
})

// ───────────────────── updatePassengerRequestPerson ─────────────────────

test("updatePassengerRequestPerson сливает патч поверх получателя и переносит идентичность в реестр", async () => {
  const run = await runFapMutation("updatePassengerRequestPerson", {
    requestId: "req-1",
    service: "WATER",
    personIndex: 0,
    person: { fullName: "Иванов Иван Иванович", phone: "+79995554433" }
  })

  assert.deepEqual(Object.keys(run.written[0]).sort(), [
    "savedPassengers",
    "waterService"
  ])
  assert.deepEqual(run.written[0].waterService.people, [
    {
      fullName: "Иванов Иван Иванович",
      // issuedAt подставляется явным null, даже если его не было ни во входе,
      // ни в прежнем получателе.
      issuedAt: null,
      personCategory: "ADULT",
      personId: "<UUID>",
      personType: "PASSENGER",
      phone: "+79995554433"
    }
  ])

  // Правка сервис-персоны переписывает запись реестра целиком: ключи
  // приводятся к форме normalizeSavedPerson.
  assert.equal(run.written[0].savedPassengers.length, 2, "реестр не вырос")
  assert.deepEqual(run.written[0].savedPassengers[0], {
    addedAt: "<DATE>",
    airlinePersonalId: null,
    fullName: "Иванов Иван Иванович",
    personCategory: "ADULT",
    personId: "<UUID>",
    personType: "PASSENGER",
    phone: "+79995554433",
    placementRequirement: null,
    seat: null
  })

  assert.equal(run.logged.length, 1)
  assert.equal(run.logged[0].action, "update_passenger_request_person")
  assert.equal(run.logged[0].description, "Получатель обновлён в сервисе: WATER")
  assert.equal(
    run.logged[0].fulldescription,
    "Пользователь Диспетчер Тестовый обновил получателя #0 в сервисе WATER ФАП TEST001"
  )
  assert.equal(run.notified.length, 0)
  assert.deepEqual(run.published, ["PASSENGER_REQUEST_UPDATED"])
})

test("updatePassengerRequestPerson: issuedAt снимается только новой датой, но не null", async () => {
  // Слияние идёт через ??, поэтому явный null во входе неотличим от
  // «поле не передано» и падает обратно на прежнее значение: отметку выдачи
  // воды снять нельзя, можно только переставить. Даты сравниваем сырыми —
  // в нормализованном снимке обе схлопнулись бы в <DATE>.
  const withIssuedAt = () => {
    const request = makeRequest()
    request.waterService.people = [
      { ...person("wm-a", "Пассажир А"), issuedAt: "2026-08-01T09:00:00.000Z" }
    ]
    return request
  }
  const writtenIssuedAt = (run) =>
    run.double.callsTo("passengerRequest", "update")[0].args.data.waterService
      .people[0].issuedAt

  const kept = await runRaw(
    "updatePassengerRequestPerson",
    {
      requestId: "req-1",
      service: "WATER",
      personIndex: 0,
      person: { fullName: "Пассажир А" }
    },
    { request: withIssuedAt() }
  )
  assert.equal(writtenIssuedAt(kept), "2026-08-01T09:00:00.000Z")

  const nulled = await runRaw(
    "updatePassengerRequestPerson",
    {
      requestId: "req-1",
      service: "WATER",
      personIndex: 0,
      person: { fullName: "Пассажир А", issuedAt: null }
    },
    { request: withIssuedAt() }
  )
  assert.equal(
    writtenIssuedAt(nulled),
    "2026-08-01T09:00:00.000Z",
    "явный null не стирает отметку"
  )

  const replaced = await runRaw(
    "updatePassengerRequestPerson",
    {
      requestId: "req-1",
      service: "WATER",
      personIndex: 0,
      person: { fullName: "Пассажир А", issuedAt: "2026-08-03T07:30:00.000Z" }
    },
    { request: withIssuedAt() }
  )
  assert.equal(writtenIssuedAt(replaced), "2026-08-03T07:30:00.000Z")

  // Когда отметки нет ни во входе, ни в прежнем получателе, в документ
  // уходит явный null, а не отсутствующий ключ.
  const absent = await runRaw(
    "updatePassengerRequestPerson",
    {
      requestId: "req-1",
      service: "WATER",
      personIndex: 0,
      person: { fullName: "Пассажир А" }
    },
    { request: requestWithFourWaterPeople() }
  )
  const people = absent.double.callsTo("passengerRequest", "update")[0].args.data
    .waterService.people
  assert.equal("issuedAt" in people[0], true)
  assert.equal(people[0].issuedAt, null)
})

test("updatePassengerRequestPerson НЕ пересчитывает статус услуги", async () => {
  // Единственная мутация группы, которая не зовёт recomputeServiceStatus:
  // статус и времена уносятся из prev как есть, даже когда факт ниже плана.
  const request = makeRequest()
  request.waterService.status = "COMPLETED"
  request.waterService.times = {
    acceptedAt: "2026-08-01T10:00:00.000Z",
    finishedAt: "2026-08-02T10:00:00.000Z"
  }

  const run = await runFapMutation(
    "updatePassengerRequestPerson",
    {
      requestId: "req-1",
      service: "WATER",
      personIndex: 0,
      person: { fullName: "Иванов Иван" }
    },
    { request }
  )

  assert.equal(run.written[0].waterService.people.length, 1, "факт 1 при плане 4")
  assert.equal(run.written[0].waterService.status, "COMPLETED")
  assert.deepEqual(run.written[0].waterService.times, {
    acceptedAt: "<DATE>",
    finishedAt: "<DATE>"
  })
})

test("правка получателя не понижает категорию в реестре", async () => {
  // Было: резолвер нормализует отсутствующую категорию к ADULT
  // (normalizePersonCategory: всё, кроме CHILD/INFANT, — взрослый) и отдаёт
  // получившийся объект в patchSavedPersonIdentity, где incoming-wins, —
  // правка телефона молча понижала ребёнка до взрослого в реестре заявки, а
  // категория даёт скидку на проживание (CHILD 50 %, INFANT 100 %).
  // Стало: источник истины по категории — реестр. Сервис-персона несёт
  // personCategory ВСЕГДА, а форма правки получателя в CRM предзаполняется
  // категорией сервис-персоны, поэтому «пользователь выбрал ADULT» и «поле не
  // указано» на бэке неразличимы. Категорию из услуги реестр принимает только
  // когда своей у него ещё нет; явная правка — мутацией реестра.
  const request = makeRequest()
  // Петров Пётр в savedPassengers — CHILD; в услуге категории нет вовсе.
  request.waterService.people = [
    {
      personId: "aaaaaaaa-0000-4000-8000-000000000002",
      fullName: "Петров Пётр"
    }
  ]

  const run = await runFapMutation(
    "updatePassengerRequestPerson",
    {
      requestId: "req-1",
      service: "WATER",
      personIndex: 0,
      person: { fullName: "Петров Пётр", phone: "+79990001122" }
    },
    { request }
  )

  // Получатель услуги по-прежнему нормализуется к ADULT — резолвер не менялся.
  assert.equal(run.written[0].waterService.people[0].personCategory, "ADULT")
  const roster = run.written[0].savedPassengers
  assert.equal(roster.length, 2)
  assert.equal(roster[1].fullName, "Петров Пётр")
  assert.equal(roster[1].personCategory, "CHILD", "ростерный CHILD уцелел")
  assert.equal(roster[1].phone, "+79990001122", "прочие поля правки доехали")

  // Явно переданная категория тоже не доезжает до реестра, пока у реестра есть
  // своя: правило про наличие значения в реестре, а не про конкретный ADULT.
  // В самой услуге правка при этом применяется.
  const explicit = await runFapMutation(
    "updatePassengerRequestPerson",
    {
      requestId: "req-1",
      service: "WATER",
      personIndex: 0,
      person: {
        fullName: "Петров Пётр",
        phone: "+79990001122",
        personCategory: "INFANT"
      }
    },
    { request: makeRequest({ waterService: request.waterService }) }
  )
  assert.equal(explicit.written[0].waterService.people[0].personCategory, "INFANT")
  assert.equal(explicit.written[0].savedPassengers[1].personCategory, "CHILD")
})

// ───────────────────── removePassengerRequestPerson ─────────────────────

test("removePassengerRequestPerson вырезает получателя и НЕ трогает реестр", async () => {
  const run = await runFapMutation(
    "removePassengerRequestPerson",
    { requestId: "req-1", service: "WATER", personIndex: 1 },
    { request: requestWithFourWaterPeople() }
  )

  assert.deepEqual(Object.keys(run.written[0]), ["waterService"])
  assert.deepEqual(names(run.written[0].waterService.people), [
    "Пассажир А",
    "Пассажир В",
    "Пассажир Г"
  ])
  assert.equal(run.logged.length, 1)
  assert.equal(run.logged[0].action, "remove_passenger_request_person")
  assert.equal(run.logged[0].description, "Получатель удалён из сервиса: WATER")
  assert.equal(
    run.logged[0].fulldescription,
    "Пользователь Диспетчер Тестовый удалил получателя #1 в сервисе WATER ФАП TEST001"
  )
  assert.equal(run.notified.length, 0)
  assert.deepEqual(run.published, ["PASSENGER_REQUEST_UPDATED"])
})

// ───────────────────── removePassengerRequestPeople ─────────────────────

test("removePassengerRequestPeople обходит индексы по УБЫВАНИЮ: [0, 2] из a,b,c,d оставляет b,d", async () => {
  // На четырёх людях ошибка порядка видна: обход по возрастанию вырезал бы
  // a и d (после первого splice индексы съезжают) и оставил бы b,c.
  const run = await runFapMutation(
    "removePassengerRequestPeople",
    { requestId: "req-1", service: "WATER", personIndexes: [0, 2] },
    { request: requestWithFourWaterPeople() }
  )

  assert.deepEqual(Object.keys(run.written[0]), ["waterService"])
  assert.deepEqual(names(run.written[0].waterService.people), [
    "Пассажир Б",
    "Пассажир Г"
  ])
  assert.deepEqual(
    run.written[0].waterService.people.map((p) => p.personId),
    ["wm-b", "wm-d"]
  )

  // Статус пересчитан ОДИН раз по итогу пачки: 4 → 2 при плане 4.
  assert.equal(run.written[0].waterService.status, "IN_PROGRESS")

  assert.equal(run.logged.length, 1, "пачка = одна запись в истории")
  assert.equal(run.logged[0].action, "remove_passenger_request_people")
  assert.equal(run.logged[0].description, "Получатели удалены из сервиса: WATER")
  assert.equal(
    run.logged[0].fulldescription,
    "Пользователь Диспетчер Тестовый удалил получателей (2) в сервисе WATER ФАП TEST001"
  )
  assert.equal(run.notified.length, 0)
  assert.deepEqual(run.published, ["PASSENGER_REQUEST_UPDATED"])
})

test("removePassengerRequestPeople схлопывает повторы индексов и считает их в логе после схлопывания", async () => {
  const run = await runFapMutation(
    "removePassengerRequestPeople",
    { requestId: "req-1", service: "WATER", personIndexes: [2, 0, 2, 0] },
    { request: requestWithFourWaterPeople() }
  )

  assert.deepEqual(names(run.written[0].waterService.people), [
    "Пассажир Б",
    "Пассажир Г"
  ])
  assert.equal(
    run.logged[0].fulldescription,
    "Пользователь Диспетчер Тестовый удалил получателей (2) в сервисе WATER ФАП TEST001"
  )
})

test("removePassengerRequestPeople: пачка применяется целиком либо никак", async () => {
  // Один негодный индекс отбивает всю пачку ДО записи — валидация стоит
  // раньше splice.
  const outOfRange = await runRaw(
    "removePassengerRequestPeople",
    { requestId: "req-1", service: "WATER", personIndexes: [0, 9] },
    { request: requestWithFourWaterPeople() }
  )
  assert.match(outOfRange.error.message, /Invalid personIndex/)
  assert.equal(
    outOfRange.double.callsTo("passengerRequest", "update").length,
    0
  )
  assert.equal(outOfRange.double.callsTo("log", "create").length, 0)
  assert.equal(outOfRange.published.length, 0)

  const empty = await runRaw("removePassengerRequestPeople", {
    requestId: "req-1",
    service: "WATER",
    personIndexes: []
  })
  assert.match(empty.error.message, /Не выбран ни один получатель/)
  // Заявка при этом уже прочитана: проверка стоит ПОСЛЕ загрузки документа.
  assert.equal(empty.double.callsTo("passengerRequest", "findUnique").length, 1)
  assert.equal(empty.double.callsTo("passengerRequest", "update").length, 0)
})

test("одиночное удаление отбивает индекс за границей списка", async () => {
  const run = await runRaw("removePassengerRequestPerson", {
    requestId: "req-1",
    service: "WATER",
    personIndex: 5
  })
  assert.match(run.error.message, /Invalid personIndex/)
  assert.equal(run.double.callsTo("passengerRequest", "update").length, 0)
  assert.equal(run.published.length, 0)
})

// ───────────────────── общие свойства группы ─────────────────────

test("реестр заявки только растёт: добавление и правка его пишут, оба удаления — нет", async () => {
  const request = requestWithFourWaterPeople

  const added = await runFapMutation(
    "addPassengerRequestPerson",
    {
      requestId: "req-1",
      service: "WATER",
      person: { personId: "wm-roster", fullName: "Новый Пассажир" }
    },
    { request: request() }
  )
  assert.ok("savedPassengers" in added.written[0])
  assert.equal(added.written[0].savedPassengers.length, 3, "реестр вырос")

  const updated = await runFapMutation(
    "updatePassengerRequestPerson",
    {
      requestId: "req-1",
      service: "WATER",
      personIndex: 0,
      person: { fullName: "Пассажир А" }
    },
    { request: request() }
  )
  assert.ok("savedPassengers" in updated.written[0])

  const removedOne = await runFapMutation(
    "removePassengerRequestPerson",
    { requestId: "req-1", service: "WATER", personIndex: 0 },
    { request: request() }
  )
  assert.equal("savedPassengers" in removedOne.written[0], false)

  const removedMany = await runFapMutation(
    "removePassengerRequestPeople",
    { requestId: "req-1", service: "WATER", personIndexes: [0, 1] },
    { request: request() }
  )
  assert.equal("savedPassengers" in removedMany.written[0], false)

  // Реестр в вернувшемся документе после удаления остался прежним.
  assert.equal(removedMany.result.savedPassengers.length, 2)
  assert.deepEqual(
    removedMany.result.savedPassengers.map((p) => p.fullName),
    ["Иванов Иван", "Петров Пётр"]
  )

  // passengerGroups не трогает ни одна из пяти мутаций.
  for (const run of [added, updated, removedOne, removedMany]) {
    assert.equal("passengerGroups" in run.written[0], false)
  }
})

test("в группе нет ни одного сайтового уведомления: единственный канал наружу — письмо", async () => {
  const request = requestWithFourWaterPeople
  const runs = [
    await runFapMutation(
      "addPassengerRequestPerson",
      {
        requestId: "req-1",
        service: "WATER",
        person: { personId: "wm-n1", fullName: "Кто-то" }
      },
      { request: request() }
    ),
    await runFapMutation(
      "addPassengerRequestPeople",
      {
        requestId: "req-1",
        service: "MEAL",
        people: [{ personId: "wm-n2", fullName: "Кто-то" }]
      },
      { request: request() }
    ),
    await runFapMutation(
      "updatePassengerRequestPerson",
      {
        requestId: "req-1",
        service: "WATER",
        personIndex: 0,
        person: { fullName: "Пассажир А" }
      },
      { request: request() }
    ),
    await runFapMutation(
      "removePassengerRequestPerson",
      { requestId: "req-1", service: "WATER", personIndex: 0 },
      { request: request() }
    ),
    await runFapMutation(
      "removePassengerRequestPeople",
      { requestId: "req-1", service: "WATER", personIndexes: [0] },
      { request: request() }
    )
  ]

  for (const run of runs) {
    assert.equal(run.notified.length, 0, "notifyPassengerRequestSite не зовётся")
    assert.equal(run.order.includes("notification.create"), false)
    assert.deepEqual(run.published, ["PASSENGER_REQUEST_UPDATED"])
    assert.equal(run.logged.length, 1)
  }

  // Все пять слагов лога маршрутизируются в одно и то же письмо.
  const actions = runs.map((run) => run.logged[0].action)
  assert.deepEqual(actions, [
    "add_passenger_request_person",
    "add_passenger_request_people",
    "update_passenger_request_person",
    "remove_passenger_request_person",
    "remove_passenger_request_people"
  ])
  for (const action of actions) {
    assert.equal(resolveEmailActionForLog(action), "update_passenger_request")
  }
})

test("аутентификация: без субъекта ни одна мутация группы не выполняется", async () => {
  const calls = [
    [
      "addPassengerRequestPerson",
      { requestId: "req-1", service: "WATER", person: { fullName: "X" } }
    ],
    [
      "addPassengerRequestPeople",
      { requestId: "req-1", service: "WATER", people: [{ fullName: "X" }] }
    ],
    [
      "updatePassengerRequestPerson",
      {
        requestId: "req-1",
        service: "WATER",
        personIndex: 0,
        person: { fullName: "X" }
      }
    ],
    [
      "removePassengerRequestPerson",
      { requestId: "req-1", service: "WATER", personIndex: 0 }
    ],
    [
      "removePassengerRequestPeople",
      { requestId: "req-1", service: "WATER", personIndexes: [0] }
    ]
  ]

  for (const [name, args] of calls) {
    await assert.rejects(
      () => runFapMutation(name, args, { context: {} }),
      /Unauthorized/,
      name
    )
  }
})

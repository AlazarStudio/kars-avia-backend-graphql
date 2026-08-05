// Характеризационные тесты группы «Проживание — переселение и выселение»:
// relocatePassengerRequestHotelPerson / relocatePassengerRequestHotelPeople /
// evictPassengerRequestHotelPerson / evictPassengerRequestHotelPeople.
//
// Фиксируют поведение КАК ЕСТЬ, включая дефекты. Тест, закрепляющий дефект,
// помечен номером из реестра спеки — при починке дефекта обязан измениться
// именно он.

import test from "node:test"
import assert from "node:assert/strict"
import resolvers from "../../../resolvers/passengerRequest/passengerRequest.resolver.js"
import { installPrismaDouble } from "../../helpers/prismaDouble.js"
import { installPubsubSpy, releasePubsubAfterTests } from "../../helpers/fapHarness.js"
import { runFapMutation } from "../../helpers/runFapMutation.js"
import { resolveEmailActionForLog } from "../../../services/notification/passengerRequestEmailActions.js"
import { makeRequest, makeContext } from "../fixtures/passengerRequest.js"

// Обязательно в каждом файле, импортирующем резолвер: иначе при заданном
// REDIS_URL клиенты Redis удержат процесс и раннер не завершится.
releasePubsubAfterTests()

// ─────────────────────────────── стенд группы ───────────────────────────────

// Половина утверждений группы — про ДАТЫ интервалов проживания, а
// normalizeSnapshot схлопывает любую дату в "<DATE>". Поэтому кроме общего
// runFapMutation здесь нужен сырой доступ к аргументам prisma и к следам
// упавшей мутации. Форму общего хелпера ради этого не расширяем — стенд
// локальный, как в core.characterization.test.js.
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
  const updates = double.callsTo("passengerRequest", "update")
  return {
    result,
    error,
    double,
    published: spy.published,
    // Сырой (ненормализованный) livingService последнего апдейта: с Date как Date.
    living: updates.length ? updates[updates.length - 1].args.data.livingService : null
  }
}

// Гость гостиницы. По умолчанию — с одним открытым интервалом проживания,
// как в фикстуре; chesses: null отдаёт гостя вовсе без accommodationChesses.
function makePerson(n, { chesses } = {}) {
  const person = {
    personId: `aaaaaaaa-0000-4000-8000-00000000000${n}`,
    fullName: `П${n}`,
    personType: "PASSENGER",
    personCategory: "ADULT",
    roomNumber: `10${n}`,
    arrival: null,
    departure: null,
    roomCategory: null,
    roomKind: null,
    airlinePersonalId: null,
    accommodationChesses: [
      {
        hotelIndex: 0,
        hotelName: "Азия",
        startAt: "2026-08-04T12:00:00.000Z",
        endAt: null,
        reason: null
      }
    ]
  }
  if (chesses === null) delete person.accommodationChesses
  else if (chesses !== undefined) person.accommodationChesses = chesses
  return person
}

// Заявка с теми же двумя гостиницами, что в фикстуре, но со своим составом
// жильцов и (при необходимости) своим статусом/планом услуги проживания.
function requestWithLiving({ peopleByHotel = [], ...serviceOverrides } = {}) {
  const base = makeRequest()
  return makeRequest({
    livingService: {
      ...base.livingService,
      ...serviceOverrides,
      hotels: base.livingService.hotels.map((hotel, index) => ({
        ...hotel,
        people: peopleByHotel[index] ?? []
      }))
    }
  })
}

const MOVED_AT = "2026-08-10T08:00:00.000Z"

// ───────────────────── relocatePassengerRequestHotelPerson ────────────────────

test("relocatePassengerRequestHotelPerson: документ, лог, уведомление, публикация", async () => {
  const run = await runFapMutation("relocatePassengerRequestHotelPerson", {
    requestId: "req-1",
    fromHotelIndex: 0,
    toHotelIndex: 1,
    personIndex: 0,
    reason: "переезд",
    movedAt: MOVED_AT
  })

  // Апдейт один и трогает ровно одно поле заявки.
  assert.equal(run.written.length, 1)
  assert.deepEqual(Object.keys(run.written[0]), ["livingService"])
  assert.deepEqual(run.written[0].livingService, {
    plan: { enabled: true, peopleCount: 4 },
    status: "IN_PROGRESS",
    times: { createdAt: "<DATE>" },
    evictions: [],
    hotels: [
      {
        itemId: "<UUID>",
        hotelId: "hotel-1",
        name: "Азия",
        address: "г. Абакан, ул. Ленина, 1",
        peopleCount: 2,
        people: []
      },
      {
        itemId: "<UUID>",
        hotelId: "hotel-2",
        name: "Чаплан",
        address: "г. Абакан, ул. Мира, 5",
        peopleCount: 2,
        people: [
          {
            personId: "<UUID>",
            fullName: "Иванов Иван",
            personType: "PASSENGER",
            personCategory: "ADULT",
            roomNumber: "101",
            arrival: null,
            departure: null,
            roomCategory: null,
            roomKind: null,
            airlinePersonalId: null,
            accommodationChesses: [
              // старый интервал закрыт датой переселения…
              {
                hotelIndex: 0,
                hotelName: "Азия",
                startAt: "<DATE>",
                endAt: "<DATE>",
                reason: null
              },
              // …и открыт новый на целевой гостинице, с причиной переезда.
              {
                hotelIndex: 1,
                hotelName: "Чаплан",
                startAt: "<DATE>",
                endAt: null,
                reason: "переезд"
              }
            ]
          }
        ]
      }
    ]
  })

  assert.equal(run.logged.length, 1)
  assert.equal(run.logged[0].action, "relocate_passenger_request_hotel_person")
  assert.equal(run.logged[0].description, "Пассажир переселён между гостиницами ФАП")
  assert.equal(
    run.logged[0].fulldescription,
    "Пользователь Диспетчер Тестовый переселил пассажира в ФАП TEST001 из гостиницы Азия в Чаплан"
  )
  assert.equal(run.logged[0].reason, "переезд")

  assert.equal(run.notified.length, 1)
  assert.equal(
    run.notified[0].description.action,
    "update_hotel_chess_passenger_request"
  )
  // Уведомление адресуется ЦЕЛЕВОЙ гостинице, не исходной.
  assert.deepEqual(run.notified[0].hotel, { connect: { id: "hotel-2" } })

  assert.deepEqual(run.published, ["PASSENGER_REQUEST_UPDATED", "NOTIFICATION"])
  assert.ok(
    run.order.indexOf("log.create") <
      run.order.indexOf("publish:PASSENGER_REQUEST_UPDATED"),
    "лог пишется до публикации"
  )
  assert.ok(
    run.order.indexOf("publish:PASSENGER_REQUEST_UPDATED") <
      run.order.indexOf("notification.create"),
    "публикация раньше сайтового уведомления"
  )
})

// ───────────────────── relocatePassengerRequestHotelPeople ────────────────────

test("relocatePassengerRequestHotelPeople: пачка едет одним апдейтом, одним логом, одним уведомлением", async () => {
  const request = requestWithLiving({
    peopleByHotel: [[makePerson(1), makePerson(2), makePerson(3)], []]
  })

  const run = await runFapMutation(
    "relocatePassengerRequestHotelPeople",
    {
      requestId: "req-1",
      fromHotelIndex: 0,
      toHotelIndex: 1,
      personIndexes: [0, 2],
      reason: "переезд",
      movedAt: MOVED_AT
    },
    { request }
  )

  assert.equal(run.written.length, 1)
  const hotels = run.written[0].livingService.hotels
  assert.deepEqual(hotels[0].people.map((p) => p.fullName), ["П2"])
  // Переселённые дописываются В КОНЕЦ списка целевой гостиницы, в порядке
  // исходного списка (не порядка обхода по убыванию индексов).
  assert.deepEqual(hotels[1].people.map((p) => p.fullName), ["П1", "П3"])

  assert.equal(run.logged.length, 1)
  assert.equal(run.logged[0].action, "relocate_passenger_request_hotel_people")
  assert.equal(run.logged[0].description, "Массовое переселение между гостиницами ФАП")
  assert.equal(
    run.logged[0].fulldescription,
    "Пользователь Диспетчер Тестовый переселил пассажиров (2) в ФАП TEST001 из гостиницы Азия в Чаплан"
  )

  assert.equal(run.notified.length, 1)
  assert.equal(
    run.notified[0].description.action,
    "update_hotel_chess_passenger_request"
  )
  assert.match(run.notified[0].description.description, /переселено пассажиров: <span[^>]*>2</)
  assert.deepEqual(run.published, ["PASSENGER_REQUEST_UPDATED", "NOTIFICATION"])
})

test("переселение: одиночная и пакетная при массиве из одного дают идентичный документ", async () => {
  const args = {
    requestId: "req-1",
    fromHotelIndex: 0,
    toHotelIndex: 1,
    reason: "переезд",
    movedAt: MOVED_AT
  }

  const single = await runFapMutation("relocatePassengerRequestHotelPerson", {
    ...args,
    personIndex: 0
  })
  const bulk = await runFapMutation("relocatePassengerRequestHotelPeople", {
    ...args,
    personIndexes: [0]
  })

  assert.deepEqual(bulk.written, single.written)
})

// ─────────────────────── evictPassengerRequestHotelPerson ─────────────────────

test("evictPassengerRequestHotelPerson: документ, лог, уведомление, публикация", async () => {
  const run = await runFapMutation("evictPassengerRequestHotelPerson", {
    requestId: "req-1",
    hotelIndex: 0,
    personIndex: 0,
    reason: "выселение",
    evictedAt: MOVED_AT
  })

  assert.equal(run.written.length, 1)
  assert.deepEqual(Object.keys(run.written[0]), ["livingService"])
  const living = run.written[0].livingService
  assert.deepEqual(living.hotels.map((h) => h.people.length), [0, 0])
  // Выселенный не удаляется бесследно: он уходит в evictions вместе с
  // гостиницей, причиной и датой, а его открытый интервал закрывается.
  assert.deepEqual(living.evictions, [
    {
      person: {
        personId: "<UUID>",
        fullName: "Иванов Иван",
        personType: "PASSENGER",
        personCategory: "ADULT",
        roomNumber: "101",
        arrival: null,
        departure: null,
        roomCategory: null,
        roomKind: null,
        airlinePersonalId: null,
        accommodationChesses: [
          {
            hotelIndex: 0,
            hotelName: "Азия",
            startAt: "<DATE>",
            endAt: "<DATE>",
            reason: "выселение"
          }
        ]
      },
      hotelIndex: 0,
      hotelName: "Азия",
      reason: "выселение",
      evictedAt: "<DATE>"
    }
  ])

  assert.equal(run.logged.length, 1)
  assert.equal(run.logged[0].action, "evict_passenger_request_hotel_person")
  assert.equal(run.logged[0].description, "Пассажир выселен из гостиницы ФАП")
  assert.equal(
    run.logged[0].fulldescription,
    "Пользователь Диспетчер Тестовый выселил пассажира из гостиницы Азия в ФАП TEST001"
  )

  assert.equal(run.notified.length, 1)
  assert.equal(
    run.notified[0].description.action,
    "update_hotel_chess_passenger_request"
  )
  assert.deepEqual(run.notified[0].hotel, { connect: { id: "hotel-1" } })
  assert.deepEqual(run.published, ["PASSENGER_REQUEST_UPDATED", "NOTIFICATION"])
})

// ─────────────────────── evictPassengerRequestHotelPeople ─────────────────────

test("evictPassengerRequestHotelPeople: пачка едет одним апдейтом, одним логом, одним уведомлением", async () => {
  const request = requestWithLiving({
    peopleByHotel: [[makePerson(1), makePerson(2), makePerson(3)], []]
  })

  const run = await runFapMutation(
    "evictPassengerRequestHotelPeople",
    {
      requestId: "req-1",
      hotelIndex: 0,
      personIndexes: [0, 1, 2],
      reason: "выселение",
      evictedAt: MOVED_AT
    },
    { request }
  )

  assert.equal(run.written.length, 1)
  const living = run.written[0].livingService
  assert.deepEqual(living.hotels[0].people, [])
  assert.deepEqual(living.evictions.map((e) => e.person.fullName), ["П1", "П2", "П3"])

  assert.equal(run.logged.length, 1, "на пачку — один лог, а не по логу на человека")
  assert.equal(run.logged[0].action, "evict_passenger_request_hotel_people")
  assert.equal(run.logged[0].description, "Массовое выселение из гостиницы ФАП")
  assert.equal(
    run.logged[0].fulldescription,
    "Пользователь Диспетчер Тестовый выселил пассажиров (3) из гостиницы Азия в ФАП TEST001"
  )

  assert.equal(run.notified.length, 1, "на пачку — одно уведомление")
  assert.deepEqual(run.published, ["PASSENGER_REQUEST_UPDATED", "NOTIFICATION"])
})

test("выселение: одиночное и пакетное при массиве из одного дают идентичный документ", async () => {
  const args = {
    requestId: "req-1",
    hotelIndex: 0,
    reason: "выселение",
    evictedAt: MOVED_AT
  }

  const single = await runFapMutation("evictPassengerRequestHotelPerson", {
    ...args,
    personIndex: 0
  })
  const bulk = await runFapMutation("evictPassengerRequestHotelPeople", {
    ...args,
    personIndexes: [0]
  })

  assert.deepEqual(bulk.written, single.written)
})

test("выселение [0, 2] из четырёх убирает первого и третьего, а evictions идут в порядке исходного списка", async () => {
  // Обход по УБЫВАНИЮ индексов (normalizeBulkIndexes) — единственный способ не
  // промахнуться на съезжающих индексах: вырезав сперва нулевого, вторым
  // вырезали бы четвёртого вместо третьего. При этом evictions пополняются в
  // порядке ИСХОДНОГО списка (spliceAtIndexes разворачивает removed).
  const request = requestWithLiving({
    peopleByHotel: [
      [makePerson(1), makePerson(2), makePerson(3), makePerson(4)],
      []
    ]
  })

  const run = await runFapMutation(
    "evictPassengerRequestHotelPeople",
    {
      requestId: "req-1",
      hotelIndex: 0,
      personIndexes: [0, 2],
      reason: "выселение",
      evictedAt: MOVED_AT
    },
    { request }
  )

  const living = run.written[0].livingService
  assert.deepEqual(
    living.hotels[0].people.map((p) => p.fullName),
    ["П2", "П4"],
    "в гостинице остались второй и четвёртый"
  )
  assert.deepEqual(
    living.evictions.map((e) => e.person.fullName),
    ["П1", "П3"],
    "evictions — в порядке исходного списка, а не порядка обхода [2, 0]"
  )
})

// ────────────────────────── статус услуги проживания ──────────────────────────

test("переселение НЕ трогает статус услуги: он уносится из prev как есть", async () => {
  // recomputeServiceStatus в ветке переселения не вызывается вовсе — число
  // заселённых по заявке не меняется, меняется только их распределение.
  const request = requestWithLiving({
    status: "COMPLETED",
    times: { createdAt: "2026-08-01T10:00:00.000Z", finishedAt: "2026-08-02T10:00:00.000Z" },
    plan: { enabled: true, peopleCount: 4 },
    peopleByHotel: [[makePerson(1)], []]
  })

  const run = await runFapMutation(
    "relocatePassengerRequestHotelPeople",
    {
      requestId: "req-1",
      fromHotelIndex: 0,
      toHotelIndex: 1,
      personIndexes: [0],
      reason: "переезд",
      movedAt: MOVED_AT
    },
    { request }
  )

  assert.equal(run.written[0].livingService.status, "COMPLETED")
  assert.deepEqual(run.written[0].livingService.times, {
    createdAt: "<DATE>",
    finishedAt: "<DATE>"
  })
})

test("выселение статус услуги меняет: падение факта ниже плана переоткрывает COMPLETED", async () => {
  const request = requestWithLiving({
    status: "COMPLETED",
    times: { createdAt: "2026-08-01T10:00:00.000Z", finishedAt: "2026-08-02T10:00:00.000Z" },
    plan: { enabled: true, peopleCount: 3 },
    peopleByHotel: [
      [makePerson(1), makePerson(2), makePerson(3), makePerson(4)],
      []
    ]
  })

  const run = await runFapMutation(
    "evictPassengerRequestHotelPeople",
    {
      requestId: "req-1",
      hotelIndex: 0,
      personIndexes: [0, 1],
      reason: "выселение",
      evictedAt: MOVED_AT
    },
    { request }
  )

  const living = run.written[0].livingService
  assert.equal(living.status, "IN_PROGRESS")
  assert.deepEqual(living.times, {
    createdAt: "<DATE>",
    inProgressAt: "<DATE>",
    finishedAt: null
  })
})

test("выселение пересчитывает статус ОДИН раз по итогу пачки, а не по человеку", async () => {
  // Разводящий случай: план 1 человек, статус NEW, в гостинице двое, выселяем
  // обоих. По итогу пачки (2 → 0) движок остаётся в NEW.
  // Поштучный цикл дал бы другой ответ: шаг 2 → 1 поднял бы услугу в
  // IN_PROGRESS и тут же в COMPLETED (факт 1 >= план 1), а шаг 1 → 0
  // переоткрыл бы её в IN_PROGRESS с finishedAt: null. Разница видна в
  // документе — значит вход recomputeServiceStatus именно (2, 0).
  const request = requestWithLiving({
    status: "NEW",
    times: {},
    plan: { enabled: true, peopleCount: 1 },
    peopleByHotel: [[makePerson(1), makePerson(2)], []]
  })

  const run = await runFapMutation(
    "evictPassengerRequestHotelPeople",
    {
      requestId: "req-1",
      hotelIndex: 0,
      personIndexes: [0, 1],
      reason: "выселение",
      evictedAt: MOVED_AT
    },
    { request }
  )

  const living = run.written[0].livingService
  assert.equal(living.status, "NEW")
  assert.deepEqual(living.times, {})
  assert.equal(run.written.length, 1, "один апдейт на всю пачку")
})

// ──────────────────────────── вместимость и интервалы ─────────────────────────

test("лимита вместимости при переселении нет: в гостиницу на 2 места переселяют третьего", async () => {
  // Заказано 2 места, заселены двое — переселение третьего проходит. Ограничение
  // снято сознательно: перебор надо иметь возможность перераспределить между
  // гостиницами, а не только выселять.
  const request = requestWithLiving({
    peopleByHotel: [[makePerson(1)], [makePerson(2), makePerson(3)]]
  })

  const run = await runFapMutation(
    "relocatePassengerRequestHotelPerson",
    {
      requestId: "req-1",
      fromHotelIndex: 0,
      toHotelIndex: 1,
      personIndex: 0,
      reason: "переезд",
      movedAt: MOVED_AT
    },
    { request }
  )

  const target = run.written[0].livingService.hotels[1]
  assert.equal(target.peopleCount, 2, "заказ мест не меняется")
  assert.deepEqual(target.people.map((p) => p.fullName), ["П2", "П3", "П1"])
})

test("closeOpenChess: закрывается ПОСЛЕДНИЙ интервал без endAt, новый открывается на целевой гостинице", async () => {
  // У гостя три интервала, из них два без endAt (легаси-аномалия). Поиск идёт
  // с конца, поэтому закрывается только последний открытый; первый остаётся
  // висеть открытым.
  const request = requestWithLiving({
    peopleByHotel: [
      [
        makePerson(1, {
          chesses: [
            {
              hotelIndex: 0,
              hotelName: "Азия",
              startAt: "2026-08-01T10:00:00.000Z",
              endAt: null,
              reason: null
            },
            {
              hotelIndex: 0,
              hotelName: "Азия",
              startAt: "2026-08-02T10:00:00.000Z",
              endAt: "2026-08-03T10:00:00.000Z",
              reason: "закрыт"
            },
            {
              hotelIndex: 0,
              hotelName: "Азия",
              startAt: "2026-08-04T12:00:00.000Z",
              endAt: null,
              reason: null
            }
          ]
        })
      ],
      []
    ]
  })

  const run = await runRaw(
    "relocatePassengerRequestHotelPerson",
    {
      requestId: "req-1",
      fromHotelIndex: 0,
      toHotelIndex: 1,
      personIndex: 0,
      reason: "переезд",
      movedAt: MOVED_AT
    },
    { request }
  )

  const chesses = run.living.hotels[1].people[0].accommodationChesses
  assert.equal(chesses.length, 4)
  assert.equal(chesses[0].endAt, null, "первый открытый интервал не трогается")
  assert.equal(chesses[1].endAt, "2026-08-03T10:00:00.000Z", "закрытый не трогается")
  assert.equal(
    chesses[2].endAt.toISOString(),
    MOVED_AT,
    "последний открытый закрыт датой переселения"
  )
  assert.equal(chesses[2].reason, null, "причина при закрытии переселением НЕ пишется")
  assert.deepEqual(
    {
      hotelIndex: chesses[3].hotelIndex,
      hotelName: chesses[3].hotelName,
      startAt: chesses[3].startAt.toISOString(),
      endAt: chesses[3].endAt,
      reason: chesses[3].reason
    },
    {
      hotelIndex: 1,
      hotelName: "Чаплан",
      startAt: MOVED_AT,
      endAt: null,
      reason: "переезд"
    }
  )
})

test("ДЕФЕКТ №21: у гостя без accommodationChesses переселение задним числом открывает интервал временем мутации", async () => {
  // Ветка «chesses.length === 0 → создать интервал со startAt = relocationDate»
  // недостижима: ensureHotelPerson прогоняет гостя через
  // ensureAccommodationChesses, а тот всегда возвращает массив длиной ≥ 1 и
  // проставляет startAt = new Date() — время мутации. В итоге у переселения
  // задним числом открывающий интервал НАЧИНАЕТСЯ позже, чем ЗАКАНЧИВАЕТСЯ.
  // Реестр дефектов спеки, №21. При починке этот тест обязан измениться.
  const pastMovedAt = "2026-07-01T09:00:00.000Z"
  const request = requestWithLiving({
    peopleByHotel: [[makePerson(1, { chesses: null })], []]
  })

  const run = await runRaw(
    "relocatePassengerRequestHotelPerson",
    {
      requestId: "req-1",
      fromHotelIndex: 0,
      toHotelIndex: 1,
      personIndex: 0,
      reason: "переезд",
      movedAt: pastMovedAt
    },
    { request }
  )

  const chesses = run.living.hotels[1].people[0].accommodationChesses
  assert.equal(chesses.length, 2)
  assert.equal(chesses[0].hotelIndex, 0)
  assert.notEqual(
    chesses[0].startAt.toISOString(),
    pastMovedAt,
    "открывающая дата НЕ равна movedAt"
  )
  assert.ok(
    Date.now() - chesses[0].startAt.getTime() < 60_000,
    "открывающая дата равна времени мутации"
  )
  assert.equal(chesses[0].endAt.toISOString(), pastMovedAt)
  assert.ok(
    chesses[0].endAt.getTime() < chesses[0].startAt.getTime(),
    "интервал закрыт раньше, чем начат"
  )
  // Второй интервал (целевая гостиница) датирован корректно — дефект только в
  // синтезированном первом.
  assert.equal(chesses[1].startAt.toISOString(), pastMovedAt)
})

// ───────────────────────── маршрутизация письма ──────────────────────────────

test("пакетные экшены переселения и выселения входят в HOTEL_CHESS_LOG_ACTIONS наравне с одиночными", async () => {
  // resolveEmailActionForLog — чистая функция, оснастки не требует. Раньше в
  // множестве лежали только ОДИНОЧНЫЕ экшены, а пакетные уходили общей веткой
  // «обновление ФАП»: не тот шаблон письма (emailExtras с hotelName /
  // personName выбрасывались) и, что существеннее, не тот флаг меню при
  // фильтрации получателей — отдел, отключивший обновления, но оставивший
  // изменение размещения, писем о переселении не получал вовсе. Фронт зовёт
  // ТОЛЬКО пакетные мутации, так что это касалось всех боевых переселений и
  // выселений. Теперь обе формы дают ветку «шахматка гостиницы».
  assert.equal(
    resolveEmailActionForLog("relocate_passenger_request_hotel_person"),
    "update_hotel_chess_passenger_request"
  )
  assert.equal(
    resolveEmailActionForLog("evict_passenger_request_hotel_person"),
    "update_hotel_chess_passenger_request"
  )

  assert.equal(
    resolveEmailActionForLog("relocate_passenger_request_hotel_people"),
    "update_hotel_chess_passenger_request"
  )
  assert.equal(
    resolveEmailActionForLog("evict_passenger_request_hotel_people"),
    "update_hotel_chess_passenger_request"
  )
})

test("у одиночной и пакетной пары совпадают и САЙТОВОЕ уведомление, и маршрут письма", async () => {
  // Сайтовые уведомления не расходились никогда: в prisma.notification.create и
  // одиночная, и пакетная кладут action update_hotel_chess_passenger_request
  // захардкоженным. Разъезжался только маршрут ПИСЬМА — он собирается из слага
  // ЛОГА, а слаги логов у пары разные, и пакетного в HOTEL_CHESS_LOG_ACTIONS не
  // было. Теперь есть: слаги логов по-прежнему разные, но оба канала сходятся.
  const single = await runFapMutation("evictPassengerRequestHotelPerson", {
    requestId: "req-1",
    hotelIndex: 0,
    personIndex: 0,
    reason: "выселение"
  })
  const bulk = await runFapMutation("evictPassengerRequestHotelPeople", {
    requestId: "req-1",
    hotelIndex: 0,
    personIndexes: [0],
    reason: "выселение"
  })

  assert.equal(
    single.notified[0].description.action,
    bulk.notified[0].description.action
  )
  assert.notEqual(single.logged[0].action, bulk.logged[0].action)
  assert.equal(
    resolveEmailActionForLog(single.logged[0].action),
    resolveEmailActionForLog(bulk.logged[0].action)
  )
})

// ──────────────────────────────── валидация ──────────────────────────────────

test("переселение в ту же гостиницу отбивается", async () => {
  await assert.rejects(
    () =>
      runFapMutation("relocatePassengerRequestHotelPerson", {
        requestId: "req-1",
        fromHotelIndex: 0,
        toHotelIndex: 0,
        personIndex: 0,
        reason: "переезд"
      }),
    /fromHotelIndex and toHotelIndex must be different/
  )
})

test("пустая причина отбивается во всех четырёх мутациях", async () => {
  const cases = [
    [
      "relocatePassengerRequestHotelPerson",
      { requestId: "req-1", fromHotelIndex: 0, toHotelIndex: 1, personIndex: 0, reason: " " }
    ],
    [
      "relocatePassengerRequestHotelPeople",
      { requestId: "req-1", fromHotelIndex: 0, toHotelIndex: 1, personIndexes: [0], reason: " " }
    ],
    [
      "evictPassengerRequestHotelPerson",
      { requestId: "req-1", hotelIndex: 0, personIndex: 0, reason: " " }
    ],
    [
      "evictPassengerRequestHotelPeople",
      { requestId: "req-1", hotelIndex: 0, personIndexes: [0], reason: " " }
    ]
  ]

  for (const [name, args] of cases) {
    await assert.rejects(() => runFapMutation(name, args), /Reason is required/, name)
  }
})

test("пустой список пассажиров отбивается у обеих пакетных мутаций", async () => {
  await assert.rejects(
    () =>
      runFapMutation("relocatePassengerRequestHotelPeople", {
        requestId: "req-1",
        fromHotelIndex: 0,
        toHotelIndex: 1,
        personIndexes: [],
        reason: "переезд"
      }),
    /Не выбран ни один пассажир/
  )
  await assert.rejects(
    () =>
      runFapMutation("evictPassengerRequestHotelPeople", {
        requestId: "req-1",
        hotelIndex: 0,
        personIndexes: [],
        reason: "выселение"
      }),
    /Не выбран ни один пассажир/
  )
})

test("пачка применяется целиком либо никак: один плохой индекс не оставляет следов", async () => {
  const request = requestWithLiving({
    peopleByHotel: [[makePerson(1), makePerson(2)], []]
  })

  const run = await runRaw(
    "evictPassengerRequestHotelPeople",
    {
      requestId: "req-1",
      hotelIndex: 0,
      personIndexes: [0, 99],
      reason: "выселение"
    },
    { request }
  )

  assert.match(run.error.message, /Invalid personIndex/)
  assert.equal(run.double.callsTo("passengerRequest", "update").length, 0)
  assert.equal(run.double.callsTo("log", "create").length, 0)
  assert.equal(run.double.callsTo("notification", "create").length, 0)
  assert.equal(run.published.length, 0)
})

test("аутентификация: без субъекта мутация не выполняется", async () => {
  await assert.rejects(
    () =>
      runFapMutation(
        "evictPassengerRequestHotelPeople",
        { requestId: "req-1", hotelIndex: 0, personIndexes: [0], reason: "выселение" },
        { context: {} }
      ),
    /Unauthorized/
  )
})

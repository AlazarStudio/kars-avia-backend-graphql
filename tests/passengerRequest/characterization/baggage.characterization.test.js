// Характеризационные тесты группы «Доставка багажа»: заведение поездки,
// удаление, правка, приём заказа водителем и отметка доставки выполненной.
//
// Фиксируют поведение КАК ЕСТЬ, включая дефекты. Тест, закрепляющий дефект,
// помечен номером из реестра спеки — при починке дефекта обязан измениться
// именно он.
//
// Доставка багажа — копия трансфера, разошедшаяся с оригиналом. Половина
// тестов здесь парная: рядом с багажной мутацией прогоняется трансферный
// близнец на том же входе, чтобы расхождение двух копий одного правила было
// зафиксировано, а не выведено из чтения кода.

import test from "node:test"
import assert from "node:assert/strict"
import resolvers from "../../../resolvers/passengerRequest/passengerRequest.resolver.js"
import { installPrismaDouble } from "../../helpers/prismaDouble.js"
import { installPubsubSpy, releasePubsubAfterTests } from "../../helpers/fapHarness.js"
import { runFapMutation } from "../../helpers/runFapMutation.js"
import {
  resolveEmailActionForLog,
  getDispatcherFallbackForPassengerEmail
} from "../../../services/notification/passengerRequestEmailActions.js"
import { makeRequest, makeContext } from "../fixtures/passengerRequest.js"

// Обязательно в каждом файле, импортирующем резолвер: иначе при заданном
// REDIS_URL клиенты Redis удержат процесс и раннер не завершится.
releasePubsubAfterTests()

// Общий runFapMutation отдаёт снимок, прогнанный через normalizeSnapshot: любая
// дата — «<DATE>», любой uuid — «<UUID>». Половине тестов этой группы нужно
// ровно обратное: отличить СТАРУЮ дату от СВЕЖЕЙ (дефект №12 в том и состоит,
// что старая перезаписывается). Поэтому рядом стоит сырой стенд, отдающий
// args.data как есть.
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
    data: updates.length ? updates[updates.length - 1].args.data : null
  }
}

// Заведомо старая отметка времени: если она уцелела — поле не переписывали.
const OLD = "2020-01-01T00:00:00.000Z"

// Заявка с багажной услугой в заданном состоянии. Остальные услуги фикстуры
// не трогаем — мутации группы к ним не обращаются.
const withBaggage = (baggage) =>
  makeRequest({
    baggageDeliveryService: {
      plan: { enabled: true, peopleCount: 2 },
      status: "NEW",
      times: {},
      drivers: [],
      ...baggage
    }
  })

// Поездка водителя в том виде, в каком она лежит в базе.
const makeTrip = (overrides = {}) => ({
  id: "trip-1",
  fullName: "Водитель",
  phone: null,
  vehicleType: null,
  peopleCount: null,
  reportCost: null,
  deliveryCompletedAt: null,
  people: [],
  ...overrides
})

// Пассажир поездки в том виде, в каком он лежит в базе.
const makeTripPerson = (overrides = {}) => ({
  personId: null,
  fullName: "Сидоров Сидор",
  phone: null,
  personType: "PASSENGER",
  personCategory: "ADULT",
  airlinePersonalId: null,
  baggageTags: [],
  reportCost: null,
  addressTo: null,
  ...overrides
})

// ─────────────────── addPassengerRequestBaggageDriver ───────────────────

test("addPassengerRequestBaggageDriver: документ, лог, отсутствие уведомления, публикация", async () => {
  const run = await runFapMutation("addPassengerRequestBaggageDriver", {
    requestId: "req-1",
    driver: {
      fullName: "  Водитель Багаж  ",
      phone: "  +7900  ",
      addressFrom: "   ",
      description: "срочно"
    }
  })

  assert.equal(run.written.length, 1)
  assert.deepEqual(Object.keys(run.written[0]), ["baggageDeliveryService"])
  const service = run.written[0].baggageDeliveryService

  // Первая поездка при статусе NEW поднимает услугу до ACCEPTED.
  assert.equal(service.status, "ACCEPTED")
  assert.deepEqual(service.times, { acceptedAt: "<DATE>" })
  assert.deepEqual(service.plan, { enabled: true, peopleCount: 2 }, "план не трогается")
  assert.equal(service.drivers.length, 1)

  const trip = service.drivers[0]
  assert.equal(trip.fullName, "Водитель Багаж", "имя тримится")
  assert.equal(trip.phone, "+7900")
  assert.equal(trip.addressFrom, null, "пробельная строка → null")
  assert.equal(trip.description, "срочно")
  assert.deepEqual(trip.people, [])
  assert.equal(trip.reportCost, null, "суммы нет: считать не из чего")
  assert.equal(trip.id, "<UUID>", "поездке выдаётся собственный id")
  // Ссылка водителя выпускается на индекс И на id, вид услуги — baggage.
  assert.match(trip.linkPWA, /serviceKind=baggage/)
  assert.match(trip.linkPWA, /driverIndex=0/)

  assert.equal(run.logged.length, 1)
  assert.equal(run.logged[0].action, "add_passenger_request_baggage_driver")
  assert.equal(run.logged[0].description, "Водитель добавлен в доставку багажа ФАП")
  assert.equal(
    run.logged[0].fulldescription,
    "Пользователь Диспетчер Тестовый добавил водителя в доставку багажа ФАП TEST001"
  )
  assert.equal(run.notified.length, 0, "сайтового уведомления по багажу нет")
  assert.deepEqual(run.published, ["PASSENGER_REQUEST_UPDATED"])
})

test("addPassengerRequestBaggageDriver требует имя водителя — но заявку успевает прочитать", async () => {
  const run = await runRaw("addPassengerRequestBaggageDriver", {
    requestId: "req-1",
    driver: { fullName: "   " }
  })

  assert.match(run.error.message, /Driver fullName is required/)
  assert.equal(run.double.callsTo("passengerRequest", "findUnique").length, 1)
  assert.equal(run.double.callsTo("passengerRequest", "update").length, 0)
  assert.equal(run.double.callsTo("log", "create").length, 0)
  assert.equal(run.published.length, 0)
})

test("багажный add бережёт существующий acceptedAt наравне с трансферным", async () => {
  // Дефект №12 реестра починен: багаж собирал times вручную
  // ({ ...prev.times, acceptedAt: now }) и затирал отметку, трансфер звал
  // updateTimes и ставил её только при отсутствии. Теперь оба зовут updateTimes
  // и на одном входе дают одинаковый документ.
  // ⚠️ Дефект был достижим рутинно, вопреки прежнему комментарию:
  // removePassengerRequestBaggageDriver при удалении последней поездки
  // возвращает статус в NEW, но times сохраняет — цикл «добавил → удалил →
  // добавил» заходил в эту ветку с непустым acceptedAt.
  const baggage = await runRaw(
    "addPassengerRequestBaggageDriver",
    { requestId: "req-1", driver: { fullName: "Водитель Багаж" } },
    {
      request: withBaggage({
        status: "NEW",
        times: { createdAt: OLD, acceptedAt: OLD },
        drivers: []
      })
    }
  )

  const times = baggage.data.baggageDeliveryService.times
  assert.equal(times.acceptedAt, OLD, "старая отметка сохранена")
  assert.equal(times.createdAt, OLD, "остальные отметки уцелели")

  const transfer = await runRaw(
    "addPassengerRequestDriver",
    { requestId: "req-1", driver: { fullName: "Водитель Трансфер" } },
    {
      request: makeRequest({
        transferService: {
          plan: { enabled: true, peopleCount: 4 },
          status: "NEW",
          times: { createdAt: OLD, acceptedAt: OLD },
          drivers: []
        }
      })
    }
  )

  assert.equal(
    transfer.data.transferService.times.acceptedAt,
    OLD,
    "трансферный близнец старую отметку сохраняет"
  )
})

test("багажный add ставит acceptedAt, когда отметки ещё нет", async () => {
  // Обратная проверка к №12: правка бережёт существующую отметку и при этом
  // не разучилась ставить новую. Первый водитель у услуги в NEW без acceptedAt
  // обязан перевести её в ACCEPTED и проставить время.
  const run = await runRaw(
    "addPassengerRequestBaggageDriver",
    { requestId: "req-1", driver: { fullName: "Водитель Багаж" } },
    {
      request: withBaggage({
        status: "NEW",
        times: { createdAt: OLD },
        drivers: []
      })
    }
  )

  const times = run.data.baggageDeliveryService.times
  assert.equal(run.data.baggageDeliveryService.status, "ACCEPTED")
  assert.ok(times.acceptedAt instanceof Date, "отметка проставлена")
  assert.notEqual(times.acceptedAt, OLD)
  assert.equal(times.createdAt, OLD, "остальные отметки уцелели")
})

test("гвард status === NEW ограничивает ветку приёма заказа", async () => {
  // Ветка isFirstDriver && NEW — единственная, которая трогает acceptedAt.
  // Из любого другого статуса она не берётся, и times уходят как есть.
  // Гвард закрепляем отдельно: починка дефекта №12 его не трогала.
  const run = await runRaw(
    "addPassengerRequestBaggageDriver",
    { requestId: "req-1", driver: { fullName: "Водитель Багаж" } },
    {
      request: withBaggage({
        status: "ACCEPTED",
        times: { acceptedAt: OLD },
        drivers: []
      })
    }
  )

  assert.equal(run.data.baggageDeliveryService.status, "ACCEPTED")
  assert.deepEqual(run.data.baggageDeliveryService.times, { acceptedAt: OLD })
})

test("расхождение гвардов: багаж не откатывает IN_PROGRESS, трансфер откатывает в ACCEPTED", async () => {
  // Багаж гвардит isFirstDriver && prev.status === "NEW", трансфер — только
  // driverIndex === 0. Услуга, уже находящаяся в работе, но оставшаяся без
  // поездок, у трансфера регрессирует в ACCEPTED, а у багажа нет.
  const inProgress = {
    plan: { enabled: true, peopleCount: 4 },
    status: "IN_PROGRESS",
    times: { inProgressAt: OLD },
    drivers: []
  }

  const baggage = await runRaw(
    "addPassengerRequestBaggageDriver",
    { requestId: "req-1", driver: { fullName: "Водитель Багаж" } },
    { request: makeRequest({ baggageDeliveryService: inProgress }) }
  )
  assert.equal(baggage.data.baggageDeliveryService.status, "IN_PROGRESS")
  assert.deepEqual(baggage.data.baggageDeliveryService.times, { inProgressAt: OLD })

  const transfer = await runRaw(
    "addPassengerRequestDriver",
    { requestId: "req-1", driver: { fullName: "Водитель Трансфер" } },
    { request: makeRequest({ transferService: inProgress }) }
  )
  assert.equal(transfer.data.transferService.status, "ACCEPTED")
  assert.ok(transfer.data.transferService.times.acceptedAt instanceof Date)
})

test("поездка с пассажирами пересчитывает статус услуги прямо при заведении", async () => {
  // План багажа в фикстуре — 2 человека, поездка заводится сразу с двумя:
  // услуга проходит ACCEPTED → IN_PROGRESS → COMPLETED за один вызов.
  const run = await runFapMutation("addPassengerRequestBaggageDriver", {
    requestId: "req-1",
    driver: {
      fullName: "Водитель Багаж",
      people: [{ fullName: "Сидоров Сидор" }, { fullName: "Кузнецов Кузьма" }]
    }
  })

  const service = run.written[0].baggageDeliveryService
  assert.equal(service.status, "COMPLETED")
  assert.deepEqual(service.times, {
    acceptedAt: "<DATE>",
    finishedAt: "<DATE>",
    inProgressAt: "<DATE>"
  })
  assert.equal(service.drivers[0].people.length, 2)
})

test("пассажиры багажа не получают personId и не попадают в savedPassengers", async () => {
  // Принципиальное отличие от трансфера: багажный путь не зовёт ensurePersonId
  // и не сливает ростер. Пассажир доставки остаётся безымянным для системы
  // идентичности — гидрация его не найдёт.
  const baggage = await runFapMutation("addPassengerRequestBaggageDriver", {
    requestId: "req-1",
    driver: { fullName: "Водитель Багаж", people: [{ fullName: "Сидоров Сидор" }] }
  })

  assert.deepEqual(Object.keys(baggage.written[0]), ["baggageDeliveryService"])
  assert.equal(
    baggage.written[0].baggageDeliveryService.drivers[0].people[0].personId,
    null
  )

  // Трансферный путь на том же пассажире делает обратное.
  const transfer = await runFapMutation(
    "addPassengerRequestDriverPerson",
    { requestId: "req-1", driverIndex: 0, person: { fullName: "Сидоров Сидор" } },
    {
      request: makeRequest({
        transferService: {
          plan: { enabled: true, peopleCount: 4 },
          status: "ACCEPTED",
          times: { acceptedAt: OLD },
          drivers: [makeTrip({ id: "t-1", fullName: "Водитель Трансфер" })]
        }
      })
    }
  )

  assert.deepEqual(Object.keys(transfer.written[0]).sort(), [
    "savedPassengers",
    "transferService"
  ])
  assert.equal(
    transfer.written[0].transferService.drivers[0].people[0].personId,
    "<UUID>"
  )
})

test("сумма поездки производная: собирается из people и затирает присланную", async () => {
  const run = await runFapMutation("addPassengerRequestBaggageDriver", {
    requestId: "req-1",
    driver: {
      fullName: "Водитель Багаж",
      // Поля нет в инпуте схемы, но резолвер спредит водителя целиком —
      // и всё равно перетирает сумму расчётной.
      reportCost: 999,
      people: [
        { fullName: "Сидоров Сидор", reportCost: 100.5 },
        { fullName: "Кузнецов Кузьма", reportCost: 200.25 },
        { fullName: "Без цены" }
      ]
    }
  })

  assert.equal(run.written[0].baggageDeliveryService.drivers[0].reportCost, 300.75)
})

// ────────────────── removePassengerRequestBaggageDriver ──────────────────

test("removePassengerRequestBaggageDriver снимает поездку, пересчитывает статус, пишет лог", async () => {
  const run = await runFapMutation(
    "removePassengerRequestBaggageDriver",
    { requestId: "req-1", driverIndex: 0 },
    {
      request: withBaggage({
        plan: { enabled: true, peopleCount: 4 },
        status: "IN_PROGRESS",
        times: { acceptedAt: OLD, inProgressAt: OLD },
        drivers: [
          makeTrip({ id: "t-1", fullName: "Первый", people: [makeTripPerson()] }),
          // У второй поездки id нет — ensureDriverIds выдаст его при записи.
          makeTrip({
            id: undefined,
            fullName: "Второй",
            people: [makeTripPerson({ fullName: "Кузнецов Кузьма" })]
          })
        ]
      })
    }
  )

  const service = run.written[0].baggageDeliveryService
  assert.equal(service.drivers.length, 1)
  assert.equal(service.drivers[0].fullName, "Второй")
  assert.equal(service.drivers[0].id, "<UUID>", "выжившему проставлен id")
  assert.equal(service.status, "IN_PROGRESS")

  assert.equal(run.logged.length, 1)
  assert.equal(run.logged[0].action, "remove_passenger_request_baggage_driver")
  assert.equal(run.logged[0].description, "Водитель удален из доставки багажа ФАП")
  assert.equal(
    run.logged[0].fulldescription,
    "Пользователь Диспетчер Тестовый удалил водителя Первый из доставки багажа ФАП TEST001"
  )
  assert.equal(run.notified.length, 0)
  assert.deepEqual(run.published, ["PASSENGER_REQUEST_UPDATED"])
})

test("удаление последней поездки сбрасывает статус в NEW, а отметки времени оставляет", async () => {
  // Статус откатывается, времена — нет: услуга «новая», но с историей.
  const run = await runRaw(
    "removePassengerRequestBaggageDriver",
    { requestId: "req-1", driverIndex: 0 },
    {
      request: withBaggage({
        status: "COMPLETED",
        times: { acceptedAt: OLD, inProgressAt: OLD, finishedAt: OLD },
        drivers: [makeTrip({ people: [makeTripPerson(), makeTripPerson()] })]
      })
    }
  )

  assert.equal(run.data.baggageDeliveryService.status, "NEW")
  assert.deepEqual(run.data.baggageDeliveryService.times, {
    acceptedAt: OLD,
    inProgressAt: OLD,
    finishedAt: OLD
  })
  assert.deepEqual(run.data.baggageDeliveryService.drivers, [])
})

test("removePassengerRequestBaggageDriver: индекс вне диапазона отбивается до записи", async () => {
  const run = await runRaw(
    "removePassengerRequestBaggageDriver",
    { requestId: "req-1", driverIndex: 1 },
    { request: withBaggage({ drivers: [makeTrip()] }) }
  )

  assert.match(run.error.message, /Invalid driverIndex/)
  assert.equal(run.double.callsTo("passengerRequest", "update").length, 0)
  assert.equal(run.double.callsTo("log", "create").length, 0)
  assert.equal(run.published.length, 0)
})

// ────────────────── updatePassengerRequestBaggageDriver ──────────────────

test("updatePassengerRequestBaggageDriver: скалярный патч, лог с дифом, публикация", async () => {
  const run = await runFapMutation(
    "updatePassengerRequestBaggageDriver",
    {
      requestId: "req-1",
      driverIndex: 0,
      patch: {
        vehicleType: "  Газель  ",
        peopleCount: 3,
        deliveryCompletedAt: "2026-08-05T10:00:00.000Z"
      }
    },
    {
      request: withBaggage({
        status: "ACCEPTED",
        times: { acceptedAt: OLD },
        drivers: [makeTrip()]
      })
    }
  )

  const service = run.written[0].baggageDeliveryService
  const trip = service.drivers[0]
  assert.equal(trip.vehicleType, "Газель")
  assert.equal(trip.peopleCount, 3)
  assert.equal(trip.deliveryCompletedAt, "<DATE>")
  // Патч молчит про пассажиров — статус и времена услуги не пересчитываются.
  assert.equal(service.status, "ACCEPTED")
  assert.deepEqual(service.times, { acceptedAt: "<DATE>" })

  assert.equal(run.logged.length, 1)
  assert.equal(run.logged[0].action, "update_passenger_request_baggage_driver")
  assert.equal(
    run.logged[0].description,
    'Доставка багажа «Водитель»: ожидаемое кол-во пассажиров: — → 3, тип ТС: "" → "Газель", дата доставки: — → 05.08.2026 10:00 UTC'
  )
  assert.equal(run.notified.length, 0)
  assert.deepEqual(run.published, ["PASSENGER_REQUEST_UPDATED"])
})

test("updatePassengerRequestBaggageDriver: пустой патч не пишет, не логирует и не публикует", async () => {
  const run = await runRaw(
    "updatePassengerRequestBaggageDriver",
    { requestId: "req-1", driverIndex: 0, patch: {} },
    { request: withBaggage({ drivers: [makeTrip()] }) }
  )

  assert.equal(run.error, null)
  assert.equal(run.result.id, "req-1", "возвращается прочитанная заявка")
  assert.equal(run.double.callsTo("passengerRequest", "update").length, 0)
  assert.equal(run.double.callsTo("log", "create").length, 0)
  assert.equal(run.published.length, 0)
})

test("нецелой peopleCount молча становится null — трансферный transportedCount на этом падает", async () => {
  // Два противоположных подхода к одному классу поля: багаж чистит вход
  // молча, трансфер бросает ошибку.
  const baggage = await runFapMutation(
    "updatePassengerRequestBaggageDriver",
    { requestId: "req-1", driverIndex: 0, patch: { peopleCount: 2.5 } },
    { request: withBaggage({ drivers: [makeTrip({ peopleCount: 3 })] }) }
  )
  assert.equal(
    baggage.written[0].baggageDeliveryService.drivers[0].peopleCount,
    null
  )
  // Молчаливая чистка доезжает до лога дословно: «→ —».
  assert.equal(
    baggage.logged[0].description,
    "Доставка багажа «Водитель»: ожидаемое кол-во пассажиров: 3 → —"
  )

  await assert.rejects(
    () =>
      runFapMutation(
        "updatePassengerRequestDriver",
        { requestId: "req-1", driverIndex: 0, patch: { transportedCount: 2.5 } },
        {
          request: makeRequest({
            transferService: {
              plan: { enabled: true, peopleCount: 4 },
              status: "ACCEPTED",
              times: { acceptedAt: OLD },
              drivers: [makeTrip()]
            }
          })
        }
      ),
    /transportedCount must be a non-negative integer/
  )
})

test("deliveryCompletedAt: null сбрасывает дату, мусор тоже даёт null", async () => {
  // Семантика патча держится на hasOwnProperty: явный null — это команда
  // «очистить», а не «не трогать». Нераспознанная дата приводится к тому же
  // null молча, ошибки нет.
  for (const value of [null, "не дата"]) {
    const run = await runRaw(
      "updatePassengerRequestBaggageDriver",
      { requestId: "req-1", driverIndex: 0, patch: { deliveryCompletedAt: value } },
      { request: withBaggage({ drivers: [makeTrip({ deliveryCompletedAt: OLD })] }) }
    )

    assert.equal(run.error, null)
    assert.equal(
      run.data.baggageDeliveryService.drivers[0].deliveryCompletedAt,
      null,
      String(value)
    )
  }
})

test("add вообще не нормализует peopleCount: нецелое уходит в документ как есть", async () => {
  // Третий подход к тому же полю в том же сервисе: заведение поездки спредит
  // водителя целиком и в peopleCount не заглядывает, правка — чистит в null.
  const added = await runFapMutation("addPassengerRequestBaggageDriver", {
    requestId: "req-1",
    driver: { fullName: "Водитель Багаж", peopleCount: 2.5 }
  })
  assert.equal(added.written[0].baggageDeliveryService.drivers[0].peopleCount, 2.5)

  const patched = await runFapMutation(
    "updatePassengerRequestBaggageDriver",
    { requestId: "req-1", driverIndex: 0, patch: { peopleCount: 2.5 } },
    { request: withBaggage({ drivers: [makeTrip({ peopleCount: 2.5 })] }) }
  )
  assert.equal(
    patched.written[0].baggageDeliveryService.drivers[0].peopleCount,
    null
  )
})

test("патч без ключа people не трогает ручную сумму поездки", async () => {
  // Сумма пересчитывается ТОЛЬКО когда патч говорит про пассажиров. Легаси-
  // поездка с проставленной вручную суммой переживает правку типа ТС, даже
  // если сумма не сходится с ценами пассажиров.
  const run = await runFapMutation(
    "updatePassengerRequestBaggageDriver",
    { requestId: "req-1", driverIndex: 0, patch: { vehicleType: "Газель" } },
    {
      request: withBaggage({
        plan: { enabled: true, peopleCount: 4 },
        status: "IN_PROGRESS",
        times: { inProgressAt: OLD },
        drivers: [
          makeTrip({
            reportCost: 777,
            people: [makeTripPerson({ reportCost: 10 })]
          })
        ]
      })
    }
  )

  assert.equal(run.written[0].baggageDeliveryService.drivers[0].reportCost, 777)
})

test("patch.people — единственный путь завести пассажира багажа: без personId и без ростера", async () => {
  const run = await runFapMutation(
    "updatePassengerRequestBaggageDriver",
    {
      requestId: "req-1",
      driverIndex: 0,
      patch: {
        people: [
          {
            fullName: "  Сидоров Сидор  ",
            phone: "  +7 900  ",
            seat: "12A",
            baggageTags: ["  AB-1  ", "ab-1", "   ", "AB-2"],
            reportCost: 120.4,
            addressTo: "  ул. Мира  "
          }
        ]
      }
    },
    {
      request: withBaggage({
        plan: { enabled: true, peopleCount: 4 },
        status: "ACCEPTED",
        times: { acceptedAt: OLD },
        drivers: [makeTrip()]
      })
    }
  )

  // savedPassengers в апдейте нет вовсе — ростер заявки о пассажире не узнает.
  assert.deepEqual(Object.keys(run.written[0]), ["baggageDeliveryService"])

  const person = run.written[0].baggageDeliveryService.drivers[0].people[0]
  assert.deepEqual(Object.keys(person), [
    "addressTo",
    "airlinePersonalId",
    "baggageTags",
    "fullName",
    "personCategory",
    "personId",
    "personType",
    "phone",
    "reportCost"
  ])
  assert.equal(person.personId, null, "personId не генерируется")
  assert.equal(person.fullName, "Сидоров Сидор")
  assert.equal(person.phone, "+7 900")
  assert.deepEqual(person.baggageTags, ["AB-1", "AB-2"], "дубли и пустые сняты")
  assert.equal(person.reportCost, 120.4)
  assert.equal(person.addressTo, "ул. Мира")
  assert.equal("seat" in person, false, "белый список снимает посторонние ключи")
})

test("patch.people пересчитывает сумму поездки и статус услуги", async () => {
  const run = await runRaw(
    "updatePassengerRequestBaggageDriver",
    {
      requestId: "req-1",
      driverIndex: 0,
      patch: {
        people: [
          { fullName: "Сидоров Сидор", reportCost: 100 },
          { fullName: "Кузнецов Кузьма", reportCost: 50.5 }
        ]
      }
    },
    {
      request: withBaggage({
        plan: { enabled: true, peopleCount: 2 },
        status: "ACCEPTED",
        times: { acceptedAt: OLD },
        drivers: [makeTrip()]
      })
    }
  )

  const service = run.data.baggageDeliveryService
  assert.equal(service.drivers[0].reportCost, 150.5)
  // План достигнут — услуга автозавершилась, старая отметка уцелела.
  assert.equal(service.status, "COMPLETED")
  assert.equal(service.times.acceptedAt, OLD)
  assert.ok(service.times.inProgressAt instanceof Date)
  assert.ok(service.times.finishedAt instanceof Date)
})

test("updatePassengerRequestBaggageDriver: четыре гварда состояния услуги", async () => {
  const cases = [
    [null, /BaggageDeliveryService not found/],
    [{ plan: { enabled: false, peopleCount: 2 } }, /Service is not enabled/],
    [{ status: "COMPLETED" }, /Service is completed, no updates allowed/],
    [{ status: "CANCELLED" }, /Service is completed, no updates allowed/]
  ]

  for (const [baggage, message] of cases) {
    const request =
      baggage === null
        ? makeRequest({ baggageDeliveryService: null })
        : withBaggage({ drivers: [makeTrip()], ...baggage })

    const run = await runRaw(
      "updatePassengerRequestBaggageDriver",
      { requestId: "req-1", driverIndex: 0, patch: { vehicleType: "Газель" } },
      { request }
    )

    assert.match(run.error.message, message)
    assert.equal(run.double.callsTo("passengerRequest", "update").length, 0)
    assert.equal(run.published.length, 0)
  }
})

// ─────────────────── acceptPassengerRequestBaggageOrder ───────────────────

test("acceptPassengerRequestBaggageOrder переводит услугу в IN_PROGRESS", async () => {
  const run = await runFapMutation(
    "acceptPassengerRequestBaggageOrder",
    { requestId: "req-1", driverIndex: 0 },
    {
      request: withBaggage({
        status: "ACCEPTED",
        times: { acceptedAt: OLD },
        drivers: [makeTrip()]
      })
    }
  )

  const service = run.written[0].baggageDeliveryService
  assert.equal(service.status, "IN_PROGRESS")
  assert.deepEqual(service.times, { acceptedAt: "<DATE>", inProgressAt: "<DATE>" })

  assert.equal(run.logged.length, 1)
  assert.equal(run.logged[0].action, "accept_passenger_request_baggage_order")
  assert.equal(
    run.logged[0].description,
    "Водитель принял заказ на доставку багажа ФАП"
  )
  // Автор в тексте — водитель из документа, а не субъект контекста.
  assert.equal(
    run.logged[0].fulldescription,
    "Водитель Водитель принял заказ на доставку багажа (ФАП TEST001)"
  )
  assert.equal(run.notified.length, 0)
  assert.deepEqual(run.published, ["PASSENGER_REQUEST_UPDATED"])
})

test("acceptPassengerRequestBaggageOrder НЕ проверяет plan.enabled, а update — проверяет", async () => {
  const disabled = {
    plan: { enabled: false, peopleCount: 2 },
    status: "NEW",
    times: {},
    drivers: [makeTrip()]
  }

  const accepted = await runFapMutation(
    "acceptPassengerRequestBaggageOrder",
    { requestId: "req-1", driverIndex: 0 },
    { request: makeRequest({ baggageDeliveryService: disabled }) }
  )
  assert.equal(accepted.written[0].baggageDeliveryService.status, "IN_PROGRESS")

  await assert.rejects(
    () =>
      runFapMutation(
        "updatePassengerRequestBaggageDriver",
        { requestId: "req-1", driverIndex: 0, patch: { vehicleType: "Газель" } },
        { request: makeRequest({ baggageDeliveryService: disabled }) }
      ),
    /Service is not enabled/
  )
})

test("acceptPassengerRequestBaggageOrder не трогает необратимые статусы", async () => {
  for (const status of ["IN_PROGRESS", "COMPLETED", "CANCELLED"]) {
    const run = await runRaw(
      "acceptPassengerRequestBaggageOrder",
      { requestId: "req-1", driverIndex: 0 },
      {
        request: withBaggage({
          status,
          times: { acceptedAt: OLD },
          drivers: [makeTrip()]
        })
      }
    )

    assert.equal(run.data.baggageDeliveryService.status, status)
    assert.deepEqual(run.data.baggageDeliveryService.times, { acceptedAt: OLD })
  }
})

test("acceptPassengerRequestBaggageOrder: свои тексты ошибок — индекс и отсутствие услуги", async () => {
  const outOfRange = await runRaw(
    "acceptPassengerRequestBaggageOrder",
    { requestId: "req-1", driverIndex: 1 },
    { request: withBaggage({ drivers: [makeTrip()] }) }
  )
  // Не «Invalid driverIndex» из общего assertIndex — своя проверка на месте.
  assert.match(outOfRange.error.message, /Driver index out of range/)
  assert.equal(outOfRange.double.callsTo("passengerRequest", "update").length, 0)

  const noService = await runRaw(
    "acceptPassengerRequestBaggageOrder",
    { requestId: "req-1", driverIndex: 0 },
    { request: makeRequest({ baggageDeliveryService: null }) }
  )
  assert.match(noService.error.message, /BaggageDeliveryService not found/)
})

// ───────────── completePassengerRequestBaggageDriverDelivery ─────────────

test("ДЕФЕКТ №14: отметка доставки НЕ пересчитывает статус услуги", async () => {
  // Все поездки услуги отмечены выполненными, план (2 человека) закрыт —
  // и статус всё равно остаётся IN_PROGRESS: мутация пишет только drivers,
  // recomputeServiceStatus не зовёт вовсе. Услуга сама по себе никогда не
  // становится COMPLETED этим путём. Реестр дефектов спеки, №14.
  // При починке этот тест обязан измениться.
  const run = await runRaw(
    "completePassengerRequestBaggageDriverDelivery",
    { requestId: "req-1", driverIndex: 0 },
    {
      request: withBaggage({
        plan: { enabled: true, peopleCount: 2 },
        status: "IN_PROGRESS",
        times: { acceptedAt: OLD, inProgressAt: OLD },
        drivers: [
          makeTrip({ people: [makeTripPerson(), makeTripPerson()] })
        ]
      })
    }
  )

  const service = run.data.baggageDeliveryService
  assert.ok(service.drivers[0].deliveryCompletedAt instanceof Date)
  assert.equal(service.status, "IN_PROGRESS")
  assert.deepEqual(service.times, { acceptedAt: OLD, inProgressAt: OLD })
  assert.equal("finishedAt" in service.times, false)

  assert.equal(
    run.double.callsTo("log", "create")[0].args.data.action,
    "complete_passenger_request_baggage_driver_delivery"
  )
  assert.equal(run.double.callsTo("notification", "create").length, 0)
  assert.deepEqual(
    run.published.map((p) => p.topic),
    ["PASSENGER_REQUEST_UPDATED"]
  )
})

test("отметка доставки не затирает уже проставленную дату и не трогает соседние поездки", async () => {
  const run = await runRaw(
    "completePassengerRequestBaggageDriverDelivery",
    { requestId: "req-1", driverIndex: 0 },
    {
      request: withBaggage({
        status: "IN_PROGRESS",
        times: { inProgressAt: OLD },
        drivers: [
          makeTrip({ id: "t-1", deliveryCompletedAt: OLD }),
          makeTrip({ id: "t-2", fullName: "Второй" })
        ]
      })
    }
  )

  const drivers = run.data.baggageDeliveryService.drivers
  assert.equal(drivers[0].deliveryCompletedAt, OLD, "ручная дата — источник истины")
  assert.equal(drivers[1].deliveryCompletedAt, null, "соседняя поездка не тронута")
})

test("отметка доставки чинит легаси-пассажиров у ВСЕХ поездок, а не только у своей", async () => {
  // normalizeDriversForWrite прогоняется по всему массиву: побочная починка
  // чужих записей — часть поведения этой мутации.
  const run = await runRaw(
    "completePassengerRequestBaggageDriverDelivery",
    { requestId: "req-1", driverIndex: 1 },
    {
      request: withBaggage({
        status: "IN_PROGRESS",
        times: { inProgressAt: OLD },
        drivers: [
          makeTrip({
            id: "t-1",
            people: [
              makeTripPerson({
                baggageTags: null,
                reportCost: -5,
                addressTo: "  ул. Мира  "
              })
            ]
          }),
          makeTrip({ id: "t-2", fullName: "Второй" })
        ]
      })
    }
  )

  const person = run.data.baggageDeliveryService.drivers[0].people[0]
  assert.deepEqual(person.baggageTags, [], "null → пустой список")
  assert.equal(person.reportCost, null, "отрицательная цена → null")
  assert.equal(person.addressTo, "ул. Мира")
})

test("completePassengerRequestBaggageDriverDelivery: без услуги жалуется на индекс, а не на услугу", async () => {
  // Отличие от acceptPassengerRequestBaggageOrder: тот сначала проверяет
  // наличие услуги, этот сразу читает drivers через ?. и падает на индексе.
  const run = await runRaw(
    "completePassengerRequestBaggageDriverDelivery",
    { requestId: "req-1", driverIndex: 0 },
    { request: makeRequest({ baggageDeliveryService: null }) }
  )

  assert.match(run.error.message, /Driver index out of range/)
  assert.equal(run.double.callsTo("passengerRequest", "update").length, 0)
  assert.equal(run.published.length, 0)
})

// ─────────────────────────── почта и охрана ───────────────────────────

test("маршрутизация писем: все пять мутаций группы дают update_passenger_request", async () => {
  // Письма через двойник не видны (ветка в try/catch), поэтому маршрут
  // закрепляем чистой функцией — она же вызывается из logPassengerRequestAction.
  const actions = [
    "add_passenger_request_baggage_driver",
    "remove_passenger_request_baggage_driver",
    "update_passenger_request_baggage_driver",
    "accept_passenger_request_baggage_order",
    "complete_passenger_request_baggage_driver_delivery"
  ]

  for (const action of actions) {
    assert.equal(resolveEmailActionForLog(action), "update_passenger_request", action)
  }
  assert.equal(
    getDispatcherFallbackForPassengerEmail("update_passenger_request"),
    "EMAIL_RECEIVER"
  )
})

test("аутентификация: без субъекта ни одна мутация группы не выполняется", async () => {
  const calls = [
    ["addPassengerRequestBaggageDriver", { requestId: "req-1", driver: { fullName: "В" } }],
    ["removePassengerRequestBaggageDriver", { requestId: "req-1", driverIndex: 0 }],
    [
      "updatePassengerRequestBaggageDriver",
      { requestId: "req-1", driverIndex: 0, patch: { vehicleType: "Газель" } }
    ],
    ["acceptPassengerRequestBaggageOrder", { requestId: "req-1", driverIndex: 0 }],
    [
      "completePassengerRequestBaggageDriverDelivery",
      { requestId: "req-1", driverIndex: 0 }
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

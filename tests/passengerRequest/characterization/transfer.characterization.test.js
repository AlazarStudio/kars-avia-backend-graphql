// Характеризационные тесты группы «Трансфер (водители)»: добавление, правка и
// удаление водителя, а также пассажиров у водителя — поштучно и пачкой.
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
import { ensureDriverIds } from "../../../services/passengerRequest/serviceDrivers.js"
import { transferFactCount } from "../../../services/passengerRequest/serviceStatus.js"
import { resolveEmailActionForLog } from "../../../services/notification/passengerRequestEmailActions.js"
import { makeRequest, makeContext } from "../fixtures/passengerRequest.js"

// Обязательно в каждом файле, импортирующем резолвер: иначе при заданном
// REDIS_URL клиенты Redis удержат процесс и раннер не завершится.
releasePubsubAfterTests()

// Общий хелпер нормализует снимок: uuid превращается в «<UUID>», и сравнить
// id водителя со ссылкой, которая этот id несёт, по нему нельзя. Части тестов
// нужен ещё и след УПАВШЕЙ мутации. Форму runFapMutation ради этого не
// расширяем — она общая на все группы, поэтому сырой стенд ставим здесь.
async function runRaw(
  name,
  args,
  { request = makeRequest(), context = makeContext(), overrides = {} } = {}
) {
  const double = installPrismaDouble({
    documents: { passengerRequest: request },
    overrides
  })
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

const rawWritten = (double) =>
  double.callsTo("passengerRequest", "update").map((c) => c.args.data)

const ADULT_ID = "aaaaaaaa-0000-4000-8000-000000000001"

// Заявка с одним водителем в трансфере прилёта. Драйверы адресуются индексом,
// поэтому состав списка задаём явно в каждом тесте.
const withTransfer = (service) =>
  makeRequest({
    transferService: {
      plan: { enabled: true, peopleCount: 4 },
      status: "NEW",
      times: {},
      drivers: [],
      ...service
    }
  })

const driverPerson = (fullName, extra = {}) => ({
  personId: null,
  fullName,
  phone: null,
  personType: "PASSENGER",
  personCategory: "ADULT",
  airlinePersonalId: null,
  baggageTags: [],
  reportCost: null,
  addressTo: null,
  ...extra
})

// ─────────────────────── ensureDriverIds (чистая функция) ───────────────────────

test("ensureDriverIds проставляет id только тем, у кого его нет", () => {
  const source = [
    { fullName: "Со своим id", id: "driver-existing" },
    { fullName: "Без id" },
    { fullName: "С пустым id", id: "   " }
  ]
  const before = structuredClone(source)

  let counter = 0
  const result = ensureDriverIds(source, () => `made-${(counter += 1)}`)

  assert.equal(result[0].id, "driver-existing", "существующий id не трогается")
  assert.equal(result[1].id, "made-1")
  assert.equal(result[2].id, "made-2", "пробельный id считается отсутствующим")
  assert.deepEqual(source, before, "вход не мутируется")
  assert.deepEqual(ensureDriverIds(null), [], "не-массив даёт пустой список")
})

test("removePassengerRequestDriver прогоняет выживших через ensureDriverIds", async () => {
  // Тот же контракт, но уже внутри мутации: у выжившего с id он сохраняется,
  // выжившему без id id выдаётся.
  const request = withTransfer({
    status: "IN_PROGRESS",
    times: { createdAt: "2026-08-01T10:00:00.000Z" },
    drivers: [
      { id: "driver-0", fullName: "Первый" },
      { id: "driver-1", fullName: "Второй" },
      { fullName: "Третий без id" }
    ]
  })

  const run = await runFapMutation(
    "removePassengerRequestDriver",
    { requestId: "req-1", driverIndex: 0 },
    { request }
  )

  const drivers = run.written[0].transferService.drivers
  assert.equal(drivers.length, 2)
  assert.equal(drivers[0].id, "driver-1", "чужой id сохранён как есть")
  assert.equal(drivers[1].id, "<UUID>", "водителю без id выдан новый")
})

// ─────────────────────── addPassengerRequestDriver ───────────────────────

test("addPassengerRequestDriver: что записано, что в лог, что в уведомления, что в подписку", async () => {
  const run = await runFapMutation("addPassengerRequestDriver", {
    requestId: "req-1",
    driver: {
      fullName: "  Водитель Петров  ",
      phone: "  +7 900 000-00-00  ",
      peopleCount: 3,
      addressFrom: "   ",
      description: null
    }
  })

  assert.equal(run.written.length, 1)
  const service = run.written[0].transferService
  assert.deepEqual(Object.keys(service), ["drivers", "plan", "status", "times"])
  assert.deepEqual(service.plan, { enabled: true, peopleCount: 4 }, "план не трогается")
  assert.equal(service.status, "ACCEPTED", "первый водитель поднимает статус")
  assert.deepEqual(service.times, { acceptedAt: "<DATE>" })

  assert.equal(service.drivers.length, 1)
  const { linkPWA, ...driver } = service.drivers[0]
  assert.deepEqual(driver, {
    addressFrom: null,
    addressTo: null,
    description: null,
    fullName: "Водитель Петров",
    hotelItemId: null,
    id: "<UUID>",
    link: null,
    // peopleCount из инпута уносится в документ как есть: белого списка полей
    // водителя нет, normalizePassengerServiceDriver спредит вход целиком.
    peopleCount: 3,
    people: [],
    phone: "+7 900 000-00-00"
  })
  assert.equal(typeof linkPWA, "string")

  assert.equal(run.logged.length, 1)
  assert.equal(run.logged[0].action, "add_passenger_request_driver")
  assert.equal(run.logged[0].description, "Водитель добавлен в трансфер ФАП")
  assert.equal(
    run.logged[0].fulldescription,
    "Пользователь Диспетчер Тестовый добавил водителя в трансфер ФАП TEST001"
  )
  assert.equal(run.notified.length, 0)
  assert.deepEqual(run.published, ["PASSENGER_REQUEST_UPDATED"])
})

test("addPassengerRequestDriver выпускает ссылку водителя на его id, а не на индекс", async () => {
  // Ссылка ходит в prisma (externalUser.upsert + externalUserMagicLinkToken.create)
  // и наружу не выходит: buildExternalMagicLink — чистая склейка строки, токен
  // берётся из crypto. Поэтому двойника достаточно, overrides не нужны.
  const run = await runRaw("addPassengerRequestDriver", {
    requestId: "req-1",
    driver: { fullName: "Водитель Петров" }
  })

  const driver = rawWritten(run.double)[0].transferService.drivers[0]
  assert.match(driver.id, /^[0-9a-f-]{36}$/)

  // Внешний пользователь водителя заведён по id, индекс в адрес не попадает.
  const upserts = run.double.callsTo("externalUser", "upsert")
  assert.equal(upserts.length, 1)
  assert.equal(
    upserts[0].args.where.email,
    `driver-req-1-transfer-${driver.id}@auto.internal`
  )

  // Сама ссылка несёт и id, и индекс — опорным является id.
  assert.equal(run.double.callsTo("externalUserMagicLinkToken", "create").length, 1)
  assert.ok(driver.linkPWA.includes(`driverId=${driver.id}`))
  assert.ok(driver.linkPWA.includes("driverIndex=0"))
  assert.ok(driver.linkPWA.includes("serviceKind=transfer"))
  assert.ok(driver.linkPWA.includes("passengerRequestId=req-1"))
})

test("addPassengerRequestDriver: сбой выпуска ссылки водителя не роняет мутацию", async () => {
  // Выпуск обёрнут в try/catch: водитель добавляется без ссылки, всё остальное
  // (статус, лог, публикация) происходит как обычно.
  const run = await runRaw(
    "addPassengerRequestDriver",
    { requestId: "req-1", driver: { fullName: "Водитель" } },
    {
      overrides: {
        externalUser: {
          upsert: () => {
            throw new Error("внешний сервис недоступен")
          }
        }
      }
    }
  )

  assert.equal(run.error, null)
  const driver = rawWritten(run.double)[0].transferService.drivers[0]
  assert.equal(driver.linkPWA, null)
  assert.match(driver.id, /^[0-9a-f-]{36}$/, "id водителя выдаётся до ссылки")
  assert.equal(rawWritten(run.double)[0].transferService.status, "ACCEPTED")
  assert.equal(run.double.callsTo("log", "create").length, 1)
  assert.equal(run.published.length, 1)
})

test("removePassengerRequestDriver: сбой перевыпуска гасит ссылку, а не оставляет чужую", async () => {
  const staleLink =
    "https://far.karsavia.ru/external-login?kind=EXTERNAL_USER&token=old&passengerRequestId=req-1&driverIndex=1&serviceKind=transfer"
  const request = withTransfer({
    drivers: [
      { id: "driver-0", fullName: "Первый" },
      { id: "driver-1", fullName: "Второй", linkPWA: staleLink }
    ]
  })

  const run = await runRaw(
    "removePassengerRequestDriver",
    { requestId: "req-1", driverIndex: 0 },
    {
      request,
      overrides: {
        externalUser: {
          upsert: () => {
            throw new Error("внешний сервис недоступен")
          }
        }
      }
    }
  )

  assert.equal(run.error, null)
  assert.equal(rawWritten(run.double)[0].transferService.drivers[0].linkPWA, null)
})

test("водитель в непустом статусе услугу не переоткрывает", async () => {
  // Дефект №11 реестра починен. Было: условием подъёма служил только
  // driverIndex === 0, поэтому заведение поездки в пустой список возвращало в
  // ACCEPTED услугу ЛЮБОГО статуса. Стало: гвард prev.status === "NEW", как у
  // багажного близнеца. Водитель при этом добавляется — меняться перестали
  // только статус и времена.
  for (const [status, times] of [
    ["CANCELLED", { cancelledAt: "2026-08-02T10:00:00.000Z" }],
    ["COMPLETED", { finishedAt: "2026-08-02T10:00:00.000Z" }],
    ["IN_PROGRESS", { inProgressAt: "2026-08-02T10:00:00.000Z" }]
  ]) {
    const run = await runFapMutation(
      "addPassengerRequestDriver",
      { requestId: "req-1", driver: { fullName: "Водитель" } },
      { request: withTransfer({ status, times, drivers: [] }) }
    )

    const service = run.written[0].transferService
    assert.equal(service.status, status, `${status} не переоткрывается`)
    assert.equal(
      service.times.acceptedAt,
      undefined,
      `${status}: отметка приёма не проставляется`
    )
    assert.equal(service.drivers.length, 1, `${status}: водитель добавлен`)
  }
})

test("первый водитель по-прежнему поднимает услугу из NEW в ACCEPTED", async () => {
  // Обратная проверка к №11: гвард закрыл только переоткрытие, законный
  // переход NEW → ACCEPTED цел.
  const run = await runFapMutation(
    "addPassengerRequestDriver",
    { requestId: "req-1", driver: { fullName: "Водитель" } },
    { request: withTransfer({ status: "NEW", times: {}, drivers: [] }) }
  )

  const service = run.written[0].transferService
  assert.equal(service.status, "ACCEPTED")
  assert.equal(service.times.acceptedAt, "<DATE>")
  assert.equal(service.drivers.length, 1)
})

test("addPassengerRequestDriver: второй водитель не трогает ни статус, ни времена", async () => {
  // Пересчёта по факту здесь нет вовсе: даже когда добавление доводит факт до
  // плана, статус остаётся прежним — статус ведёт только «первый ли водитель».
  const request = withTransfer({
    status: "IN_PROGRESS",
    times: { inProgressAt: "2026-08-01T11:00:00.000Z" },
    drivers: [
      {
        id: "driver-0",
        fullName: "Первый",
        people: [driverPerson("Иванов Иван"), driverPerson("Петров Пётр")],
        transportedCount: 4
      }
    ]
  })

  const run = await runFapMutation(
    "addPassengerRequestDriver",
    { requestId: "req-1", driver: { fullName: "Второй" } },
    { request }
  )

  assert.equal(run.written[0].transferService.status, "IN_PROGRESS")
  assert.deepEqual(run.written[0].transferService.times, {
    inProgressAt: "<DATE>"
  })
  assert.equal(run.written[0].transferService.drivers.length, 2)
})

test("addPassengerRequestDriver: направление выбирает поле услуги и вид ссылки", async () => {
  const cases = [
    ["ARRIVAL", "transferService", "transfer"],
    ["DEPARTURE", "departureTransferService", "transfer_departure"],
    ["INTERCITY", "intercityTransferService", "transfer_intercity"]
  ]

  for (const [direction, field, serviceKind] of cases) {
    const run = await runRaw("addPassengerRequestDriver", {
      requestId: "req-1",
      driver: { fullName: "Водитель" },
      direction
    })

    const data = rawWritten(run.double)[0]
    assert.deepEqual(Object.keys(data), [field], `${direction}: одно поле`)
    assert.ok(
      data[field].drivers[0].linkPWA.includes(`serviceKind=${serviceKind}`),
      `${direction}: вид услуги в ссылке`
    )
  }
})

test("addPassengerRequestDriver: пустое имя и чужой hotelItemId отбиваются до записи", async () => {
  const noName = await runRaw("addPassengerRequestDriver", {
    requestId: "req-1",
    driver: { fullName: "   " }
  })
  assert.match(noName.error.message, /Driver fullName is required/)
  assert.equal(noName.double.callsTo("passengerRequest", "update").length, 0)

  const alienHotel = await runRaw("addPassengerRequestDriver", {
    requestId: "req-1",
    driver: { fullName: "Водитель", hotelItemId: "нет-такой-гостиницы" }
  })
  assert.match(alienHotel.error.message, /Unknown hotelItemId/)
  assert.equal(alienHotel.double.callsTo("passengerRequest", "update").length, 0)
})

test("addPassengerRequestDriver: привязка к гостинице заявки видна только в логе", async () => {
  const run = await runFapMutation("addPassengerRequestDriver", {
    requestId: "req-1",
    driver: {
      fullName: "Водитель",
      hotelItemId: "bbbbbbbb-0000-4000-8000-000000000001"
    }
  })

  // Нормализатор снимка превращает любой uuid в «<UUID>» — важно, что ключ
  // привязки долетел до документа, а не потерялся по дороге.
  assert.equal(run.written[0].transferService.drivers[0].hotelItemId, "<UUID>")
  assert.equal(
    run.logged[0].fulldescription,
    "Пользователь Диспетчер Тестовый добавил водителя в трансфер ФАП TEST001 (гостиница «Азия»)"
  )
})

test("addPassengerRequestDriver: отсутствующая услуга создаётся из пустого шаблона", async () => {
  const request = makeRequest({ transferService: undefined })

  const run = await runFapMutation(
    "addPassengerRequestDriver",
    { requestId: "req-1", driver: { fullName: "Водитель" } },
    { request }
  )

  const service = run.written[0].transferService
  assert.equal(service.plan, null)
  assert.equal(service.status, "ACCEPTED")
  assert.deepEqual(service.times, { acceptedAt: "<DATE>" })
})

// ─────────────────────── updatePassengerRequestDriver ───────────────────────

test("updatePassengerRequestDriver: пустой патч не пишет, не логирует и не публикует", async () => {
  // Ключей из белого списка в патче нет — мутация возвращает заявку, прочитанную
  // из базы, и обрывается до апдейта. Единственная мутация группы, которая так
  // умеет: у остальных пустой вход всё равно доходит до записи.
  const request = withTransfer({
    drivers: [{ id: "driver-0", fullName: "Водитель" }]
  })

  const empty = await runFapMutation(
    "updatePassengerRequestDriver",
    { requestId: "req-1", driverIndex: 0, patch: {} },
    { request }
  )
  assert.deepEqual(empty.written, [])
  assert.deepEqual(empty.logged, [])
  assert.deepEqual(empty.notified, [])
  assert.deepEqual(empty.published, [])
  assert.equal(empty.result.id, "req-1", "возвращается заявка как есть")

  // Патч из ключей вне белого списка равносилен пустому.
  const unknownKeys = await runFapMutation(
    "updatePassengerRequestDriver",
    {
      requestId: "req-1",
      driverIndex: 0,
      patch: { addressTo: "ул. Мира", fullName: "Другой" }
    },
    { request: withTransfer({ drivers: [{ id: "driver-0", fullName: "Водитель" }] }) }
  )
  assert.deepEqual(unknownKeys.written, [])
  assert.deepEqual(unknownKeys.logged, [])
  assert.deepEqual(unknownKeys.published, [])
})

test("updatePassengerRequestDriver: четыре поля патча уходят в документ и в лог", async () => {
  const request = withTransfer({
    status: "IN_PROGRESS",
    times: { inProgressAt: "2026-08-01T11:00:00.000Z" },
    drivers: [
      {
        id: "driver-0",
        fullName: "Водитель Петров",
        pickupAt: "2026-08-04T09:00:00.000Z",
        vehicleType: "Седан",
        reportCost: 1000,
        people: []
      }
    ]
  })

  const run = await runFapMutation(
    "updatePassengerRequestDriver",
    {
      requestId: "req-1",
      driverIndex: 0,
      patch: {
        pickupAt: "2026-08-04T10:30:00.000Z",
        vehicleType: "Автобус",
        // Деньги здесь НЕ проходят через toMoney (в отличие от пассажира
        // водителя): значение уходит в документ как есть.
        reportCost: 1234.567,
        transportedCount: 2
      }
    },
    { request }
  )

  const driver = run.written[0].transferService.drivers[0]
  assert.equal(driver.pickupAt, "<DATE>")
  assert.equal(driver.vehicleType, "Автобус")
  assert.equal(driver.reportCost, 1234.567)
  assert.equal(driver.transportedCount, 2)

  assert.equal(run.logged.length, 1)
  assert.equal(run.logged[0].action, "update_passenger_request_driver")
  assert.equal(
    run.logged[0].description,
    'Заявка «Водитель Петров» (прилёт): подача: 04.08.2026 09:00 UTC → 04.08.2026 10:30 UTC, тип ТС: "Седан" → "Автобус", сумма: 1000 → 1234.567, перевезено: — → 2'
  )
  assert.equal(run.notified.length, 0)
  assert.deepEqual(run.published, ["PASSENGER_REQUEST_UPDATED"])
})

test("updatePassengerRequestDriver: transportedCount — единственное поле с валидацией", async () => {
  const request = () =>
    withTransfer({ drivers: [{ id: "driver-0", fullName: "Водитель", people: [] }] })

  await assert.rejects(
    () =>
      runFapMutation(
        "updatePassengerRequestDriver",
        { requestId: "req-1", driverIndex: 0, patch: { transportedCount: 2.5 } },
        { request: request() }
      ),
    /transportedCount must be a non-negative integer/
  )

  await assert.rejects(
    () =>
      runFapMutation(
        "updatePassengerRequestDriver",
        { requestId: "req-1", driverIndex: 0, patch: { transportedCount: -1 } },
        { request: request() }
      ),
    /transportedCount must be a non-negative integer/
  )

  // null — валидное значение: «перевезено» сбрасывается.
  const cleared = await runFapMutation(
    "updatePassengerRequestDriver",
    { requestId: "req-1", driverIndex: 0, patch: { transportedCount: null } },
    { request: request() }
  )
  assert.equal(cleared.written[0].transferService.drivers[0].transportedCount, null)

  // Соседнее денежное поле отрицательное значение принимает молча.
  const negativeCost = await runFapMutation(
    "updatePassengerRequestDriver",
    { requestId: "req-1", driverIndex: 0, patch: { reportCost: -100 } },
    { request: request() }
  )
  assert.equal(negativeCost.written[0].transferService.drivers[0].reportCost, -100)
})

test("факт услуги = max(длина списка, transportedCount): статус считается по факту", async () => {
  assert.equal(
    transferFactCount([{ people: [{}], transportedCount: 4 }]),
    4,
    "не сумма и не длина списка, а максимум"
  )

  // В списке один человек, «перевезено» — четыре. План — четыре: услуга
  // автозавершается, хотя поимённо введён один.
  const request = withTransfer({
    status: "IN_PROGRESS",
    times: { inProgressAt: "2026-08-01T11:00:00.000Z" },
    drivers: [
      { id: "driver-0", fullName: "Водитель", people: [driverPerson("Иванов Иван")] }
    ]
  })

  const run = await runFapMutation(
    "updatePassengerRequestDriver",
    { requestId: "req-1", driverIndex: 0, patch: { transportedCount: 4 } },
    { request }
  )

  const service = run.written[0].transferService
  assert.equal(service.status, "COMPLETED")
  assert.equal(service.times.finishedAt, "<DATE>")
  assert.equal(service.drivers[0].people.length, 1, "список людей не менялся")
})

test("updatePassengerRequestDriver: снижение факта ниже плана реоткрывает услугу, рост — нет", async () => {
  const completed = () =>
    withTransfer({
      status: "COMPLETED",
      times: {
        inProgressAt: "2026-08-01T11:00:00.000Z",
        finishedAt: "2026-08-01T12:00:00.000Z"
      },
      drivers: [
        { id: "driver-0", fullName: "Водитель", people: [], transportedCount: 4 }
      ]
    })

  const lowered = await runFapMutation(
    "updatePassengerRequestDriver",
    { requestId: "req-1", driverIndex: 0, patch: { transportedCount: 2 } },
    { request: completed() }
  )
  assert.equal(lowered.written[0].transferService.status, "IN_PROGRESS")
  assert.equal(lowered.written[0].transferService.times.finishedAt, null)

  const raised = await runFapMutation(
    "updatePassengerRequestDriver",
    { requestId: "req-1", driverIndex: 0, patch: { transportedCount: 6 } },
    { request: completed() }
  )
  assert.equal(raised.written[0].transferService.status, "COMPLETED")
  assert.equal(raised.written[0].transferService.times.finishedAt, "<DATE>")
})

test("updatePassengerRequestDriver: пересчёт статуса запускает только transportedCount", async () => {
  // Факт (2 человека) ниже плана (4), но и без того статус NEW не поднимается:
  // правка любого другого поля статус вообще не считает.
  const request = withTransfer({
    status: "NEW",
    times: {},
    drivers: [
      {
        id: "driver-0",
        fullName: "Водитель",
        people: [driverPerson("Иванов Иван"), driverPerson("Петров Пётр")]
      }
    ]
  })

  const run = await runFapMutation(
    "updatePassengerRequestDriver",
    { requestId: "req-1", driverIndex: 0, patch: { vehicleType: "Автобус" } },
    { request }
  )

  assert.equal(run.written[0].transferService.status, "NEW")
  assert.deepEqual(run.written[0].transferService.times, {})
})

test("updatePassengerRequestDriver: выключенная услуга, отмена и чужой индекс отбиваются", async () => {
  // Услуга вылета в фикстуре с plan.enabled: false.
  await assert.rejects(
    () =>
      runFapMutation("updatePassengerRequestDriver", {
        requestId: "req-1",
        driverIndex: 0,
        patch: { vehicleType: "Автобус" },
        direction: "DEPARTURE"
      }),
    /Service is not enabled/
  )

  await assert.rejects(
    () =>
      runFapMutation(
        "updatePassengerRequestDriver",
        { requestId: "req-1", driverIndex: 0, patch: { vehicleType: "Автобус" } },
        {
          request: withTransfer({
            status: "CANCELLED",
            drivers: [{ id: "driver-0", fullName: "Водитель" }]
          })
        }
      ),
    /Service is cancelled, no updates allowed/
  )

  await assert.rejects(
    () =>
      runFapMutation(
        "updatePassengerRequestDriver",
        { requestId: "req-1", driverIndex: 3, patch: { vehicleType: "Автобус" } },
        {
          request: withTransfer({
            drivers: [{ id: "driver-0", fullName: "Водитель" }]
          })
        }
      ),
    /Invalid driverIndex/
  )
})

// ─────────────────────── removePassengerRequestDriver ───────────────────────

test("removePassengerRequestDriver: что записано, что в лог, что в уведомления, что в подписку", async () => {
  const request = withTransfer({
    status: "IN_PROGRESS",
    times: { inProgressAt: "2026-08-01T11:00:00.000Z" },
    drivers: [
      {
        id: "driver-0",
        fullName: "Первый",
        people: [driverPerson("Иванов Иван"), driverPerson("Петров Пётр")]
      },
      { id: "driver-1", fullName: "Второй", people: [driverPerson("Сидоров Сидор")] }
    ]
  })

  const run = await runFapMutation(
    "removePassengerRequestDriver",
    { requestId: "req-1", driverIndex: 0 },
    { request }
  )

  const service = run.written[0].transferService
  assert.deepEqual(Object.keys(service), ["drivers", "plan", "status", "times"])
  assert.equal(service.drivers.length, 1)
  assert.equal(service.drivers[0].fullName, "Второй")
  // Факт упал с 3 до 1, но план (4) и раньше не был достигнут — статус тот же.
  assert.equal(service.status, "IN_PROGRESS")
  assert.deepEqual(service.times, { inProgressAt: "<DATE>" })

  assert.equal(run.logged.length, 1)
  assert.equal(run.logged[0].action, "remove_passenger_request_driver")
  assert.equal(
    run.logged[0].fulldescription,
    "Пользователь Диспетчер Тестовый удалил водителя Первый из трансфера ФАП TEST001"
  )
  assert.equal(run.notified.length, 0)
  assert.deepEqual(run.published, ["PASSENGER_REQUEST_UPDATED"])
})

test("removePassengerRequestDriver: последний водитель сбрасывает статус в NEW, времена оставляя", async () => {
  // Ветка «список опустел» пересчёт не зовёт вовсе: статус NEW, а отметка
  // завершения из прошлой жизни услуги остаётся в документе.
  const request = withTransfer({
    status: "COMPLETED",
    times: {
      inProgressAt: "2026-08-01T11:00:00.000Z",
      finishedAt: "2026-08-01T12:00:00.000Z"
    },
    drivers: [{ id: "driver-0", fullName: "Единственный", transportedCount: 4 }]
  })

  const run = await runFapMutation(
    "removePassengerRequestDriver",
    { requestId: "req-1", driverIndex: 0 },
    { request }
  )

  const service = run.written[0].transferService
  assert.deepEqual(service.drivers, [])
  assert.equal(service.status, "NEW")
  assert.deepEqual(service.times, {
    finishedAt: "<DATE>",
    inProgressAt: "<DATE>"
  })
})

test("removePassengerRequestDriver перевыпускает только ссылки без driverId", async () => {
  // Ссылка выжившего, выпущенная до появления id, после сдвига указывает на
  // чужую запись — её выпускают заново и гасят старый доступ. Ссылка,
  // несущая driverId, адресует водителя точно и не трогается.
  const staleLink =
    "https://far.karsavia.ru/external-login?kind=EXTERNAL_USER&token=old&passengerRequestId=req-1&driverIndex=1&serviceKind=transfer"
  const freshLink =
    "https://far.karsavia.ru/external-login?kind=EXTERNAL_USER&token=own&passengerRequestId=req-1&driverIndex=2&driverId=driver-2&serviceKind=transfer"

  const request = withTransfer({
    status: "IN_PROGRESS",
    times: { inProgressAt: "2026-08-01T11:00:00.000Z" },
    drivers: [
      { id: "driver-0", fullName: "Первый" },
      { id: "driver-1", fullName: "Второй", linkPWA: staleLink },
      { id: "driver-2", fullName: "Третий", linkPWA: freshLink }
    ]
  })

  const run = await runRaw(
    "removePassengerRequestDriver",
    { requestId: "req-1", driverIndex: 0 },
    { request }
  )

  const drivers = rawWritten(run.double)[0].transferService.drivers
  assert.notEqual(drivers[0].linkPWA, staleLink, "ссылка без id перевыпущена")
  assert.ok(drivers[0].linkPWA.includes("driverId=driver-1"))
  assert.ok(drivers[0].linkPWA.includes("driverIndex=0"), "новый индекс в ссылке")
  assert.equal(drivers[1].linkPWA, freshLink, "ссылка с driverId не трогается")

  // Выпуск — один, ровно на съехавшего водителя.
  const upserts = run.double.callsTo("externalUser", "upsert")
  assert.equal(upserts.length, 1)
  assert.equal(
    upserts[0].args.where.email,
    "driver-req-1-transfer-driver-1@auto.internal"
  )

  // Старый доступ, выпущенный на прежний индекс, гасится по индексному адресу.
  const revoked = run.double.callsTo("externalUser", "findUnique")
  assert.equal(revoked.length, 1)
  assert.equal(
    revoked[0].args.where.email,
    "driver-req-1-transfer-1@auto.internal"
  )
  assert.equal(
    run.double.callsTo("externalUserMagicLinkToken", "updateMany").length,
    1
  )
})

test("removePassengerRequestDriver: чужой индекс отбивается до записи", async () => {
  const run = await runRaw(
    "removePassengerRequestDriver",
    { requestId: "req-1", driverIndex: 1 },
    { request: withTransfer({ drivers: [{ id: "driver-0", fullName: "Один" }] }) }
  )

  assert.match(run.error.message, /Invalid driverIndex/)
  assert.equal(run.double.callsTo("passengerRequest", "update").length, 0)
  assert.equal(run.published.length, 0)
})

// ─────────────────── пассажиры у водителя: добавление ───────────────────

test("addPassengerRequestDriverPerson: что записано, что в лог, что в уведомления, что в подписку", async () => {
  const request = withTransfer({
    drivers: [{ id: "driver-0", fullName: "Водитель", people: [] }]
  })

  const run = await runFapMutation(
    "addPassengerRequestDriverPerson",
    {
      requestId: "req-1",
      driverIndex: 0,
      person: {
        fullName: "  Сидоров Сидор  ",
        personCategory: "CHILD",
        phone: "  +79001234567  ",
        baggageTags: ["  ab-1  ", "AB-1", ""],
        reportCost: -5,
        addressTo: "  ул. Мира  "
      }
    },
    { request }
  )

  assert.equal(run.written.length, 1)
  assert.deepEqual(Object.keys(run.written[0]), [
    "savedPassengers",
    "transferService"
  ])

  const person = run.written[0].transferService.drivers[0].people[0]
  assert.deepEqual(person, {
    addressTo: "ул. Мира",
    airlinePersonalId: null,
    // Отрицательная цена и дубли бирок чинятся normalizeDriverPerson.
    baggageTags: ["ab-1"],
    fullName: "Сидоров Сидор",
    personCategory: "CHILD",
    personId: "<UUID>",
    personType: "PASSENGER",
    phone: "+79001234567",
    reportCost: null
  })

  // Появился первый человек — услуга пошла в работу.
  assert.equal(run.written[0].transferService.status, "IN_PROGRESS")
  assert.equal(run.written[0].transferService.times.inProgressAt, "<DATE>")

  // Ростер заявки дополняется новым пассажиром.
  assert.equal(run.written[0].savedPassengers.length, 3)
  assert.deepEqual(run.written[0].savedPassengers[2], {
    addedAt: "<DATE>",
    airlinePersonalId: null,
    fullName: "Сидоров Сидор",
    personCategory: "CHILD",
    personId: "<UUID>",
    personType: "PASSENGER",
    phone: "+79001234567",
    placementRequirement: null,
    seat: null
  })

  assert.equal(run.logged.length, 1)
  assert.equal(run.logged[0].action, "add_passenger_request_driver_person")
  assert.equal(run.notified.length, 0)
  assert.deepEqual(run.published, ["PASSENGER_REQUEST_UPDATED"])
})

test("addPassengerRequestDriverPerson: известный personId ростер не удлиняет", async () => {
  const request = withTransfer({
    drivers: [{ id: "driver-0", fullName: "Водитель", people: [] }]
  })

  const run = await runFapMutation(
    "addPassengerRequestDriverPerson",
    {
      requestId: "req-1",
      driverIndex: 0,
      person: { personId: ADULT_ID, fullName: "Иванов Иван Иванович" }
    },
    { request }
  )

  assert.equal(run.written[0].savedPassengers.length, 2)
  assert.equal(run.written[0].savedPassengers[0].fullName, "Иванов Иван Иванович")
})

test("addPassengerRequestDriverPeople: пачка добавляется одним пересчётом", async () => {
  const request = withTransfer({
    status: "IN_PROGRESS",
    times: { inProgressAt: "2026-08-01T11:00:00.000Z" },
    drivers: [
      {
        id: "driver-0",
        fullName: "Водитель",
        people: [driverPerson("Иванов Иван", { personId: ADULT_ID })]
      }
    ]
  })

  const run = await runFapMutation(
    "addPassengerRequestDriverPeople",
    {
      requestId: "req-1",
      driverIndex: 0,
      people: [
        { fullName: "Первый Пассажир" },
        { fullName: "Второй Пассажир" },
        { fullName: "Третий Пассажир" }
      ]
    },
    { request }
  )

  assert.equal(run.written.length, 1, "одна запись на всю пачку")
  const service = run.written[0].transferService
  assert.equal(service.drivers[0].people.length, 4)
  // Факт (4) дотянулся до плана (4) — услуга автозавершилась.
  assert.equal(service.status, "COMPLETED")
  assert.equal(service.times.finishedAt, "<DATE>")

  assert.equal(run.written[0].savedPassengers.length, 5)
  assert.equal(run.logged.length, 1)
  assert.equal(run.logged[0].action, "add_passenger_request_driver_people")
  assert.equal(
    run.logged[0].description,
    "Пакетно добавлены пассажиры к водителю трансфера ФАП (3)"
  )
  assert.equal(run.notified.length, 0)
  assert.deepEqual(run.published, ["PASSENGER_REQUEST_UPDATED"])
})

test("addPassengerRequestDriverPeople: пустой список отбивается ДО чтения заявки", async () => {
  const empty = await runRaw("addPassengerRequestDriverPeople", {
    requestId: "req-1",
    driverIndex: 0,
    people: []
  })
  assert.match(empty.error.message, /people must be a non-empty array/)
  assert.equal(empty.double.calls.length, 0, "заявка даже не читается")

  const notArray = await runRaw("addPassengerRequestDriverPeople", {
    requestId: "req-1",
    driverIndex: 0,
    people: null
  })
  assert.match(notArray.error.message, /people must be a non-empty array/)
})

// ─────────────────── пассажиры у водителя: правка и удаление ───────────────────

test("updatePassengerRequestDriverPerson: пассажир заменяется целиком, статус не пересчитывается", async () => {
  const request = withTransfer({
    status: "ACCEPTED",
    times: { acceptedAt: "2026-08-01T11:00:00.000Z" },
    drivers: [
      {
        id: "driver-0",
        fullName: "Водитель",
        people: [
          driverPerson("Иванов Иван", {
            personId: ADULT_ID,
            phone: "+79001112233",
            baggageTags: ["T-1"],
            reportCost: 100,
            addressTo: "ул. Ленина"
          })
        ]
      }
    ]
  })

  const run = await runFapMutation(
    "updatePassengerRequestDriverPerson",
    {
      requestId: "req-1",
      driverIndex: 0,
      personIndex: 0,
      // personId во входе нет — подставляется из предыдущей записи.
      person: { fullName: "Иванов Иван Иванович" }
    },
    { request }
  )

  assert.deepEqual(Object.keys(run.written[0]), [
    "savedPassengers",
    "transferService"
  ])

  // Всё, чего нет во входе, сбрасывается в дефолт: это замена, а не патч.
  assert.deepEqual(run.written[0].transferService.drivers[0].people[0], {
    addressTo: null,
    airlinePersonalId: null,
    baggageTags: [],
    fullName: "Иванов Иван Иванович",
    personCategory: "ADULT",
    personId: "<UUID>",
    personType: "PASSENGER",
    phone: null,
    reportCost: null
  })

  // Статуса и времён в data нет — уносится prev как есть.
  assert.equal(run.written[0].transferService.status, "ACCEPTED")
  assert.deepEqual(run.written[0].transferService.times, { acceptedAt: "<DATE>" })

  // Правка идентичности переносится в ростер заявки.
  assert.equal(run.written[0].savedPassengers.length, 2)
  assert.equal(run.written[0].savedPassengers[0].fullName, "Иванов Иван Иванович")

  assert.equal(run.logged.length, 1)
  assert.equal(run.logged[0].action, "update_passenger_request_driver_person")
  assert.equal(run.notified.length, 0)
  assert.deepEqual(run.published, ["PASSENGER_REQUEST_UPDATED"])
})

test("removePassengerRequestDriverPerson НЕ трогает savedPassengers, хотя добавление делает upsert", async () => {
  // Асимметрия: добавление пассажира к водителю заносит его в ростер заявки,
  // удаление из ростера не убирает и его вообще не пишет.
  const base = () =>
    withTransfer({
      status: "IN_PROGRESS",
      times: { inProgressAt: "2026-08-01T11:00:00.000Z" },
      drivers: [
        {
          id: "driver-0",
          fullName: "Водитель",
          people: [
            driverPerson("Иванов Иван", { personId: ADULT_ID }),
            driverPerson("Петров Пётр")
          ]
        }
      ]
    })

  const added = await runFapMutation(
    "addPassengerRequestDriverPerson",
    { requestId: "req-1", driverIndex: 0, person: { fullName: "Новый Пассажир" } },
    { request: base() }
  )
  assert.ok(
    "savedPassengers" in added.written[0],
    "добавление ростер обновляет"
  )

  const removed = await runFapMutation(
    "removePassengerRequestDriverPerson",
    { requestId: "req-1", driverIndex: 0, personIndex: 0 },
    { request: base() }
  )
  assert.deepEqual(
    Object.keys(removed.written[0]),
    ["transferService"],
    "удаление ростер не пишет"
  )
  assert.equal(removed.written[0].transferService.drivers[0].people.length, 1)
  assert.equal(
    removed.written[0].transferService.drivers[0].people[0].fullName,
    "Петров Пётр"
  )

  assert.equal(removed.logged.length, 1)
  assert.equal(
    removed.logged[0].action,
    "remove_passenger_request_driver_person"
  )
  assert.equal(removed.notified.length, 0)
  assert.deepEqual(removed.published, ["PASSENGER_REQUEST_UPDATED"])
})

test("removePassengerRequestDriverPeople: индексы схлопываются и обходятся по убыванию", async () => {
  const request = withTransfer({
    status: "IN_PROGRESS",
    times: { inProgressAt: "2026-08-01T11:00:00.000Z" },
    drivers: [
      {
        id: "driver-0",
        fullName: "Водитель",
        people: [
          driverPerson("Первый"),
          driverPerson("Второй"),
          driverPerson("Третий")
        ]
      }
    ]
  })

  const run = await runFapMutation(
    "removePassengerRequestDriverPeople",
    { requestId: "req-1", driverIndex: 0, personIndexes: [2, 0, 2] },
    { request }
  )

  assert.deepEqual(Object.keys(run.written[0]), ["transferService"])
  const people = run.written[0].transferService.drivers[0].people
  assert.equal(people.length, 1)
  assert.equal(people[0].fullName, "Второй")

  assert.equal(run.logged.length, 1)
  assert.equal(run.logged[0].action, "remove_passenger_request_driver_people")
  assert.equal(
    run.logged[0].fulldescription,
    "Пользователь Диспетчер Тестовый удалил пассажиров (2) у водителя #0 в ФАП TEST001"
  )
  assert.equal(run.notified.length, 0)
  assert.deepEqual(run.published, ["PASSENGER_REQUEST_UPDATED"])
})

test("removePassengerRequestDriverPeople: пересчёт идёт по факту, а не по длине списка", async () => {
  // «Перевезено 3» удерживает факт на трёх, хотя поимённо остался один —
  // услуга остаётся завершённой.
  const request = withTransfer({
    plan: { enabled: true, peopleCount: 3 },
    status: "COMPLETED",
    times: {
      inProgressAt: "2026-08-01T11:00:00.000Z",
      finishedAt: "2026-08-01T12:00:00.000Z"
    },
    drivers: [
      {
        id: "driver-0",
        fullName: "Водитель",
        transportedCount: 3,
        people: [
          driverPerson("Первый"),
          driverPerson("Второй"),
          driverPerson("Третий")
        ]
      }
    ]
  })

  const run = await runFapMutation(
    "removePassengerRequestDriverPeople",
    { requestId: "req-1", driverIndex: 0, personIndexes: [1, 2] },
    { request }
  )

  const service = run.written[0].transferService
  assert.equal(service.drivers[0].people.length, 1)
  assert.equal(service.status, "COMPLETED", "факт остался равен плану")
  assert.equal(service.times.finishedAt, "<DATE>")
})

test("removePassengerRequestDriverPeople: пустой набор и чужой индекс отбиваются до записи", async () => {
  const request = () =>
    withTransfer({
      drivers: [
        { id: "driver-0", fullName: "Водитель", people: [driverPerson("Первый")] }
      ]
    })

  const empty = await runRaw(
    "removePassengerRequestDriverPeople",
    { requestId: "req-1", driverIndex: 0, personIndexes: [] },
    { request: request() }
  )
  assert.match(empty.error.message, /Не выбран ни один пассажир/)
  assert.equal(empty.double.callsTo("passengerRequest", "update").length, 0)

  const alien = await runRaw(
    "removePassengerRequestDriverPeople",
    { requestId: "req-1", driverIndex: 0, personIndexes: [5] },
    { request: request() }
  )
  assert.match(alien.error.message, /Invalid personIndex/)
  assert.equal(alien.double.callsTo("passengerRequest", "update").length, 0)
})

// ─────────────────────── общее на всю группу ───────────────────────

test("ДЕФЕКТ №18: ни одна из восьми мутаций группы не шлёт сайтового уведомления", async () => {
  // Трансфер целиком нем: диспетчер узнаёт о появлении водителя, правке
  // «перевезено» или удалении пассажира только из истории заявки. Соседние
  // группы (создание/обновление/отмена заявки) уведомления пишут.
  // Реестр дефектов спеки, №18. При починке этот тест обязан измениться.
  const base = () =>
    withTransfer({
      status: "IN_PROGRESS",
      times: { inProgressAt: "2026-08-01T11:00:00.000Z" },
      drivers: [
        {
          id: "driver-0",
          fullName: "Водитель",
          people: [driverPerson("Иванов Иван", { personId: ADULT_ID })]
        }
      ]
    })

  const cases = [
    ["addPassengerRequestDriver", { requestId: "req-1", driver: { fullName: "Новый" } }],
    [
      "updatePassengerRequestDriver",
      { requestId: "req-1", driverIndex: 0, patch: { vehicleType: "Автобус" } }
    ],
    ["removePassengerRequestDriver", { requestId: "req-1", driverIndex: 0 }],
    [
      "addPassengerRequestDriverPerson",
      { requestId: "req-1", driverIndex: 0, person: { fullName: "Пассажир" } }
    ],
    [
      "addPassengerRequestDriverPeople",
      { requestId: "req-1", driverIndex: 0, people: [{ fullName: "Пассажир" }] }
    ],
    [
      "updatePassengerRequestDriverPerson",
      {
        requestId: "req-1",
        driverIndex: 0,
        personIndex: 0,
        person: { fullName: "Пассажир" }
      }
    ],
    [
      "removePassengerRequestDriverPerson",
      { requestId: "req-1", driverIndex: 0, personIndex: 0 }
    ],
    [
      "removePassengerRequestDriverPeople",
      { requestId: "req-1", driverIndex: 0, personIndexes: [0] }
    ]
  ]

  for (const [name, args] of cases) {
    const run = await runFapMutation(name, args, { request: base() })
    assert.equal(run.notified.length, 0, `${name}: сайтового уведомления нет`)
    assert.deepEqual(run.published, ["PASSENGER_REQUEST_UPDATED"], `${name}: топик`)
  }
})

test("updatePassengerRequestDriver — единственная мутация группы со skipEmail", async () => {
  // Письма через двойник не видны, но почтовая ветка делает собственные чтения
  // из prisma (сбор получателей). По набору задетых моделей её присутствие
  // отличимо: у правки водителя чтений нет вовсе.
  const base = () =>
    withTransfer({
      status: "IN_PROGRESS",
      times: { inProgressAt: "2026-08-01T11:00:00.000Z" },
      drivers: [{ id: "driver-0", fullName: "Водитель", people: [] }]
    })
  const modelsOf = (run) =>
    [...new Set(run.double.calls.map((c) => c.model))].sort()

  const patched = await runRaw(
    "updatePassengerRequestDriver",
    { requestId: "req-1", driverIndex: 0, patch: { vehicleType: "Автобус" } },
    { request: base() }
  )
  assert.deepEqual(modelsOf(patched), ["log", "passengerRequest"])

  const removed = await runRaw(
    "removePassengerRequestDriver",
    { requestId: "req-1", driverIndex: 0 },
    { request: base() }
  )
  assert.ok(
    modelsOf(removed).length > 2,
    `почтовая ветка соседа читает чужие модели: ${modelsOf(removed).join(", ")}`
  )
})

test("письма всей группы уходят одним действием update_passenger_request", async () => {
  // Маршрутизацию писем закрепляем чистой функцией: почтовая ветка живёт в
  // try/catch и через двойник не видна.
  const actions = [
    "add_passenger_request_driver",
    "update_passenger_request_driver",
    "remove_passenger_request_driver",
    "add_passenger_request_driver_person",
    "add_passenger_request_driver_people",
    "update_passenger_request_driver_person",
    "remove_passenger_request_driver_person",
    "remove_passenger_request_driver_people"
  ]

  for (const action of actions) {
    assert.equal(resolveEmailActionForLog(action), "update_passenger_request", action)
  }
})

test("аутентификация: без субъекта мутации группы не выполняются", async () => {
  await assert.rejects(
    () =>
      runFapMutation(
        "addPassengerRequestDriver",
        { requestId: "req-1", driver: { fullName: "Водитель" } },
        { context: {} }
      ),
    /Unauthorized/
  )
})

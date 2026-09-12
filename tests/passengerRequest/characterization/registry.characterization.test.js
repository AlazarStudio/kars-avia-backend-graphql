// Реестры услуг ФАП: скоуп списка и чтения, маска внутренних денег, defaults,
// формирование и стадии. Двойник Prisma не фильтрует where — поэтому проверяем и
// переданный where, и фильтр в памяти (registryVisibleForScope) отдельно.

import test from "node:test"
import assert from "node:assert/strict"
import resolvers from "../../../resolvers/passengerRequest/passengerRequest.resolver.js"
import { installPrismaDouble } from "../../helpers/prismaDouble.js"
import { releasePubsubAfterTests } from "../../helpers/fapHarness.js"
import { makeContext } from "../fixtures/passengerRequest.js"

releasePubsubAfterTests()

const airlineContext = (airlineId = "airline-1") => ({
  subjectType: "USER",
  subject: { id: "u-air", name: "АК Тестовая", role: "AIRLINEADMIN", airlineId },
  user: { id: "u-air", name: "АК Тестовая", role: "AIRLINEADMIN", airlineId }
})

const hotelContext = () => ({
  subjectType: "USER",
  subject: { id: "u-hotel", name: "Гостиница", role: "HOTELADMIN", hotelId: "hotel-1" },
  user: { id: "u-hotel", name: "Гостиница", role: "HOTELADMIN", hotelId: "hotel-1" }
})

const ROW = { fullName: "SIDOROVA/MARIA", price: 1500, driverName: "Водитель", driverCost: 900, distanceKm: 10, supplierCost: null }
const DRAFT = { id: "reg-1", kind: "BAGGAGE", airlineId: "airline-1", airportId: "ap-1", number: "9", submittedAt: null, rows: [ROW], totals: { rowsCount: 1, airlineTotal: 1500, internalCost: 900 }, header: {} }
const SENT = { ...DRAFT, id: "reg-2", number: "10", submittedAt: new Date("2026-07-01T10:00:00.000Z") }

async function withDouble(documents, run) {
  const double = installPrismaDouble({ documents })
  try {
    return await run(double)
  } finally {
    double.restore()
  }
}

test("passengerServiceRegistries: АК получает только свои отправленные — и в where, и в памяти", async () => {
  await withDouble({ passengerServiceRegistryMany: [DRAFT, SENT] }, async (double) => {
    const list = await resolvers.Query.passengerServiceRegistries(null, { filter: { airlineId: "airline-2" } }, airlineContext())
    assert.deepEqual(list.map((r) => r.id), ["reg-2"])
    const where = double.callsTo("passengerServiceRegistry", "findMany")[0].args.where
    assert.equal(where.airlineId, "airline-1", "чужой airlineId из фильтра перебит скоупом")
    assert.deepEqual(where.submittedAt, { not: null })
  })
})

test("passengerServiceRegistries: диспетчер видит черновики; гостинице пусто", async () => {
  await withDouble({ passengerServiceRegistryMany: [DRAFT, SENT] }, async () => {
    const list = await resolvers.Query.passengerServiceRegistries(null, {}, makeContext())
    assert.deepEqual(list.map((r) => r.id), ["reg-1", "reg-2"])
    const hotelList = await resolvers.Query.passengerServiceRegistries(null, {}, hotelContext())
    assert.deepEqual(hotelList, [])
  })
})

test("passengerServiceRegistries: без стадии страница режется в Prisma, со стадией — в памяти", async () => {
  await withDouble({ passengerServiceRegistryMany: [DRAFT, SENT] }, async (double) => {
    // Двойник findMany не режет выборку, поэтому проверяем аргументы, а не длину списка.
    const page = await resolvers.Query.passengerServiceRegistries(null, { skip: 1, take: 1 }, makeContext())
    const pageArgs = double.callsTo("passengerServiceRegistry", "findMany")[0].args
    assert.equal(pageArgs.skip, 1)
    assert.equal(pageArgs.take, 1)
    assert.deepEqual(page.map((r) => r.id), ["reg-1", "reg-2"], "двойник отдаёт всё, что есть")

    const drafts = await resolvers.Query.passengerServiceRegistries(null, { filter: { stage: "DRAFT" } }, makeContext())
    const stageArgs = double.callsTo("passengerServiceRegistry", "findMany")[1].args
    assert.ok(!("skip" in stageArgs), "со стадией пагинация не уходит в Prisma")
    assert.ok(!("take" in stageArgs))
    assert.deepEqual(drafts.map((r) => r.id), ["reg-1"])
  })
})

test("passengerServiceRegistry: черновик авиакомпании не отдаётся, отправленный маскируется", async () => {
  await withDouble({ passengerServiceRegistry: DRAFT }, async () => {
    assert.equal(await resolvers.Query.passengerServiceRegistry(null, { id: "reg-1" }, airlineContext()), null)
  })
  await withDouble({ passengerServiceRegistry: SENT }, async () => {
    const reg = await resolvers.Query.passengerServiceRegistry(null, { id: "reg-2" }, airlineContext())
    assert.equal(reg.id, "reg-2")
    const rows = resolvers.PassengerServiceRegistry.rows(reg, {}, airlineContext())
    assert.equal(rows[0].driverCost, null)
    assert.equal(rows[0].driverName, null)
    assert.equal(rows[0].price, 1500)
    assert.equal(resolvers.PassengerServiceRegistry.totals(reg, {}, airlineContext()).internalCost, null)
    assert.equal(resolvers.PassengerServiceRegistry.totals(reg, {}, makeContext()).internalCost, 900)
    assert.equal(resolvers.PassengerServiceRegistry.stage(reg), "SUBMITTED")
  })
})

test("passengerServiceRegistryDefaults: последний номер, шапка и договор по предмету", async () => {
  await withDouble(
    {
      passengerServiceRegistry: { ...SENT, header: { appendixLabel: "Приложение №3", executorSignatory: "Иванова И.И.", customerName: "Старое имя" } },
      airlineContract: { contractNumber: "1147/25", date: new Date("2025-09-04T00:00:00.000Z") },
      airline: { id: "airline-1", name: "Тест", nameFull: "АО «Тест»" }
    },
    async (double) => {
      const d = await resolvers.Query.passengerServiceRegistryDefaults(null, { kind: "BAGGAGE", airlineId: "airline-1" }, makeContext())
      assert.equal(d.lastNumber, "10")
      assert.equal(d.header.appendixLabel, "Приложение №3")
      assert.equal(d.header.customerName, "АО «Тест»")
      assert.equal(d.contract.number, "1147/25")
      const where = double.callsTo("airlineContract", "findFirst")[0].args.where
      assert.equal(where.applicationType, "Доставка багажа")
      assert.equal(where.isArchived, false)
    }
  )
  await withDouble({ airline: { id: "airline-1", name: "Тест" } }, async (double) => {
    const d = await resolvers.Query.passengerServiceRegistryDefaults(null, { kind: "CATERING", airlineId: "airline-1" }, makeContext())
    assert.equal(d.lastNumber, null)
    assert.equal(d.contract, null)
    assert.equal(d.header.customerName, "Тест")
    assert.equal(double.callsTo("airlineContract", "findFirst")[0].args.where.applicationType, "Пассажиры")
  })
})

test("passengerServiceRegistryDefaults: авиакомпании и гостинице — FORBIDDEN", async () => {
  await withDouble({}, async () => {
    await assert.rejects(
      resolvers.Query.passengerServiceRegistryDefaults(null, { kind: "BAGGAGE", airlineId: "airline-1" }, airlineContext()),
      (e) => e.extensions?.code === "FORBIDDEN"
    )
  })
})

const REQUEST = {
  id: "req-1",
  requestNumber: "0010SVX0626f",
  flightNumber: "FV6601",
  flightDate: "2026-06-22T00:00:00.000Z",
  airlineId: "airline-1",
  airportId: "ap-1",
  status: "COMPLETED",
  savedPassengers: [],
  baggageDeliveryService: {
    plan: { enabled: true },
    drivers: [
      {
        id: "trip-1",
        fullName: "Водитель",
        deliveryCompletedAt: "2026-06-24T06:00:00.000Z",
        driverCost: 900,
        people: [{ fullName: "SIDOROVA/MARIA", baggageTags: ["FV1"], addressTo: "адрес", reportCost: 1500 }]
      }
    ]
  }
}

const CREATE_INPUT = {
  kind: "BAGGAGE",
  airlineId: "airline-1",
  airportId: "ap-1",
  periodStart: "2026-06-01",
  periodEnd: "2026-06-30",
  number: " 10 ",
  header: { appendixLabel: "Приложение №3", customerSignatory: "  ", unknownKey: "x" }
}

test("createPassengerServiceRegistry: собирает снимок, нормализует номер и шапку, границы по МСК", async () => {
  await withDouble({ passengerRequestMany: [REQUEST] }, async (double) => {
    const reg = await resolvers.Mutation.createPassengerServiceRegistry(null, { input: CREATE_INPUT }, makeContext())
    const data = double.callsTo("passengerServiceRegistry", "create")[0].args.data
    assert.equal(data.number, "10")
    assert.equal(data.header.appendixLabel, "Приложение №3")
    assert.equal(data.header.customerSignatory, null)
    assert.ok(!("unknownKey" in data.header))
    assert.equal(data.periodStart.toISOString(), "2026-05-31T21:00:00.000Z")
    assert.equal(data.periodEnd.toISOString(), "2026-06-30T20:59:59.999Z")
    assert.equal(data.rows.length, 1)
    assert.equal(data.rows[0].fullName, "SIDOROVA/MARIA")
    assert.deepEqual(data.totals, { rowsCount: 1, airlineTotal: 1500, internalCost: 900 })
    const where = double.callsTo("passengerRequest", "findMany")[0].args.where
    assert.deepEqual(where, { airlineId: "airline-1", airportId: "ap-1", status: { not: "CANCELLED" } })
    assert.ok(reg.id)
  })
})

// Log.newData читает и авиакомпания (Airline.logs отдаётся без маски), поэтому в
// журнал уходит компактный снимок: реквизиты и итог для АК, без строк и внутренних денег.
test("логи реестра: в Log.newData нет строк и внутренних денег, есть итог для АК", async () => {
  await withDouble({ passengerRequestMany: [REQUEST] }, async (double) => {
    await resolvers.Mutation.createPassengerServiceRegistry(null, { input: CREATE_INPUT }, makeContext())
    const payload = String(double.callsTo("log", "create")[0]?.args.data.newData ?? "")
    assert.ok(payload, "лог записан")
    assert.ok(!payload.includes("driverCost"), "внутренние деньги строк не попадают в Log.newData")
    assert.ok(!payload.includes("internalCost"), "внутренний итог не попадает в Log.newData")
    assert.ok(payload.includes("\"number\":\"10\""), "реквизиты остаются")
  })
  // create_* в logaction.js и сам режется по своему белому списку полей, поэтому
  // итог для АК проверяем на update — он идёт общей веткой, где раньше и лежал
  // весь реестр целиком.
  await withDouble({ passengerServiceRegistry: DRAFT, passengerRequestMany: [REQUEST] }, async (double) => {
    await resolvers.Mutation.updatePassengerServiceRegistry(
      null,
      { id: "reg-1", patch: { periodStart: "2026-06-01", periodEnd: "2026-06-30" } },
      makeContext()
    )
    const log = double.callsTo("log", "create")[0].args.data
    const payload = String(log.newData ?? "")
    assert.ok(!payload.includes("driverCost") && !payload.includes("internalCost"))
    assert.ok(payload.includes("rowsCount"), "итог для АК остаётся")
    assert.ok(String(log.oldData ?? "").includes("rowsCount"), "прежний реестр — таким же снимком")
  })
})

test("createPassengerServiceRegistry: пустой номер и перевёрнутый период — BAD_USER_INPUT; АК — FORBIDDEN", async () => {
  await withDouble({ passengerRequestMany: [] }, async () => {
    await assert.rejects(
      resolvers.Mutation.createPassengerServiceRegistry(null, { input: { ...CREATE_INPUT, number: "  " } }, makeContext()),
      (e) => e.extensions?.code === "BAD_USER_INPUT"
    )
    await assert.rejects(
      resolvers.Mutation.createPassengerServiceRegistry(null, { input: { ...CREATE_INPUT, periodStart: "2026-07-01" } }, makeContext()),
      (e) => e.extensions?.code === "BAD_USER_INPUT"
    )
    await assert.rejects(
      resolvers.Mutation.createPassengerServiceRegistry(null, { input: CREATE_INPUT }, airlineContext()),
      (e) => e.extensions?.code === "FORBIDDEN"
    )
  })
})

test("updatePassengerServiceRegistry: смена периода пересобирает строки, шапка — нет", async () => {
  await withDouble({ passengerServiceRegistry: DRAFT, passengerRequestMany: [REQUEST] }, async (double) => {
    await resolvers.Mutation.updatePassengerServiceRegistry(null, { id: "reg-1", patch: { header: { appendixLabel: "Приложение №2" } } }, makeContext())
    let data = double.callsTo("passengerServiceRegistry", "update")[0].args.data
    assert.equal(data.header.appendixLabel, "Приложение №2")
    assert.ok(!("rows" in data))
    assert.equal(double.callsTo("passengerRequest", "findMany").length, 0, "без смены периода заявки не читаются")

    await resolvers.Mutation.updatePassengerServiceRegistry(null, { id: "reg-1", patch: { periodStart: "2026-06-01", periodEnd: "2026-06-30" } }, makeContext())
    data = double.callsTo("passengerServiceRegistry", "update")[1].args.data
    assert.equal(data.rows.length, 1)
    assert.equal(data.totals.airlineTotal, 1500)
  })
})

test("утверждённый реестр заморожен: update/rebuild/unsubmit → FORBIDDEN", async () => {
  const approved = { ...SENT, airlineApprovedAt: new Date("2026-07-02T10:00:00.000Z") }
  await withDouble({ passengerServiceRegistry: approved }, async () => {
    for (const run of [
      () => resolvers.Mutation.updatePassengerServiceRegistry(null, { id: "reg-2", patch: { number: "11" } }, makeContext()),
      () => resolvers.Mutation.rebuildPassengerServiceRegistry(null, { id: "reg-2" }, makeContext()),
      () => resolvers.Mutation.unsubmitPassengerServiceRegistry(null, { id: "reg-2" }, makeContext())
    ]) {
      await assert.rejects(run(), (e) => e.extensions?.code === "FORBIDDEN")
    }
  })
})

test("deletePassengerServiceRegistry: отправленный не удаляется, черновик удаляется", async () => {
  await withDouble({ passengerServiceRegistry: SENT }, async () => {
    await assert.rejects(
      resolvers.Mutation.deletePassengerServiceRegistry(null, { id: "reg-2" }, makeContext()),
      (e) => e.extensions?.code === "FORBIDDEN",
      "состояние реестра не позволяет — это запрет, не кривой ввод"
    )
  })
  await withDouble({ passengerServiceRegistry: DRAFT }, async (double) => {
    assert.equal(await resolvers.Mutation.deletePassengerServiceRegistry(null, { id: "reg-1" }, makeContext()), true)
    assert.equal(double.callsTo("passengerServiceRegistry", "delete").length, 1)
  })
})

test("submit/unsubmit: отправка ставит submittedAt и шлёт уведомление АК", async () => {
  await withDouble({ passengerServiceRegistry: DRAFT, airline: { id: "airline-1", name: "Тест" }, airport: { id: "ap-1", city: "Тестовск" } }, async (double) => {
    const sent = await resolvers.Mutation.submitPassengerServiceRegistry(null, { id: "reg-1" }, makeContext())
    assert.ok(sent.submittedAt instanceof Date)
    const notification = double.callsTo("notification", "create")[0]
    assert.ok(notification, "сайтовое уведомление записано")
    assert.equal(notification.args.data.description.action, "submit_passenger_service_registry")
    assert.match(notification.args.data.description.description, /Реестр №9 по доставке багажа/)
    const back = await resolvers.Mutation.unsubmitPassengerServiceRegistry(null, { id: "reg-1" }, makeContext())
    assert.equal(back.submittedAt, null)
  })
})

test("setPassengerServiceRegistryAirlineApproved: только своя АК, отзыв требует причину, утверждение пишет дату", async () => {
  await withDouble({ passengerServiceRegistry: SENT, airline: { id: "airline-1", name: "Тест" }, airport: { id: "ap-1", city: "Тестовск" } }, async (double) => {
    await assert.rejects(
      resolvers.Mutation.setPassengerServiceRegistryAirlineApproved(null, { id: "reg-2", approved: true }, makeContext()),
      (e) => e.extensions?.code === "FORBIDDEN",
      "диспетчер не подписывает за АК"
    )
    await assert.rejects(
      resolvers.Mutation.setPassengerServiceRegistryAirlineApproved(null, { id: "reg-2", approved: true }, airlineContext("airline-2")),
      (e) => e.extensions?.code === "FORBIDDEN",
      "чужая АК"
    )
    await assert.rejects(
      resolvers.Mutation.setPassengerServiceRegistryAirlineApproved(null, { id: "reg-2", approved: false, comment: "  " }, airlineContext()),
      (e) => e.extensions?.code === "BAD_USER_INPUT"
    )
    const approved = await resolvers.Mutation.setPassengerServiceRegistryAirlineApproved(null, { id: "reg-2", approved: true }, airlineContext())
    assert.ok(approved.airlineApprovedAt instanceof Date)
    assert.equal(approved.airlineComment, null)
    const revoked = await resolvers.Mutation.setPassengerServiceRegistryAirlineApproved(null, { id: "reg-2", approved: false, comment: "Нет бирок у второй строки" }, airlineContext())
    assert.equal(revoked.airlineApprovedAt, null)
    assert.equal(revoked.airlineComment, "Нет бирок у второй строки")
    assert.ok(revoked.airlineCommentAt instanceof Date)
    assert.equal(resolvers.PassengerServiceRegistry.stage(revoked), "RETURNED")
    const actions = double.callsTo("notification", "create").map((c) => c.args.data.description.action)
    assert.deepEqual(actions, ["approve_passenger_service_registry_airline", "revoke_passenger_service_registry_airline"])
  })
})

test("setPassengerServiceRegistryAirlineApproved: неотправленный реестр утвердить нельзя", async () => {
  await withDouble({ passengerServiceRegistry: DRAFT }, async () => {
    await assert.rejects(
      resolvers.Mutation.setPassengerServiceRegistryAirlineApproved(null, { id: "reg-1", approved: true }, airlineContext()),
      (e) => e.extensions?.code === "FORBIDDEN"
    )
  })
})

test("setPassengerServiceRegistryAirlineApproved: отказ без прежнего утверждения — возврат на доработку", async () => {
  await withDouble({ passengerServiceRegistry: SENT, airline: { id: "airline-1", name: "Тест" }, airport: { id: "ap-1", city: "Тестовск" } }, async (double) => {
    await resolvers.Mutation.setPassengerServiceRegistryAirlineApproved(
      null,
      { id: "reg-2", approved: false, comment: "Нет бирок у второй строки" },
      airlineContext()
    )
    const description = double.callsTo("notification", "create")[0].args.data.description.description
    assert.match(description, /вернула на доработку/)
  })
})

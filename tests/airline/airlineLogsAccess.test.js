// Журнал авиакомпании отдавался любому вошедшему через airline/airlines:
// ФИО сотрудников и пассажиров, снимки данных со скрытыми ценами (ПДН-Е-07).

import test from "node:test"
import assert from "node:assert/strict"
import airlineResolver from "../../resolvers/airline/airline.resolver.js"
import { installPrismaDouble } from "../helpers/prismaDouble.js"
import { releasePubsubAfterTests } from "../helpers/fapHarness.js"

releasePubsubAfterTests()

const dispatcher = { subjectType: "USER", subject: { id: "u1", role: "SUPERADMIN" } }
const airlineAdmin = (airlineId) => ({
  subjectType: "USER",
  subject: { id: "u2", role: "AIRLINEADMIN", airlineId }
})
const airlinePersonal = {
  subjectType: "AIRLINE_PERSONAL",
  subject: { id: "p1", airlineId: "a1" }
}
const hotelAdmin = {
  subjectType: "USER",
  subject: { id: "u3", role: "HOTELADMIN", hotelId: "h1" }
}
const selfRegistered = { subjectType: "USER", subject: { id: "u4", role: "USER" } }

const runLogs = async (context) => {
  const db = installPrismaDouble({ documents: { logMany: [{ id: "l1" }] } })
  try {
    const result = await airlineResolver.Airline.logs(
      { id: "a1" },
      { pagination: { skip: 0, take: 10 } },
      context
    )
    return {
      result,
      calls: db.callsTo("log").length,
      where: db.callsTo("log", "findMany")[0]?.args?.where
    }
  } finally {
    db.restore()
  }
}

test("Airline.logs: чужим, персоналу и гостинице — пустой журнал без базы", async () => {
  for (const context of [
    airlineAdmin("a2"),
    airlinePersonal,
    hotelAdmin,
    selfRegistered,
    {}
  ]) {
    const { result, calls } = await runLogs(context)
    assert.deepEqual(result, { totalCount: 0, totalPages: 0, logs: [] })
    assert.equal(calls, 0, "без обращения к базе")
  }
})

test("Airline.logs: диспетчер и пользователь CRM этой АК видят журнал", async () => {
  for (const context of [dispatcher, airlineAdmin("a1")]) {
    const { result, where } = await runLogs(context)
    assert.deepEqual(where, { airlineId: "a1" })
    assert.deepEqual(result.logs, [{ id: "l1" }])
  }
})

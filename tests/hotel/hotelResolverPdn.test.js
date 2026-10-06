// Карточка гостиницы отдавалась любому вошедшему: в ней лежала копия ссылок
// входа внешней учётки гостиницы и размещённые лица всех организаций (ПДН-Е-07).

import test from "node:test"
import assert from "node:assert/strict"
import hotelResolver from "../../resolvers/hotel/hotel.resolver.js"
import { installPrismaDouble } from "../helpers/prismaDouble.js"
import { releasePubsubAfterTests } from "../helpers/fapHarness.js"

releasePubsubAfterTests()

const dispatcher = { subjectType: "USER", subject: { id: "u1", role: "SUPERADMIN" } }
const hotelAdmin = (hotelId) => ({
  subjectType: "USER",
  subject: { id: "u2", role: "HOTELADMIN", hotelId }
})
const airlineAdmin = {
  subjectType: "USER",
  subject: { id: "u3", role: "AIRLINEADMIN", airlineId: "a1" }
}
const selfRegistered = { subjectType: "USER", subject: { id: "u4", role: "USER" } }

test("ссылки входа гостиницы не отдаются никому, включая диспетчера", () => {
  const hotel = {
    id: "h1",
    externalLinkCRM: "https://crm.example/external-login?token=raw",
    externalLinkPWA: "https://pwa.example/external-login?token=raw"
  }
  for (const context of [dispatcher, hotelAdmin("h1"), airlineAdmin, selfRegistered, {}]) {
    assert.equal(hotelResolver.Hotel.externalLinkCRM(hotel, {}, context), null)
    assert.equal(hotelResolver.Hotel.externalLinkPWA(hotel, {}, context), null)
  }
})

const runChesses = async (context, args = {}) => {
  const db = installPrismaDouble({ documents: { hotelChessMany: [{ id: "hc1" }] } })
  try {
    const result = await hotelResolver.Hotel.hotelChesses({ id: "h1" }, args, context)
    const calls = db.callsTo("hotelChess", "findMany")
    return { result, calls: calls.length, where: calls[0]?.args?.where }
  } finally {
    db.restore()
  }
}

test("hotelChesses: без скоупа — пусто и без обращения к базе", async () => {
  for (const context of [selfRegistered, hotelAdmin("h2"), {}]) {
    const { result, calls } = await runChesses(context)
    assert.deepEqual(result, [])
    assert.equal(calls, 0)
  }
})

test("hotelChesses: диспетчер и своя гостиница получают все записи гостиницы", async () => {
  for (const context of [dispatcher, hotelAdmin("h1")]) {
    const { result, where } = await runChesses(context)
    assert.deepEqual(where, { hotelId: "h1" })
    assert.deepEqual(result, [{ id: "hc1" }])
  }
})

test("hotelChesses: авиакомпания — только свои заявки и резервы, даты поверх", async () => {
  const { where } = await runChesses(airlineAdmin, {
    hcPagination: { start: "2026-10-01T00:00:00.000Z", end: "2026-10-31T00:00:00.000Z" }
  })
  assert.equal(where.hotelId, "h1")
  assert.deepEqual(where.OR, [
    { request: { is: { airlineId: "a1" } } },
    { reserve: { is: { airlineId: "a1" } } }
  ])
  assert.equal(where.AND.length, 2, "фильтр по датам сохранился")
})

test("Hotel.logs: журнал гостиницы видит только диспетчер", async () => {
  const run = async (context) => {
    const db = installPrismaDouble({ documents: { logMany: [{ id: "l1" }] } })
    try {
      const result = await hotelResolver.Hotel.logs(
        { id: "h1" },
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
  for (const context of [hotelAdmin("h1"), airlineAdmin, selfRegistered, {}]) {
    const { result, calls } = await run(context)
    assert.deepEqual(result, { totalCount: 0, totalPages: 0, logs: [] })
    assert.equal(calls, 0, "без обращения к базе")
  }
  const { result, where } = await run(dispatcher)
  assert.deepEqual(where, { hotelId: "h1" })
  assert.deepEqual(result.logs, [{ id: "l1" }])
})

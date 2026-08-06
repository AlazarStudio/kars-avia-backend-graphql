// Даты переселения и выселения: проверка входа и порядка интервала.
//
// Скаляр Date в схеме сквозной — резолвера у него нет, разбора тоже, поэтому в
// мутацию попадает ровно то, что прислал клиент. До этой правки мусорная строка
// доезжала до Prisma как Invalid Date (сырая ошибка вместо внятного отказа),
// булево молча превращалось в эпоху, а дата раньше заселения давала
// перевёрнутый интервал {startAt > endAt}, по которому считаются сутки.
//
// ⚠️ Поведение не было покрыто вовсе. Тесты этого файла проверены КРАСНЫМИ со
// снятыми правками в envelope.js и chessHelpers.js.

import test from "node:test"
import assert from "node:assert/strict"
import resolvers from "../../resolvers/passengerRequest/passengerRequest.resolver.js"
import { assertMoment } from "../../services/passengerRequest/envelope.js"
import { installPrismaDouble } from "../helpers/prismaDouble.js"
import { installPubsubSpy, releasePubsubAfterTests } from "../helpers/fapHarness.js"
import { makeRequest, makeContext } from "./fixtures/passengerRequest.js"

releasePubsubAfterTests()

// Заселение гостя в фикстуре открыто этой датой — все проверки порядка
// отсчитываются от неё.
const FIXTURE_START = "2026-08-04T12:00:00.000Z"
const isBadInput = (error) => error?.extensions?.code === "BAD_USER_INPUT"

// ───────────────────────────── assertMoment ─────────────────────────────

test("assertMoment: отсутствующее значение означает «не прислали»", () => {
  assert.equal(assertMoment(null, "movedAt"), null)
  assert.equal(assertMoment(undefined, "movedAt"), null)
  // Пустая строка тоже: до правки `movedAt ? …` понимал её как «нет даты»,
  // и отказ на ней был бы изменением поведения, а не починкой.
  assert.equal(assertMoment("", "movedAt"), null)
})

test("assertMoment: строка и Date разбираются одинаково", () => {
  assert.equal(assertMoment(FIXTURE_START, "movedAt").toISOString(), FIXTURE_START)
  assert.equal(
    assertMoment(new Date(FIXTURE_START), "movedAt").toISOString(),
    FIXTURE_START
  )
})

test("assertMoment: мусорная строка отбивается, а не уезжает в Prisma", () => {
  assert.throws(() => assertMoment("вчера вечером", "movedAt"), isBadInput)
})

test("assertMoment: булево и объект отбиваются", () => {
  // ⚠️ Проверка типа не косметическая: булево приводится к числу, и
  // new Date(true) даёт 1970-01-01T00:00:00.001Z — без неё отметка «выселен в
  // 1970 году» прошла бы молча и валидной.
  assert.equal(new Date(true).getTime(), 1, "предпосылка проверки типа")
  assert.throws(() => assertMoment(true, "movedAt"), isBadInput)
  assert.throws(() => assertMoment({}, "evictedAt"), isBadInput)
})

test("assertMoment: дата из будущего отбивается", () => {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
  assert.throws(() => assertMoment(tomorrow, "evictedAt"), isBadInput)
})

test("assertMoment: минутное расхождение часов клиента допускается", () => {
  const soon = new Date(Date.now() + 60 * 1000)
  assert.equal(assertMoment(soon, "movedAt").getTime(), soon.getTime())
})

// ───────────────────────── мутации переселения ──────────────────────────

// Сырой стенд: нужен не нормализованный срез, а факт «в базу не ходили».
async function runRaw(name, args) {
  const double = installPrismaDouble({
    documents: { passengerRequest: makeRequest() }
  })
  const spy = installPubsubSpy()
  try {
    await resolvers.Mutation[name](null, args, makeContext())
    return { double, threw: null }
  } catch (error) {
    return { double, threw: error }
  } finally {
    spy.restore()
    double.restore()
  }
}

const relocateArgs = (movedAt) => ({
  requestId: "req-1",
  fromHotelIndex: 0,
  toHotelIndex: 1,
  personIndex: 0,
  reason: "переезд",
  movedAt
})

const evictArgs = (evictedAt) => ({
  requestId: "req-1",
  hotelIndex: 0,
  personIndex: 0,
  reason: "выселение",
  evictedAt
})

test("переселение с мусорной датой отбивается до записи", async () => {
  const run = await runRaw("relocatePassengerRequestHotelPerson", relocateArgs("мусор"))

  assert.ok(isBadInput(run.threw), "отказ BAD_USER_INPUT")
  assert.equal(
    run.double.callsTo("passengerRequest", "update").length,
    0,
    "документ не переписан"
  )
})

test("выселение датой из будущего отбивается", async () => {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  const run = await runRaw("evictPassengerRequestHotelPerson", evictArgs(tomorrow))

  assert.ok(isBadInput(run.threw))
  assert.equal(run.double.callsTo("passengerRequest", "update").length, 0)
})

test("переселение раньше заселения отбивается: интервал был бы перевёрнутым", async () => {
  const beforeCheckIn = "2026-08-04T09:00:00.000Z"
  const run = await runRaw(
    "relocatePassengerRequestHotelPerson",
    relocateArgs(beforeCheckIn)
  )

  assert.ok(isBadInput(run.threw))
  assert.equal(run.double.callsTo("passengerRequest", "update").length, 0)
})

test("пакетные мутации закрыты той же проверкой", async () => {
  const relocate = await runRaw("relocatePassengerRequestHotelPeople", {
    requestId: "req-1",
    fromHotelIndex: 0,
    toHotelIndex: 1,
    personIndexes: [0],
    reason: "переезд",
    movedAt: "мусор"
  })
  const evict = await runRaw("evictPassengerRequestHotelPeople", {
    requestId: "req-1",
    hotelIndex: 0,
    personIndexes: [0],
    reason: "выселение",
    evictedAt: "мусор"
  })

  assert.ok(isBadInput(relocate.threw))
  assert.ok(isBadInput(evict.threw))
})

test("обратная проверка: дата после заселения и не в будущем проходит", async () => {
  const run = await runRaw(
    "relocatePassengerRequestHotelPerson",
    relocateArgs("2026-08-05T08:00:00.000Z")
  )

  assert.equal(run.threw, null, "законная дата операции не отбивается")
  assert.equal(run.double.callsTo("passengerRequest", "update").length, 1)
})

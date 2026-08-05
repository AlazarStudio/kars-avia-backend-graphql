// Изменение состава или размещения гостей гасит отметку «отправлен на проверку»
// у отчёта этой гостиницы.
//
// Отчёт по проживанию не снимок: суммы в нём пересчитываются при каждом открытии
// (вид размещения выводится из числа жильцов номера). Поэтому отчёт, отправленный
// авиакомпании, после выселения или переселения показывал бы уже другие числа, а
// отметка отправки продолжала бы висеть. Правка снимает отметку, и отчёт
// пропадает у авиакомпании до повторной отправки.
//
// ⚠️ Поведение НЕ было покрыто вовсе — прогон до правки остался зелёным. Тесты
// этого файла проверены КРАСНЫМИ со снятой правкой в envelope.js.

import test from "node:test"
import assert from "node:assert/strict"
import resolvers from "../../resolvers/passengerRequest/passengerRequest.resolver.js"
import { installPrismaDouble } from "../helpers/prismaDouble.js"
import {
  installPubsubSpy,
  releasePubsubAfterTests
} from "../helpers/fapHarness.js"
import { PASSENGER_REQUEST_UPDATED } from "../../services/infra/pubsub.js"
import { makeRequest, makeContext } from "./fixtures/passengerRequest.js"

releasePubsubAfterTests()

// Сырой стенд: общий runFapMutation отдаёт нормализованный срез, а здесь нужны
// АРГУМЕНТЫ updateMany по отчётам и порядок вызовов относительно публикации.
// Тот же приём, что в living.characterization.test.js.
async function runRaw(name, args, context = makeContext()) {
  const double = installPrismaDouble({
    documents: { passengerRequest: makeRequest() }
  })
  const spy = installPubsubSpy()
  try {
    await resolvers.Mutation[name](null, args, context)
    return { double, published: spy.published }
  } finally {
    spy.restore()
    double.restore()
  }
}

const resets = (double) =>
  double.callsTo("passengerRequestHotelReport", "updateMany").map((c) => c.args)

test("выселение гасит отметку отправки у отчёта своей гостиницы", async () => {
  const { double } = await runRaw("evictPassengerRequestHotelPerson", {
    requestId: "req-1",
    hotelIndex: 0,
    personIndex: 0,
    reason: "ошибка заселения"
  })

  const calls = resets(double)
  assert.equal(calls.length, 1, "ровно одно обращение к отчётам")
  assert.equal(calls[0].where.passengerRequestId, "req-1")
  assert.deepEqual(calls[0].where.hotelIndex, { in: [0] }, "только своя гостиница")
  assert.deepEqual(
    calls[0].where.submittedAt,
    { not: null },
    "неотправленные отчёты не переписываем — сброс идемпотентен"
  )
  assert.deepEqual(calls[0].data, { submittedAt: null })
})

test("переселение гасит отметку у ОБЕИХ гостиниц", async () => {
  // Из одной уехал, в другую приехал — состав изменился у обеих, значит и
  // пересчитаются оба отчёта.
  const { double } = await runRaw("relocatePassengerRequestHotelPerson", {
    requestId: "req-1",
    fromHotelIndex: 0,
    toHotelIndex: 1,
    personIndex: 0,
    reason: "перевод в другую гостиницу"
  })

  const calls = resets(double)
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0].where.hotelIndex, { in: [0, 1] })
})

test("присвоение номера комнаты тоже гасит отметку", async () => {
  // Номер комнаты определяет вид размещения, а вид размещения — цену за сутки.
  const { double } = await runRaw("assignPassengerRequestHotelRoom", {
    requestId: "req-1",
    hotelIndex: 0,
    personIndexes: [0],
    roomNumber: "202"
  })

  assert.deepEqual(resets(double)[0]?.where.hotelIndex, { in: [0] })
})

test("сброс идёт ДО публикации в подписку", async () => {
  // Порядок несущий: публикация заставляет открытый клиент перечитать заявку.
  // Сбрось мы отметку после — клиент успел бы прочитать отчёт ещё отправленным.
  const { double, published } = await runRaw("evictPassengerRequestHotelPerson", {
    requestId: "req-1",
    hotelIndex: 0,
    personIndex: 0,
    reason: "ошибка заселения"
  })

  const resetSeq = double
    .callsTo("passengerRequestHotelReport", "updateMany")
    .map((c) => c.seq)[0]
  // Именно событие по заявке: выселение публикует ещё и NOTIFICATION.
  const updated = published.find((p) => p.topic === PASSENGER_REQUEST_UPDATED)
  assert.ok(resetSeq != null, "сброс случился")
  assert.ok(updated, "событие по заявке опубликовано")
  assert.ok(
    resetSeq < updated.seq,
    `сброс (${resetSeq}) обязан идти раньше публикации (${updated.seq})`
  )
})

test("подмена гостиницы гасит отметку, переименование — нет", async () => {
  // Тарифы и номерной фонд отчёта берутся по hotelId: сменили гостиницу —
  // сменились и цены, и вид размещения. А имя с адресом на числа не влияют.
  const swapped = await runRaw("updatePassengerRequestHotel", {
    requestId: "req-1",
    hotelIndex: 0,
    hotel: { hotelId: "hotel-99" }
  })
  assert.deepEqual(resets(swapped.double)[0]?.where.hotelIndex, { in: [0] })

  const renamed = await runRaw("updatePassengerRequestHotel", {
    requestId: "req-1",
    hotelIndex: 0,
    hotel: { name: "Азия (корпус 2)" }
  })
  assert.deepEqual(resets(renamed.double), [], "переименование отчёт не роняет")
})

test("обратная проверка: мутация не про проживание отчётов не трогает", async () => {
  // Правило узкое: гасит отметку только изменение состава и размещения в
  // гостинице. Вода, питание, трансфер и багаж к отчёту по проживанию
  // отношения не имеют.
  const { double } = await runRaw("addPassengerRequestPerson", {
    requestId: "req-1",
    service: "WATER",
    person: { fullName: "Сидоров Сидор" }
  })

  assert.deepEqual(resets(double), [], "отчёты не тронуты")
})

test("обратная проверка: заявка всё равно записывается и публикуется", async () => {
  // Сброс — побочный шаг конверта, он не должен подменять собой основную запись.
  const { double, published } = await runRaw("evictPassengerRequestHotelPerson", {
    requestId: "req-1",
    hotelIndex: 0,
    personIndex: 0,
    reason: "ошибка заселения"
  })

  assert.equal(
    double.callsTo("passengerRequest", "update").length,
    1,
    "заявка записана"
  )
  assert.equal(double.callsTo("log", "create").length, 1, "история написана")
  assert.ok(
    published.some((p) => p.topic === PASSENGER_REQUEST_UPDATED),
    "событие по заявке опубликовано"
  )
})

import test from "node:test"
import assert from "node:assert/strict"
import {
  computeTzOffset,
  extractCancellationPolicy,
  extractPropertyTimeZone,
  normalizeTzOffset,
  pickRoomTypeName
} from "../../services/travelline/travellineMappers.js"

test("computeTzOffset: local на 3ч впереди utc → UTC+03:00", () => {
  assert.equal(
    computeTzOffset("2026-07-15T10:00", "2026-07-15T07:00"),
    "UTC+03:00"
  )
})

test("computeTzOffset: равные моменты → UTC+00:00", () => {
  assert.equal(computeTzOffset("2026-07-15T07:00", "2026-07-15T07:00"), "UTC+00:00")
})

test("computeTzOffset: нет данных → null", () => {
  assert.equal(computeTzOffset(null, "2026-07-15T07:00"), null)
})

test("extractCancellationPolicy: вычисляет пояс из local/utc", () => {
  const r = extractCancellationPolicy({
    penaltyAmount: 72,
    freeCancellationDeadlineLocal: "2026-07-14T13:00",
    freeCancellationDeadlineUtc: "2026-07-14T10:00"
  })
  assert.equal(r.amount, 72)
  assert.equal(r.deadline, "2026-07-14T13:00")
  assert.equal(r.deadlineUtc, "2026-07-14T10:00")
  assert.equal(r.timezone, "UTC+03:00")
})

test("extractCancellationPolicy: нет штрафа → null", () => {
  assert.equal(extractCancellationPolicy({ penaltyAmount: 0 }), null)
  assert.equal(extractCancellationPolicy(null), null)
})

test("pickRoomTypeName: имя берётся из Content API по id", () => {
  const content = [{ id: "340935", name: "Семейные Апартаменты" }]
  assert.equal(pickRoomTypeName("340935", content, "1 взрослый"), "Семейные Апартаменты")
})

test("pickRoomTypeName: нет совпадения → fallback", () => {
  assert.equal(pickRoomTypeName("999", [], "запасное"), "запасное")
})

test("normalizeTzOffset: IANA Europe/Moscow → UTC+03:00", () => {
  assert.equal(normalizeTzOffset("Europe/Moscow", "2026-07-15T13:00"), "UTC+03:00")
})

test("normalizeTzOffset: готовое смещение остаётся нормализованным", () => {
  assert.equal(normalizeTzOffset("UTC+03:00"), "UTC+03:00")
  assert.equal(normalizeTzOffset("+3"), "UTC+03:00")
  assert.equal(normalizeTzOffset("+05:30"), "UTC+05:30")
  assert.equal(normalizeTzOffset("GMT-4"), "UTC-04:00")
})

test("normalizeTzOffset: пусто/мусор → null", () => {
  assert.equal(normalizeTzOffset(null), null)
  assert.equal(normalizeTzOffset(""), null)
  assert.equal(normalizeTzOffset("не-пояс"), null)
})

test("extractPropertyTimeZone: достаёт пояс из разных мест объекта", () => {
  assert.equal(extractPropertyTimeZone({ timeZone: "Europe/Moscow" }), "Europe/Moscow")
  assert.equal(
    extractPropertyTimeZone({ contactInfo: { timeZone: "Asia/Yekaterinburg" } }),
    "Asia/Yekaterinburg"
  )
  assert.equal(extractPropertyTimeZone(null), null)
})

test("extractPropertyTimeZone: разворачивает объект { id } из TL Content API", () => {
  assert.equal(extractPropertyTimeZone({ timeZone: { id: "Europe/Samara" } }), "Europe/Samara")
  assert.equal(
    normalizeTzOffset(extractPropertyTimeZone({ timeZone: { id: "Europe/Samara" } }), "2026-07-15T15:00"),
    "UTC+04:00"
  )
})

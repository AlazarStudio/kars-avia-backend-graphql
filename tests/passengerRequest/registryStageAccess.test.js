import test from "node:test"
import assert from "node:assert/strict"
import { registryStage, REGISTRY_STAGES } from "../../services/passengerRequest/registryStage.js"
import {
  INTERNAL_ROW_KEYS,
  maskRegistryForScope,
  maskRegistryRows,
  registryVisibleForScope,
  registryListWhere,
  assertDispatcherScope,
  assertAirlineOwnsRegistry
} from "../../services/passengerRequest/registryAccess.js"

const all = { kind: "all" }
const air1 = { kind: "airline", airlineId: "airline-1" }
const hotel = { kind: "hotel", hotelId: "hotel-1" }

test("registryStage: DRAFT → SUBMITTED → RETURNED → APPROVED", () => {
  assert.equal(registryStage({}), "DRAFT")
  assert.equal(registryStage({ submittedAt: "2026-07-01T10:00:00Z" }), "SUBMITTED")
  assert.equal(
    registryStage({ submittedAt: "2026-07-01T10:00:00Z", airlineCommentAt: "2026-07-02T10:00:00Z" }),
    "RETURNED",
    "комментарий позже отправки — возвращён"
  )
  assert.equal(
    registryStage({ submittedAt: "2026-07-03T10:00:00Z", airlineCommentAt: "2026-07-02T10:00:00Z" }),
    "SUBMITTED",
    "переотправка после возврата гасит метку"
  )
  assert.equal(
    registryStage({ submittedAt: "2026-07-01T10:00:00Z", airlineCommentAt: "2026-07-02T10:00:00Z", airlineApprovedAt: "2026-07-02T10:00:00Z" }),
    "APPROVED",
    "утверждение старше всего"
  )
  assert.deepEqual(REGISTRY_STAGES, ["DRAFT", "SUBMITTED", "RETURNED", "APPROVED"])
})

test("registryVisibleForScope: диспетчер всё, АК — свои отправленные, гостиница — ничего", () => {
  const draft = { airlineId: "airline-1", submittedAt: null }
  const sent = { airlineId: "airline-1", submittedAt: "2026-07-01T10:00:00Z" }
  const foreign = { airlineId: "airline-2", submittedAt: "2026-07-01T10:00:00Z" }
  assert.equal(registryVisibleForScope(all, draft), true)
  assert.equal(registryVisibleForScope(air1, draft), false)
  assert.equal(registryVisibleForScope(air1, sent), true)
  assert.equal(registryVisibleForScope(air1, foreign), false)
  assert.equal(registryVisibleForScope(hotel, sent), false)
})

test("registryListWhere: скоуп АК добавляет airlineId и submittedAt, чужой фильтр АК не пробивает", () => {
  assert.deepEqual(registryListWhere(all, { kind: "BAGGAGE", airlineId: "airline-2" }), {
    kind: "BAGGAGE",
    airlineId: "airline-2"
  })
  assert.deepEqual(registryListWhere(air1, { kind: "BAGGAGE", airlineId: "airline-2" }), {
    kind: "BAGGAGE",
    airlineId: "airline-1",
    submittedAt: { not: null }
  })
  assert.equal(registryListWhere(hotel, {}), null)
  const where = registryListWhere(all, { airportId: "ap-1", dateFrom: "2026-06-01", dateTo: "2026-06-30" })
  assert.equal(where.airportId, "ap-1")
  assert.ok(where.periodStart.lte instanceof Date, "период пересекается: начало ≤ конец фильтра")
  assert.ok(where.periodEnd.gte instanceof Date)
  const isoWhere = registryListWhere(all, { dateFrom: "2026-06-01T00:00:00.000Z" })
  assert.equal(isoWhere.periodEnd.gte.toISOString(), "2026-06-01T00:00:00.000Z", "полная ISO-строка — как есть")
  const garbageWhere = registryListWhere(all, { dateTo: "вчера" })
  assert.ok(!("periodStart" in garbageWhere), "невалидное значение — границы нет")
})

test("maskRegistryForScope: не-диспетчеру внутренние ключи строк и internalCost — null", () => {
  const registry = {
    rows: [{ fullName: "Иванов", price: 1500, driverName: "В.", driverCost: 900, distanceKm: 12, supplierCost: null }],
    totals: { rowsCount: 1, airlineTotal: 1500, internalCost: 900 }
  }
  const masked = maskRegistryForScope(air1, registry)
  for (const key of INTERNAL_ROW_KEYS) assert.equal(masked.rows[0][key], null)
  assert.equal(masked.rows[0].price, 1500)
  assert.equal(masked.totals.internalCost, null)
  assert.equal(masked.totals.airlineTotal, 1500)
  assert.equal(maskRegistryForScope(all, registry), registry, "диспетчеру — тот же объект")
  assert.deepEqual(maskRegistryRows(all, "мусор"), [], "снимок rows — Json: не-массив переживаем пустым списком")
})

test("assertDispatcherScope / assertAirlineOwnsRegistry — коды ошибок", () => {
  assert.throws(() => assertDispatcherScope({ kind: "airline", airlineId: "a" }), (e) => e.extensions?.code === "FORBIDDEN")
  assert.doesNotThrow(() => assertDispatcherScope(all))
  assert.throws(() => assertAirlineOwnsRegistry(all, { airlineId: "airline-1" }), (e) => e.extensions?.code === "FORBIDDEN")
  assert.throws(() => assertAirlineOwnsRegistry(air1, { airlineId: "airline-2" }), (e) => e.extensions?.code === "FORBIDDEN")
  assert.doesNotThrow(() => assertAirlineOwnsRegistry(air1, { airlineId: "airline-1" }))
})

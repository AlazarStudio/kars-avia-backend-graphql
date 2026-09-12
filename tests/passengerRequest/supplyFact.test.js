import test from "node:test"
import assert from "node:assert/strict"
import { collectSupplyPatch } from "../../services/passengerRequest/supplyFact.js"

test("collectSupplyPatch: берёт только присутствующие ключи", () => {
  assert.deepEqual(collectSupplyPatch({ supplier: " Моя столовая " }), { supplier: "Моя столовая" })
  assert.deepEqual(collectSupplyPatch({}), {})
})

test("collectSupplyPatch: null сбрасывает поле, ключ остаётся", () => {
  const applied = collectSupplyPatch({ supplier: null, suppliedAt: null, quantity: null })
  assert.deepEqual(applied, { supplier: null, suppliedAt: null, quantity: null })
})

test("collectSupplyPatch: деньги округляются до копеек, отрицательные → null", () => {
  const applied = collectSupplyPatch({ unitPrice: 60.004, deliveryCost: "800", supplierCost: -5 })
  assert.deepEqual(applied, { unitPrice: 60, deliveryCost: 800, supplierCost: null })
})

test("collectSupplyPatch: quantity — целое ≥ 0, дробное и отрицательное → null", () => {
  assert.equal(collectSupplyPatch({ quantity: 94 }).quantity, 94)
  assert.equal(collectSupplyPatch({ quantity: "100" }).quantity, 100)
  assert.equal(collectSupplyPatch({ quantity: 2.5 }).quantity, null)
  assert.equal(collectSupplyPatch({ quantity: -1 }).quantity, null)
})

test("collectSupplyPatch: suppliedAt строкой → Date, мусор → ошибка BAD_USER_INPUT", () => {
  const applied = collectSupplyPatch({ suppliedAt: "2026-08-22T08:01:00.000Z" })
  assert.ok(applied.suppliedAt instanceof Date)
  assert.equal(applied.suppliedAt.toISOString(), "2026-08-22T08:01:00.000Z")
  assert.throws(
    () => collectSupplyPatch({ suppliedAt: "вчера" }),
    (e) => e.extensions?.code === "BAD_USER_INPUT"
  )
})

test("collectSupplyPatch: неподдерживаемый тип даты → BAD_USER_INPUT", () => {
  // new Date(true) молча даёт эпоху — тип проверяем отдельно от разбора,
  // как в assertMoment (envelope.js).
  assert.throws(
    () => collectSupplyPatch({ suppliedAt: true }),
    (e) => e.extensions?.code === "BAD_USER_INPUT"
  )
})

test("collectSupplyPatch: чужие ключи игнорируются", () => {
  assert.deepEqual(collectSupplyPatch({ people: [], status: "COMPLETED", supplier: "X" }), { supplier: "X" })
})

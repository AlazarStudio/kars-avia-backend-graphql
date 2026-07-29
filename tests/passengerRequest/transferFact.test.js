import test from "node:test"
import assert from "node:assert/strict"
import {
  driverFactCount,
  resolveDriverCountStatus,
  transferFactCount
} from "../../services/passengerRequest/serviceStatus.js"

test("факт = списку, когда число не задано", () => {
  assert.equal(driverFactCount({ people: [{}, {}] }), 2)
})

test("факт = числу при пустом списке", () => {
  assert.equal(driverFactCount({ people: [], transportedCount: 18 }), 18)
})

test("факт = max(список, число) — без двойного счёта", () => {
  assert.equal(driverFactCount({ people: [{}, {}, {}], transportedCount: 2 }), 3)
  assert.equal(driverFactCount({ people: [{}], transportedCount: 20 }), 20)
})

test("легаси-водитель без поля и пустые значения", () => {
  assert.equal(driverFactCount({ people: [{}] }), 1)
  assert.equal(driverFactCount({}), 0)
  assert.equal(driverFactCount({ transportedCount: null }), 0)
  assert.equal(driverFactCount({ transportedCount: -3 }), 0)
  assert.equal(driverFactCount({ people: [{}], transportedCount: 2.5 }), 1)
})

test("сумма по поездкам услуги", () => {
  assert.equal(
    transferFactCount([
      { people: [{}], transportedCount: 5 },
      { people: [{}, {}] }
    ]),
    7
  )
  assert.equal(transferFactCount([]), 0)
  assert.equal(transferFactCount(null), 0)
})

test("resolveDriverCountStatus: рост/без изменения на COMPLETED — null", () => {
  const svc = { status: "COMPLETED", times: {}, plan: { peopleCount: 18 } }
  assert.equal(resolveDriverCountStatus(svc, 18, 20), null)
  assert.equal(resolveDriverCountStatus(svc, 18, 18), null)
})

test("resolveDriverCountStatus: падение ниже плана — реоткрытие", () => {
  const svc = { status: "COMPLETED", times: { finishedAt: "x" }, plan: { peopleCount: 18 } }
  const r = resolveDriverCountStatus(svc, 20, 10)
  assert.equal(r.status, "IN_PROGRESS")
  assert.equal(r.times.finishedAt, null)
})

test("resolveDriverCountStatus: падение при plan=null — остаётся COMPLETED", () => {
  const svc = { status: "COMPLETED", times: {}, plan: { peopleCount: null } }
  const r = resolveDriverCountStatus(svc, 20, 10)
  assert.equal(r.status, "COMPLETED")
})

test("resolveDriverCountStatus: обычные переходы — как recompute", () => {
  const s1 = resolveDriverCountStatus({ status: "NEW", times: {}, plan: { peopleCount: 18 } }, 0, 5)
  assert.equal(s1.status, "IN_PROGRESS")
  const s2 = resolveDriverCountStatus({ status: "IN_PROGRESS", times: {}, plan: { peopleCount: 18 } }, 5, 18)
  assert.equal(s2.status, "COMPLETED")
})

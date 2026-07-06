import test from "node:test"
import assert from "node:assert/strict"
import { recomputeServiceStatus } from "../../services/passengerRequest/serviceStatus.js"

test("NEW + первый человек → IN_PROGRESS", () => {
  const r = recomputeServiceStatus(
    { status: "NEW", times: {}, plan: { peopleCount: 3 } },
    0,
    1
  )
  assert.equal(r.status, "IN_PROGRESS")
  assert.ok(r.times.inProgressAt)
})

test("ACCEPTED + человек → IN_PROGRESS", () => {
  const r = recomputeServiceStatus(
    { status: "ACCEPTED", times: {}, plan: { peopleCount: 3 } },
    0,
    1
  )
  assert.equal(r.status, "IN_PROGRESS")
})

test("IN_PROGRESS + человек ниже плана → IN_PROGRESS", () => {
  const r = recomputeServiceStatus(
    { status: "IN_PROGRESS", times: {}, plan: { peopleCount: 3 } },
    1,
    2
  )
  assert.equal(r.status, "IN_PROGRESS")
})

test("IN_PROGRESS + достигли плана → COMPLETED", () => {
  const r = recomputeServiceStatus(
    { status: "IN_PROGRESS", times: {}, plan: { peopleCount: 3 } },
    2,
    3
  )
  assert.equal(r.status, "COMPLETED")
  assert.ok(r.times.finishedAt)
})

test("COMPLETED + добавили человека (выше плана) → IN_PROGRESS, finishedAt сброшен", () => {
  const r = recomputeServiceStatus(
    { status: "COMPLETED", times: { finishedAt: new Date() }, plan: { peopleCount: 3 } },
    3,
    4
  )
  assert.equal(r.status, "IN_PROGRESS")
  assert.equal(r.times.finishedAt, null)
})

test("COMPLETED + добавили человека без плана → IN_PROGRESS (кейс из репорта)", () => {
  const r = recomputeServiceStatus(
    { status: "COMPLETED", times: { finishedAt: new Date() }, plan: null },
    2,
    3
  )
  assert.equal(r.status, "IN_PROGRESS")
  assert.equal(r.times.finishedAt, null)
})

test("COMPLETED + удалили, но всё ещё >= плана → COMPLETED", () => {
  const r = recomputeServiceStatus(
    { status: "COMPLETED", times: { finishedAt: new Date() }, plan: { peopleCount: 3 } },
    5,
    4
  )
  assert.equal(r.status, "COMPLETED")
})

test("COMPLETED + удалили ниже плана → IN_PROGRESS, finishedAt сброшен", () => {
  const r = recomputeServiceStatus(
    { status: "COMPLETED", times: { finishedAt: new Date() }, plan: { peopleCount: 3 } },
    3,
    2
  )
  assert.equal(r.status, "IN_PROGRESS")
  assert.equal(r.times.finishedAt, null)
})

test("CANCELLED — не меняется", () => {
  const r = recomputeServiceStatus(
    { status: "CANCELLED", times: {}, plan: { peopleCount: 3 } },
    1,
    5
  )
  assert.equal(r.status, "CANCELLED")
})

test("правка плана (число не менялось): COMPLETED, план поднят выше факта → IN_PROGRESS", () => {
  const r = recomputeServiceStatus(
    { status: "COMPLETED", times: { finishedAt: new Date() }, plan: { peopleCount: 5 } },
    3,
    3
  )
  assert.equal(r.status, "IN_PROGRESS")
})

test("правка полей без изменения числа: COMPLETED → COMPLETED", () => {
  const r = recomputeServiceStatus(
    { status: "COMPLETED", times: { finishedAt: new Date() }, plan: { peopleCount: 3 } },
    3,
    3
  )
  assert.equal(r.status, "COMPLETED")
})

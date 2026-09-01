import test from "node:test"
import assert from "node:assert/strict"
import {
  buildReportDraftsWhere,
  isAirlineOrgUser,
  isDispatcherUser
} from "../../services/report/reportAccess.js"

test("диспетчер не считается пользователем АК", () => {
  assert.equal(
    isDispatcherUser({ role: "DISPATCHERADMIN", dispatcher: true }),
    true
  )
  assert.equal(
    isAirlineOrgUser({
      role: "DISPATCHERADMIN",
      airlineId: "air-1",
      dispatcher: true
    }),
    false
  )
})

test("AIRLINEADMIN — пользователь АК", () => {
  assert.equal(
    isAirlineOrgUser({ role: "AIRLINEADMIN", airlineId: "air-1" }),
    true
  )
})

test("АК не видит DRAFT в списке черновиков", () => {
  const user = { role: "AIRLINEADMIN", airlineId: "air-1" }
  assert.deepEqual(buildReportDraftsWhere(user, { status: "DRAFT" }), {
    __empty: true
  })

  const where = buildReportDraftsWhere(user, {})
  assert.equal(where.type, "AIRLINE")
  assert.equal(where.airlineId, "air-1")
  assert.deepEqual(where.status, { in: ["SUBMITTED", "CONFIRMED"] })
})

test("диспетчер видит DRAFT", () => {
  const where = buildReportDraftsWhere(
    { role: "DISPATCHERADMIN", dispatcher: true },
    { status: "DRAFT", type: "AIRLINE" }
  )
  assert.equal(where.status, "DRAFT")
  assert.equal(where.type, "AIRLINE")
  assert.equal(where.__empty, undefined)
})

test("АК может запросить только SUBMITTED или CONFIRMED", () => {
  const user = { role: "AIRLINEADMIN", airlineId: "air-1" }
  const where = buildReportDraftsWhere(user, { status: "SUBMITTED" })
  assert.equal(where.status, "SUBMITTED")
})

import test from "node:test"
import assert from "node:assert/strict"
import {
  canReadAirlineLogs,
  canReadHotelLogs,
  emptyLogConnection
} from "../../services/log/entityLogAccess.js"

const user = (role, extra = {}) => ({
  subjectType: "USER",
  subject: { id: `u-${role}`, role, ...extra }
})

test("журнал гостиницы — только диспетчерам", () => {
  for (const role of ["SUPERADMIN", "DISPATCHERADMIN", "DISPATCHERMODERATOR"]) {
    assert.equal(canReadHotelLogs(user(role)), true, role)
  }
  const nobody = [
    user("HOTELADMIN", { hotelId: "h1" }),
    user("AIRLINEADMIN", { airlineId: "a1" }),
    user("USER"),
    { subjectType: "AIRLINE_PERSONAL", subject: { id: "p1", airlineId: "a1" } },
    { subjectType: "DRIVER", subject: { id: "d1" } },
    { subjectType: "EXTERNAL_USER", subject: { id: "e1", scope: "HOTEL", hotelId: "h1" } },
    {}
  ]
  for (const context of nobody) {
    assert.equal(canReadHotelLogs(context), false, JSON.stringify(context))
  }
})

test("журнал авиакомпании — диспетчерам и пользователям CRM этой АК", () => {
  assert.equal(canReadAirlineLogs(user("SUPERADMIN"), "a1"), true)
  assert.equal(canReadAirlineLogs(user("AIRLINEADMIN", { airlineId: "a1" }), "a1"), true)
  assert.equal(canReadAirlineLogs(user("AIRLINEMODERATOR", { airlineId: "a1" }), "a1"), true)
  const nobody = [
    user("AIRLINEADMIN", { airlineId: "a2" }),
    user("AIRLINEADMIN"),
    { subjectType: "AIRLINE_PERSONAL", subject: { id: "p1", airlineId: "a1" } },
    user("HOTELADMIN", { hotelId: "h1" }),
    user("USER"),
    { subjectType: "DRIVER", subject: { id: "d1" } },
    {
      subjectType: "EXTERNAL_USER",
      subject: { id: "e3", scope: "REPRESENTATIVE", airlineId: "a1", airportId: "ap1" }
    },
    {}
  ]
  for (const context of nobody) {
    assert.equal(canReadAirlineLogs(context, "a1"), false, JSON.stringify(context))
  }
})

test("пустой журнал — новый объект на каждый вызов", () => {
  const a = emptyLogConnection()
  const b = emptyLogConnection()
  assert.deepEqual(a, { totalCount: 0, totalPages: 0, logs: [] })
  assert.notEqual(a.logs, b.logs)
})

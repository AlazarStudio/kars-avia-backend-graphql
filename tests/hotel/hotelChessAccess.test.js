import test from "node:test"
import assert from "node:assert/strict"
import { hotelChessScopeWhere } from "../../services/hotel/hotelChessAccess.js"

const user = (role, extra = {}) => ({
  subjectType: "USER",
  subject: { id: `u-${role}`, role, ...extra }
})

const AIRLINE_ONLY = (airlineId) => ({
  hotelId: "h1",
  OR: [
    { request: { is: { airlineId } } },
    { reserve: { is: { airlineId } } }
  ]
})

test("диспетчерские роли видят все записи гостиницы", () => {
  for (const role of ["SUPERADMIN", "DISPATCHERADMIN", "DISPATCHERMODERATOR"]) {
    assert.deepEqual(hotelChessScopeWhere(user(role), "h1"), { hotelId: "h1" }, role)
  }
})

test("гостиница видит только свою гостиницу", () => {
  assert.deepEqual(
    hotelChessScopeWhere(user("HOTELADMIN", { hotelId: "h1" }), "h1"),
    { hotelId: "h1" }
  )
  assert.equal(hotelChessScopeWhere(user("HOTELADMIN", { hotelId: "h2" }), "h1"), null)
  assert.equal(hotelChessScopeWhere(user("HOTELMODERATOR", { hotelId: "h2" }), "h1"), null)

  const hotelLink = (hotelId) => ({
    subjectType: "EXTERNAL_USER",
    subject: { id: "e1", scope: "HOTEL", hotelId }
  })
  assert.deepEqual(hotelChessScopeWhere(hotelLink("h1"), "h1"), { hotelId: "h1" })
  assert.equal(hotelChessScopeWhere(hotelLink("h2"), "h1"), null)
})

test("пользователь CRM авиакомпании видит только свои заявки и резервы", () => {
  assert.deepEqual(
    hotelChessScopeWhere(user("AIRLINEADMIN", { airlineId: "a1" }), "h1"),
    AIRLINE_ONLY("a1")
  )
  assert.deepEqual(
    hotelChessScopeWhere(user("AIRLINEMODERATOR", { airlineId: "a2" }), "h1"),
    AIRLINE_ONLY("a2")
  )
})

test("остальные не видят ничего", () => {
  const nobody = [
    { subjectType: "AIRLINE_PERSONAL", subject: { id: "p1", airlineId: "a1" } },
    user("USER"),
    user("AIRLINEUSER", { airlineId: "a1" }),
    user("AIRLINEADMIN"),
    { subjectType: "DRIVER", subject: { id: "d1" } },
    { subjectType: "EXTERNAL_USER", subject: { id: "e2", scope: "DRIVER", passengerRequestId: "r1" } },
    {
      subjectType: "EXTERNAL_USER",
      subject: { id: "e3", scope: "REPRESENTATIVE", airlineId: "a1", airportId: "ap1" }
    },
    { subjectType: "HOTEL_PREVIEW", subject: { hotelId: "h1" } },
    {}
  ]
  for (const context of nobody) {
    assert.equal(hotelChessScopeWhere(context, "h1"), null, JSON.stringify(context))
  }
})

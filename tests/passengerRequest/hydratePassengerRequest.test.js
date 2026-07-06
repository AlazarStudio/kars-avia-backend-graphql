import test from "node:test"
import assert from "node:assert/strict"
import { hydratePassengerRequest } from "../../services/passengerRequest/hydratePassengerRequest.js"

test("накладывает идентичность ростера на water/hotel/driver-персон по personId", () => {
  const req = {
    savedPassengers: [
      { personId: "p1", fullName: "New Name", phone: "999", personType: "CREW", personCategory: "CHILD", seat: "1A", airlinePersonalId: "a1" }
    ],
    waterService: { people: [{ personId: "p1", fullName: "Old", personCategory: "ADULT" }] },
    livingService: { hotels: [{ people: [{ personId: "p1", fullName: "Old", personCategory: "ADULT", roomNumber: "101" }] }] },
    transferService: { drivers: [{ people: [{ personId: "p1", fullName: "Old", personCategory: "ADULT" }] }] }
  }
  const h = hydratePassengerRequest(req)
  assert.equal(h.waterService.people[0].fullName, "New Name")
  assert.equal(h.waterService.people[0].personCategory, "CHILD")
  assert.equal(h.livingService.hotels[0].people[0].fullName, "New Name")
  assert.equal(h.livingService.hotels[0].people[0].roomNumber, "101")
  assert.equal(h.transferService.drivers[0].people[0].personCategory, "CHILD")
})

test("персона без совпадения в ростере не меняется", () => {
  const req = {
    savedPassengers: [{ personId: "p1", fullName: "X", personCategory: "ADULT" }],
    waterService: { people: [{ personId: "p2", fullName: "Keep", personCategory: "CHILD" }] }
  }
  const h = hydratePassengerRequest(req)
  assert.equal(h.waterService.people[0].fullName, "Keep")
  assert.equal(h.waterService.people[0].personCategory, "CHILD")
})

test("персона без personId не меняется; пустой ростер/ null возвращаются как есть", () => {
  const req = { savedPassengers: [], waterService: { people: [{ fullName: "NoId" }] } }
  const h = hydratePassengerRequest(req)
  assert.equal(h.waterService.people[0].fullName, "NoId")
  assert.equal(hydratePassengerRequest(null), null)
})

test("null-поля ростера не затирают значения персоны", () => {
  const req = {
    savedPassengers: [{ personId: "p1", fullName: "N", phone: null, personCategory: "ADULT" }],
    livingService: { hotels: [{ people: [{ personId: "p1", fullName: "O", phone: "555", personType: "CREW", airlinePersonalId: "a9", roomNumber: "5" }] }] }
  }
  const h = hydratePassengerRequest(req)
  assert.equal(h.livingService.hotels[0].people[0].phone, "555")
  assert.equal(h.livingService.hotels[0].people[0].personType, "CREW")
  assert.equal(h.livingService.hotels[0].people[0].airlinePersonalId, "a9")
})

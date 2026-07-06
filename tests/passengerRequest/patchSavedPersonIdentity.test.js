import test from "node:test"
import assert from "node:assert/strict"
import {
  upsertSavedPassenger,
  patchSavedPersonIdentity
} from "../../services/passengerRequest/savedPassengers.js"

test("правка отеля переносит идентичность в ростер (incoming-wins), seat ростера сохранён", () => {
  let roster = upsertSavedPassenger([], {
    personId: "p1", fullName: "Old", seat: "12A", personCategory: "ADULT"
  })
  roster = patchSavedPersonIdentity(roster, {
    personId: "p1", fullName: "New", phone: "999", personType: "CREW",
    personCategory: "CHILD", airlinePersonalId: "a1", roomNumber: "101"
  })
  assert.equal(roster.length, 1)
  assert.equal(roster[0].fullName, "New")
  assert.equal(roster[0].personCategory, "CHILD")
  assert.equal(roster[0].personType, "CREW")
  assert.equal(roster[0].airlinePersonalId, "a1")
  assert.equal(roster[0].seat, "12A")
})

test("правка воды не затирает CREW personType (у water-персоны нет ключа personType)", () => {
  let roster = upsertSavedPassenger([], {
    personId: "p1", fullName: "Crew One", personType: "CREW",
    airlinePersonalId: "a1", personCategory: "ADULT"
  })
  roster = patchSavedPersonIdentity(roster, {
    personId: "p1", fullName: "Crew One", phone: "111", seat: "2B", personCategory: "ADULT"
  })
  assert.equal(roster[0].personType, "CREW")
  assert.equal(roster[0].airlinePersonalId, "a1")
  assert.equal(roster[0].seat, "2B")
})

test("personId нет в ростере → добавляется новая запись", () => {
  const roster = patchSavedPersonIdentity([], {
    personId: "p9", fullName: "Fresh", personCategory: "CHILD"
  })
  assert.equal(roster.length, 1)
  assert.equal(roster[0].personId, "p9")
  assert.equal(roster[0].personCategory, "CHILD")
})

test("нет personId или пустое ФИО → ростер без изменений", () => {
  assert.deepEqual(
    patchSavedPersonIdentity([{ personId: "p1", fullName: "A" }], { fullName: "X" }),
    [{ personId: "p1", fullName: "A" }]
  )
  assert.deepEqual(
    patchSavedPersonIdentity([], { personId: "p1", fullName: "   " }),
    []
  )
})

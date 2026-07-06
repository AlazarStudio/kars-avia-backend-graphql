import test from "node:test"
import assert from "node:assert/strict"
import {
  normalizePersonCategory,
  normalizeSavedPerson,
  snapshotFromServicePerson,
  snapshotFromHotelPerson,
  snapshotFromDriverPerson,
  upsertSavedPassenger,
  updateSavedPersonInRoster
} from "../../services/passengerRequest/savedPassengers.js"

test("normalizePersonCategory: CHILD/INFANT сохраняются, остальное → ADULT", () => {
  assert.equal(normalizePersonCategory("CHILD"), "CHILD")
  assert.equal(normalizePersonCategory("INFANT"), "INFANT")
  assert.equal(normalizePersonCategory(undefined), "ADULT")
  assert.equal(normalizePersonCategory("ADULT"), "ADULT")
  assert.equal(normalizePersonCategory("junk"), "ADULT")
})

test("normalizeSavedPerson: переносит personCategory, дефолт ADULT", () => {
  assert.equal(
    normalizeSavedPerson({ fullName: "A B", personCategory: "CHILD" }).personCategory,
    "CHILD"
  )
  assert.equal(normalizeSavedPerson({ fullName: "A B" }).personCategory, "ADULT")
})

test("snapshotFrom*: переносят personCategory (дефолт ADULT)", () => {
  assert.equal(
    snapshotFromServicePerson({ fullName: "A", personCategory: "CHILD" }).personCategory,
    "CHILD"
  )
  assert.equal(
    snapshotFromHotelPerson({ fullName: "A", personCategory: "INFANT" }).personCategory,
    "INFANT"
  )
  assert.equal(
    snapshotFromDriverPerson({ fullName: "A", personCategory: "CHILD" }).personCategory,
    "CHILD"
  )
  assert.equal(snapshotFromServicePerson({ fullName: "A" }).personCategory, "ADULT")
})

test("upsertSavedPassenger: новая запись сохраняет категорию", () => {
  const roster = upsertSavedPassenger([], {
    personId: "p1",
    fullName: "Child One",
    personCategory: "CHILD"
  })
  assert.equal(roster.length, 1)
  assert.equal(roster[0].personCategory, "CHILD")
})

test("upsertSavedPassenger: повторное добавление с ADULT не затирает существующий CHILD", () => {
  const first = upsertSavedPassenger([], {
    personId: "p1",
    fullName: "Child One",
    personCategory: "CHILD"
  })
  const second = upsertSavedPassenger(first, {
    personId: "p1",
    fullName: "Child One",
    personCategory: "ADULT"
  })
  assert.equal(second.length, 1)
  assert.equal(second[0].personCategory, "CHILD")
})

test("updateSavedPersonInRoster: patch обновляет категорию", () => {
  const roster = upsertSavedPassenger([], {
    personId: "p1",
    fullName: "Person One",
    personCategory: "ADULT"
  })
  const updated = updateSavedPersonInRoster(roster, "p1", {
    fullName: "Person One",
    personCategory: "CHILD"
  })
  assert.equal(updated[0].personCategory, "CHILD")
})

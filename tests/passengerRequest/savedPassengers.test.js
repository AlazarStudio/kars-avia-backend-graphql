import test from "node:test"
import assert from "node:assert/strict"
import {
  rosterMatchKey,
  removeSavedPersonFromRoster,
  updateSavedPersonInRoster,
  upsertSavedPassenger
} from "../../services/passengerRequest/savedPassengers.js"

test("upsertSavedPassenger: adds new entry with personId", () => {
  const next = upsertSavedPassenger([], {
    fullName: "Ivanov Ivan",
    phone: null,
    seat: "12A"
  })

  assert.equal(next.length, 1)
  assert.equal(next[0].fullName, "Ivanov Ivan")
  assert.equal(next[0].seat, "12A")
  assert.equal(typeof next[0].personId, "string")
  assert.ok(next[0].personId.length > 10)
})

// Идентичность реестра — строго по personId (рефактор 40ecfb1). Матчинг по ФИО
// живёт только в импорте манифеста — mergeManifestPeopleIntoRoster, см. savedPeopleBulk.test.js.
test("upsertSavedPassenger: слияние по personId — обновляет поля, не плодит записи", () => {
  const first = upsertSavedPassenger([], {
    fullName: "Petrov Petr",
    seat: "1B",
    phone: null
  })
  const second = upsertSavedPassenger(first, {
    personId: first[0].personId,
    fullName: "Petrov Petr",
    seat: "1B",
    phone: "+7999"
  })

  assert.equal(second.length, 1)
  assert.equal(second[0].personId, first[0].personId)
  assert.equal(second[0].phone, "+7999")
})

test("upsertSavedPassenger: без personId одинаковое ФИО даёт вторую запись", () => {
  const first = upsertSavedPassenger([], {
    fullName: "  petrov   petr ",
    seat: "1B"
  })
  const second = upsertSavedPassenger(first, {
    fullName: "Petrov Petr",
    seat: "1B"
  })

  assert.equal(second.length, 2)
  assert.notEqual(second[0].personId, second[1].personId)
})

test("upsertSavedPassenger: разные personId — две записи независимо от места", () => {
  const first = upsertSavedPassenger([], {
    fullName: "Sidorov Sidor",
    seat: "2A"
  })
  const second = upsertSavedPassenger(first, {
    fullName: "Sidorov Sidor",
    seat: "2B"
  })

  assert.equal(second.length, 2)
  assert.notEqual(second[0].personId, second[1].personId)
})

test("rosterMatchKey: ключ = personId, без него — null", () => {
  assert.equal(rosterMatchKey({ personId: "p1", fullName: "A B" }), "p1")
  assert.equal(rosterMatchKey({ personId: "p1", fullName: "A B", seat: "3C" }), "p1")
  assert.equal(rosterMatchKey({ fullName: "A B", seat: "3C" }), null)
  assert.equal(rosterMatchKey(null), null)
})

test("updateSavedPersonInRoster: updates by personId", () => {
  const roster = upsertSavedPassenger([], {
    fullName: "Kozlov Kozma",
    phone: "111"
  })
  const personId = roster[0].personId

  const updated = updateSavedPersonInRoster(roster, personId, {
    fullName: "Kozlov Kozma",
    phone: "222",
    seat: "9F"
  })

  assert.equal(updated.length, 1)
  assert.equal(updated[0].phone, "222")
  assert.equal(updated[0].seat, "9F")
})

test("removeSavedPersonFromRoster: removes by personId", () => {
  const roster = upsertSavedPassenger([], { fullName: "One" })
  const personId = roster[0].personId

  const next = removeSavedPersonFromRoster(roster, personId)
  assert.equal(next.length, 0)
})

test("removeSavedPersonFromRoster: throws when not found", () => {
  assert.throws(
    () => removeSavedPersonFromRoster([], "missing-id"),
    /not found/i
  )
})

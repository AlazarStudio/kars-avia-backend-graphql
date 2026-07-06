import test from "node:test"
import assert from "node:assert/strict"
import { mergeManifestPeopleIntoRoster } from "../../services/passengerRequest/savedPassengers.js"

const person = (fullName, extra = {}) => ({ fullName, ...extra })

test("новые: добавляются с personId/addedAt/PASSENGER/категорией", () => {
  const { roster, addedCount, matchedCount } = mergeManifestPeopleIntoRoster([], [
    person("IVANOV IVAN", { seat: "1A", personCategory: "CHILD" })
  ])
  assert.equal(roster.length, 1)
  assert.equal(addedCount, 1)
  assert.equal(matchedCount, 0)
  assert.ok(roster[0].personId)
  assert.ok(roster[0].addedAt instanceof Date)
  assert.equal(roster[0].personType, "PASSENGER")
  assert.equal(roster[0].personCategory, "CHILD")
  assert.equal(roster[0].seat, "1A")
})

test("совпадение по ФИО (регистр/лишние пробелы) — скип, не дубль", () => {
  const existing = [{ personId: "p1", fullName: "Ivanov  Ivan", personCategory: "ADULT" }]
  const { roster, addedCount, matchedCount } = mergeManifestPeopleIntoRoster(existing, [
    person("IVANOV IVAN")
  ])
  assert.equal(roster.length, 1)
  assert.equal(addedCount, 0)
  assert.equal(matchedCount, 1)
  assert.equal(roster[0].personId, "p1")
})

test("дозаполнение: пустые seat/phone берутся из входа, заполненные не трогаются", () => {
  const existing = [
    { personId: "p1", fullName: "A A", seat: null, phone: "+7 900" },
  ]
  const { roster } = mergeManifestPeopleIntoRoster(existing, [
    person("A A", { seat: "5F", phone: "+7 111" })
  ])
  assert.equal(roster[0].seat, "5F")
  assert.equal(roster[0].phone, "+7 900")
})

test("категория: ADULT повышается до CHILD, обратного понижения нет", () => {
  const existing = [
    { personId: "p1", fullName: "Kid One", personCategory: "ADULT" },
    { personId: "p2", fullName: "Baby One", personCategory: "INFANT" },
  ]
  const { roster } = mergeManifestPeopleIntoRoster(existing, [
    person("KID ONE", { personCategory: "CHILD" }),
    person("BABY ONE", { personCategory: "ADULT" }),
  ])
  assert.equal(roster[0].personCategory, "CHILD")
  assert.equal(roster[1].personCategory, "INFANT")
})

test("близнецы в файле = две записи; повторный импорт идемпотентен", () => {
  const first = mergeManifestPeopleIntoRoster([], [
    person("PETRENKO TATIANA", { seat: "14E" }),
    person("PETRENKO TATIANA", { seat: "14F" }),
  ])
  assert.equal(first.roster.length, 2)
  assert.equal(first.addedCount, 2)

  const second = mergeManifestPeopleIntoRoster(first.roster, [
    person("PETRENKO TATIANA", { seat: "14E" }),
    person("PETRENKO TATIANA", { seat: "14F" }),
  ])
  assert.equal(second.roster.length, 2)
  assert.equal(second.addedCount, 0)
  assert.equal(second.matchedCount, 2)
})

test("пустой/пробельный fullName пропускается, не роняя импорт", () => {
  const { roster, addedCount } = mergeManifestPeopleIntoRoster([], [
    person("   "),
    person("REAL PERSON"),
  ])
  assert.equal(roster.length, 1)
  assert.equal(addedCount, 1)
})

test("не мутирует исходный ростер", () => {
  const existing = [{ personId: "p1", fullName: "A A", personCategory: "ADULT" }]
  const snapshot = JSON.stringify(existing)
  mergeManifestPeopleIntoRoster(existing, [person("A A", { personCategory: "CHILD" })])
  assert.equal(JSON.stringify(existing), snapshot)
})

import test from "node:test"
import assert from "node:assert/strict"
import {
  upsertGroup,
  removeGroup,
  stripPersonFromGroups
} from "../../services/passengerRequest/passengerGroups.js"

const roster = [{ personId: "p1" }, { personId: "p2" }, { personId: "p3" }]

test("upsertGroup создаёт группу с uuid и dedupe участников", () => {
  const next = upsertGroup(
    [],
    { memberPersonIds: ["p1", "p1", "p2"], kind: "FAMILY" },
    roster
  )
  assert.equal(next.length, 1)
  assert.ok(next[0].groupId)
  assert.deepEqual(next[0].memberPersonIds, ["p1", "p2"])
  assert.equal(next[0].kind, "FAMILY")
})

test("upsertGroup фильтрует personId вне ростера (мягко)", () => {
  const next = upsertGroup([], { memberPersonIds: ["p1", "ghost"] }, roster)
  assert.deepEqual(next[0].memberPersonIds, ["p1"])
})

test("upsertGroup по groupId обновляет группу атомарно", () => {
  const one = upsertGroup([], { memberPersonIds: ["p1"] }, roster)
  const id = one[0].groupId
  const next = upsertGroup(
    one,
    { groupId: id, label: "Ивановы", memberPersonIds: ["p1", "p2"] },
    roster
  )
  assert.equal(next.length, 1)
  assert.equal(next[0].label, "Ивановы")
  assert.deepEqual(next[0].memberPersonIds, ["p1", "p2"])
})

test("один человек — одна группа: добавление во вторую убирает из первой", () => {
  const a = upsertGroup([], { memberPersonIds: ["p1", "p2"] }, roster)
  const both = upsertGroup(a, { memberPersonIds: ["p2", "p3"] }, roster)
  assert.equal(both.length, 2)
  assert.deepEqual(both[0].memberPersonIds, ["p1"])
  assert.deepEqual(both[1].memberPersonIds, ["p2", "p3"])
})

test("группа, опустевшая после переноса участников, удаляется", () => {
  const a = upsertGroup([], { memberPersonIds: ["p1"] }, roster)
  const next = upsertGroup(a, { memberPersonIds: ["p1", "p2"] }, roster)
  assert.equal(next.length, 1)
  assert.deepEqual(next[0].memberPersonIds, ["p1", "p2"])
})

test("removeGroup удаляет по groupId", () => {
  const a = upsertGroup([], { memberPersonIds: ["p1"] }, roster)
  assert.equal(removeGroup(a, a[0].groupId).length, 0)
})

test("stripPersonFromGroups чистит участника; пустые группы удаляются, из 1 — остаются", () => {
  const g = upsertGroup(
    upsertGroup([], { memberPersonIds: ["p1", "p2"] }, roster),
    { memberPersonIds: ["p3"] },
    roster
  )
  const next = stripPersonFromGroups(g, "p3")
  assert.equal(next.length, 1)
  const next2 = stripPersonFromGroups(next, "p2")
  assert.equal(next2.length, 1)
  assert.deepEqual(next2[0].memberPersonIds, ["p1"])
})

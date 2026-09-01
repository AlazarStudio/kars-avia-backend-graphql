import test from "node:test"
import assert from "node:assert/strict"
import {
  mergeSavedPeopleInRequest,
  rebindPeopleList,
  rebindReportRows,
  remapGroupMemberIds
} from "../../services/passengerRequest/mergeSavedPeople.js"

test("rebindPeopleList переносит personId и схлопывает дубль в списке", () => {
  const drop = new Set(["b"])
  const next = rebindPeopleList(
    [
      { personId: "a", fullName: "A" },
      { personId: "b", fullName: "B" },
      { personId: "a", fullName: "A again" }
    ],
    drop,
    "a"
  )
  assert.deepEqual(
    next.map((p) => p.personId),
    ["a"]
  )
})

test("remapGroupMemberIds переносит id, дедупит состав и выкидывает пустые группы", () => {
  const drop = new Set(["b"])
  const next = remapGroupMemberIds(
    [
      { groupId: "g1", memberPersonIds: [null] },
      { groupId: "g2", memberPersonIds: ["a", "b"] }
    ],
    drop,
    "a"
  )
  assert.deepEqual(next, [{ groupId: "g2", memberPersonIds: ["a"] }])
})

test("rebindReportRows меняет personId только у сливаемых", () => {
  const drop = new Set(["b"])
  const next = rebindReportRows(
    [
      { personId: "a", fullName: "A" },
      { personId: "b", fullName: "B" }
    ],
    drop,
    "a"
  )
  assert.equal(next[0].personId, "a")
  assert.equal(next[1].personId, "a")
  assert.equal(next[1].fullName, "B")
})

test("mergeSavedPeopleInRequest: keep-wins, дозаполнение, ребинд услуг", () => {
  const merged = mergeSavedPeopleInRequest(
    {
      savedPassengers: [
        { personId: "keep", fullName: "Ivanov", personCategory: "ADULT" },
        {
          personId: "drop",
          fullName: "Ivanov",
          personCategory: "CHILD",
          phone: "+7",
          seat: "12A"
        }
      ],
      passengerGroups: [{ groupId: "g1", memberPersonIds: ["drop"] }],
      livingService: {
        hotels: [{ people: [{ personId: "drop", fullName: "Ivanov" }] }]
      },
      waterService: { people: [{ personId: "drop" }] }
    },
    "keep",
    ["drop"]
  )

  assert.equal(merged.data.savedPassengers.length, 1)
  assert.equal(merged.data.savedPassengers[0].phone, "+7")
  assert.equal(merged.data.savedPassengers[0].seat, "12A")
  assert.equal(merged.data.savedPassengers[0].personCategory, "CHILD")
  assert.deepEqual(merged.data.passengerGroups[0].memberPersonIds, ["keep"])
  assert.deepEqual(
    merged.data.livingService.hotels[0].people.map((p) => p.personId),
    ["keep"]
  )
  assert.deepEqual(
    merged.data.waterService.people.map((p) => p.personId),
    ["keep"]
  )
  assert.deepEqual(merged.unsubmitReports, [0])
})

test("mergeSavedPeopleInRequest: keep не найден — BAD_USER_INPUT", () => {
  assert.throws(
    () =>
      mergeSavedPeopleInRequest(
        { savedPassengers: [{ personId: "a", fullName: "A" }] },
        "missing",
        ["a"]
      ),
    (err) => err?.extensions?.code === "BAD_USER_INPUT"
  )
})

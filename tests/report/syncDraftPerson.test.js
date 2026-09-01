import test from "node:test"
import assert from "node:assert/strict"
import { applyPersonToRows } from "../../services/report/syncDraftPerson.js"

test("смена сотрудника обновляет ФИО и должность в строке черновика", () => {
  const { rows, changed } = applyPersonToRows(
    [
      {
        requestId: "req-1",
        personName: "Иванов",
        personPosition: "КВС",
        shareSegments: []
      },
      {
        requestId: "req-2",
        personName: "Петров",
        personPosition: "БП",
        shareSegments: []
      }
    ],
    "req-1",
    "Сидоров",
    "ВП"
  )

  assert.equal(changed, true)
  assert.equal(rows[0].personName, "Сидоров")
  assert.equal(rows[0].personPosition, "ВП")
  assert.equal(rows[1].personName, "Петров")
})

test("ФИО сожителя в shareSegments тоже обновляется", () => {
  const { rows, changed } = applyPersonToRows(
    [
      {
        requestId: "req-2",
        personName: "Петров",
        personPosition: "БП",
        shareSegments: [
          {
            start: "a",
            end: "b",
            alone: false,
            cohabitants: [{ requestId: "req-1", personName: "Иванов" }]
          }
        ]
      }
    ],
    "req-1",
    "Сидоров",
    "ВП"
  )

  assert.equal(changed, true)
  assert.equal(rows[0].cohabitants, undefined)
  assert.equal(rows[0].shareSegments[0].cohabitants[0].personName, "Сидоров")
})

test("без совпадений черновик не помечается изменённым", () => {
  const { changed } = applyPersonToRows(
    [{ requestId: "req-2", personName: "Петров", personPosition: "БП" }],
    "req-1",
    "Сидоров",
    "ВП"
  )
  assert.equal(changed, false)
})

import test from "node:test"
import assert from "node:assert/strict"
import { reportRowsEqual } from "../../services/passengerRequest/hotelReportRows.js"

const row = (over = {}) => ({
  fullName: "Иванов Иван",
  personId: "p1",
  roomNumber: "101",
  daysCount: 2,
  accommodationCost: 4500,
  ...over
})

test("одинаковые наборы строк равны", () => {
  assert.equal(reportRowsEqual([row()], [row()]), true)
})

test("пустой набор равен отсутствующему", () => {
  assert.equal(reportRowsEqual([], null), true)
  assert.equal(reportRowsEqual(undefined, []), true)
  assert.equal(reportRowsEqual(null, undefined), true)
})

test("изменённая сумма делает наборы разными", () => {
  assert.equal(reportRowsEqual([row()], [row({ accommodationCost: 4000 })]), false)
})

test("разное число строк — наборы разные", () => {
  assert.equal(reportRowsEqual([row()], [row(), row({ personId: "p2" })]), false)
})

test("непустой набор не равен пустому", () => {
  assert.equal(reportRowsEqual([row()], []), false)
})

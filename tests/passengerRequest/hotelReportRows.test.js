import test from "node:test"
import assert from "node:assert/strict"
import {
  reportRowDate,
  reportRowsEqual,
  maskReportRowPrices
} from "../../services/passengerRequest/hotelReportRows.js"

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

test("reportRowDate: пустое значение → null", () => {
  assert.equal(reportRowDate(null, "arrival"), null)
  assert.equal(reportRowDate(undefined, "arrival"), null)
  assert.equal(reportRowDate("", "arrival"), null)
})

test("reportRowDate: Date и ISO-строка сводятся к одной ISO", () => {
  const iso = "2026-08-04T14:00:00.000Z"
  assert.equal(reportRowDate(iso, "arrival"), iso)
  assert.equal(reportRowDate(new Date(iso), "arrival"), iso)
})

test("reportRowDate: мусор — BAD_USER_INPUT", () => {
  assert.throws(
    () => reportRowDate("не дата", "arrival"),
    (err) => err?.extensions?.code === "BAD_USER_INPUT"
  )
})

test("maskReportRowPrices обнуляет денежные поля и оставляет состав", () => {
  const [masked] = maskReportRowPrices([
    {
      fullName: "Иванов",
      roomNumber: "101",
      foodCost: 200,
      accommodationCost: 4500,
      tariffName: "стандарт",
      pricePerDay: 2250,
      lunchboxPrice: 50,
      accommodationDiscount: 10
    }
  ])
  assert.equal(masked.fullName, "Иванов")
  assert.equal(masked.roomNumber, "101")
  assert.equal(masked.foodCost, null)
  assert.equal(masked.accommodationCost, null)
  assert.equal(masked.tariffName, null)
  assert.equal(masked.pricePerDay, null)
  assert.equal(masked.lunchboxPrice, null)
  assert.equal(masked.accommodationDiscount, null)
})

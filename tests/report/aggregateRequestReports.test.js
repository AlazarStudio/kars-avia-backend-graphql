import test from "node:test"
import assert from "node:assert/strict"
import {
  aggregateRequestReports,
  buildAllocation
} from "../../services/report/reportUtils.js"
import { getDefaultPartialDayRules } from "../../services/report/partialDaySettings.js"

// Кейс «Березка» (RGK, 06.08.2026): в договоре Азимута пуста цена
// «Стандарт одноместный», питания у гостей не было — строки пропадали молча.
const RULES = getDefaultPartialDayRules()
// Без «Z», как в buildReportData (`new Date(filter.startDate)`): границы периода —
// местное время сервера, а даты заявок parseAsLocal читает как настенные.
const PERIOD_START = new Date("2026-08-01T00:10:00")
const PERIOD_END = new Date("2026-08-10T23:50:00")
const AIRPORT_ID = "rgk"

const CONTRACT = {
  contractType: "request",
  airports: [{ airportId: AIRPORT_ID }],
  prices: { priceStandardSingle: 0, priceTwoCategory: 3100 },
  mealPrice: { breakfast: 590, lunch: 590, dinner: 590 }
}

const makeRequest = ({ id, roomCategory, arrival, departure, dailyMeals = [] }) => ({
  id,
  arrival: new Date(arrival),
  departure: new Date(departure),
  roomCategory,
  person: { name: id, position: { name: "ВП" } },
  hotel: { name: "Березка" },
  hotelChess: [],
  mealPlan: { dailyMeals },
  airline: { prices: [CONTRACT] },
  _reportAirportId: AIRPORT_ID
})

const build = (requests) =>
  aggregateRequestReports(requests, "airline", PERIOD_START, PERIOD_END, RULES)

const SHORT_STAY = {
  arrival: "2026-08-06T10:30:00Z",
  departure: "2026-08-06T11:00:00Z"
}

test("сутки есть, цены нет, питания нет — строка остаётся с проживанием 0", () => {
  const rows = build([
    makeRequest({ id: "single", roomCategory: "standardSingle", ...SHORT_STAY })
  ])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].totalDays, 0.5)
  assert.equal(rows[0].pricePerDay, 0)
  assert.equal(rows[0].totalLivingCost, 0)
  assert.equal(rows[0].totalDebt, 0)
})

test("категория с ценой считается как раньше", () => {
  const [row] = build([
    makeRequest({ id: "double", roomCategory: "twoPlace", ...SHORT_STAY })
  ])
  assert.equal(row.pricePerDay, 3100)
  assert.equal(row.totalLivingCost, 1550)
})

test("нет суток и нет питания — заявка лишь задевает начало периода, строки нет", () => {
  const rows = build([
    makeRequest({
      id: "edge",
      roomCategory: "standardSingle",
      arrival: "2026-07-31T20:00:00Z",
      departure: "2026-08-01T00:30:00Z"
    })
  ])
  assert.deepEqual(rows, [])
})

test("цены нет, но есть питание — строка остаётся, как и раньше", () => {
  const [row] = build([
    makeRequest({
      id: "meals",
      roomCategory: "standardSingle",
      arrival: "2026-08-06T08:30:00Z",
      departure: "2026-08-06T12:00:00Z",
      dailyMeals: [
        { date: new Date("2026-08-06T00:00:00Z"), breakfast: 1, lunch: 1, dinner: 0 }
      ]
    })
  ])
  assert.equal(row.totalLivingCost, 0)
  assert.equal(row.totalMealCost, 1180)
})

test("buildAllocation пропускает строку без цены дальше с проживанием 0", () => {
  const rows = buildAllocation(
    build([
      makeRequest({ id: "single", roomCategory: "standardSingle", ...SHORT_STAY })
    ]),
    RULES
  )
  assert.equal(rows.length, 1)
  assert.equal(rows[0].totalLivingCost, 0)
})

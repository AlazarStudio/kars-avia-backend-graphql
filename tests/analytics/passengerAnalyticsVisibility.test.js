import test from "node:test"
import assert from "node:assert/strict"
import {
  aggregatePassengerRequest,
  visibleHotelReports
} from "../../services/analytics/passengerAnalyticsUtils.js"

// Заявка с двумя гостиницами: по первой отчёт отправлен, по второй — черновик.
function makeRequest() {
  return {
    id: "r1",
    requestNumber: "0001SVO0526f",
    flightNumber: "SU1177",
    status: "COMPLETED",
    livingService: {
      hotels: [
        { name: "Отправленный отель", people: [{ fullName: "Иванов" }] },
        { name: "Черновой отель", people: [{ fullName: "Петров" }] }
      ]
    },
    hotelReports: [
      {
        hotelIndex: 0,
        submittedAt: new Date("2026-07-01T10:00:00.000Z"),
        reportRows: [
          { fullName: "Иванов", accommodationCost: 3500, foodCost: 200, daysCount: 2 }
        ]
      },
      {
        hotelIndex: 1,
        submittedAt: null,
        reportRows: [
          { fullName: "Петров", accommodationCost: 1000, foodCost: 100, daysCount: 3 }
        ]
      }
    ]
  }
}

test("visibleHotelReports без флага отдаёт список как есть", () => {
  const reports = [{ submittedAt: null }, { submittedAt: new Date() }]
  assert.deepEqual(visibleHotelReports(reports, false), reports)
  assert.equal(visibleHotelReports(reports, false).length, 2)
})

test("visibleHotelReports с флагом оставляет только отправленные отчёты", () => {
  const submitted = { submittedAt: new Date("2026-07-01T10:00:00.000Z") }
  const reports = [{ submittedAt: null }, submitted, {}]
  assert.deepEqual(visibleHotelReports(reports, true), [submitted])
})

test("visibleHotelReports не падает на undefined", () => {
  assert.deepEqual(visibleHotelReports(undefined, true), [])
  assert.deepEqual(visibleHotelReports(null, false), [])
})

test("АК не видит суммы и ночи неотправленного отчёта", () => {
  const row = aggregatePassengerRequest(makeRequest(), { viewerIsAirline: true })
  assert.equal(row.living, 3500)
  assert.equal(row.meal, 200)
  assert.equal(row.roomNights, 2)

  const [sent, draft] = row.hotels
  assert.equal(sent.living, 3500)
  assert.equal(sent.meal, 200)
  assert.equal(sent.roomNights, 2)
  assert.equal(sent.reportSaved, true)

  assert.equal(draft.living, 0)
  assert.equal(draft.meal, 0)
  assert.equal(draft.roomNights, 0)
  assert.equal(draft.reportSaved, false)
})

test("диспетчер (без опций) видит суммы по обеим гостиницам", () => {
  const row = aggregatePassengerRequest(makeRequest())
  assert.equal(row.living, 4500)
  assert.equal(row.meal, 300)
  assert.equal(row.roomNights, 5)

  const [sent, draft] = row.hotels
  assert.equal(sent.living, 3500)
  assert.equal(sent.reportSaved, true)
  assert.equal(draft.living, 1000)
  assert.equal(draft.meal, 100)
  assert.equal(draft.roomNights, 3)
  assert.equal(draft.reportSaved, true)
})

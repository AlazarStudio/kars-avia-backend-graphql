import test from "node:test"
import assert from "node:assert/strict"
import {
  buildReportPresentation,
  formatReportCurrency,
  getReportColumns
} from "../../services/report/reportPresentation.js"
import { enrichRowsWithShareMetadata } from "../../services/report/reportShareMetadata.js"

test("formatReportCurrency uses ru-RU with 2 decimals", () => {
  assert.equal(formatReportCurrency(1234.5), "1 234,50")
})

test("airline columns include personPosition and hotelName", () => {
  const cols = getReportColumns({ type: "AIRLINE", includeMeal: true, includeLiving: true })
  const keys = cols.map((c) => c.key)
  assert.ok(keys.includes("personPosition"))
  assert.ok(keys.includes("hotelName"))
})

test("hotel columns exclude personPosition and hotelName", () => {
  const cols = getReportColumns({ type: "HOTEL", includeMeal: true, includeLiving: true })
  const keys = cols.map((c) => c.key)
  assert.ok(!keys.includes("personPosition"))
  assert.ok(!keys.includes("hotelName"))
})

test("buildReportPresentation formats breakfast as вкл", () => {
  const presentation = buildReportPresentation({
    type: "AIRLINE",
    rows: [
      {
        index: 1,
        arrival: "01.07.2026 10:00:00",
        departure: "02.07.2026 12:00:00",
        totalDays: 1,
        category: "Одноместный",
        personName: "Иванов",
        roomName: "101",
        shareNote: "жил один",
        personPosition: "КВС",
        breakfastIncludedInPrice: true,
        breakfastCount: 1,
        lunchCount: 1,
        dinnerCount: 1,
        totalMealCost: 500,
        totalLivingCost: 1000,
        totalDebt: 1500,
        hotelName: "Hotel"
      }
    ],
    companyData: {
      name: "SU",
      nameFull: "Аэрофлот",
      city: "Москва",
      contractName: "Договор 1"
    },
    createFilterInput: { meal: true, living: true }
  })

  const row = presentation.dataRows[0]
  const breakfastCell = row.cells.find((c) => c.key === "breakfastCount")
  assert.equal(breakfastCell.value, "вкл")
  assert.equal(presentation.header.title.includes("авиакомпании"), true)
  assert.equal(presentation.totalsRow.cells.find((c) => c.key === "personPosition").value, "ИТОГО:")
})

test("enrichRowsWithShareMetadata links cohabitants in same room", () => {
  const rows = enrichRowsWithShareMetadata([
    {
      requestId: "r1",
      personName: "Иванов",
      roomId: "room1",
      arrival: "01.07.2026 10:00:00",
      departure: "05.07.2026 12:00:00"
    },
    {
      requestId: "r2",
      personName: "Петров",
      roomId: "room1",
      arrival: "02.07.2026 14:00:00",
      departure: "04.07.2026 10:00:00"
    }
  ])

  assert.equal(rows.length, 2)
  assert.equal(rows[0].roomGroupId, "room1")
  assert.equal(rows[1].roomGroupId, "room1")
  assert.equal(rows[0].shareClusterId, rows[1].shareClusterId)
  assert.ok(rows[0].shareSegments.some((s) => !s.alone))
  assert.ok(rows[0].shareNote.includes("Петров"))
})

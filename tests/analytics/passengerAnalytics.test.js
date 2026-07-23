import test from "node:test"
import assert from "node:assert/strict"
import {
  aggregatePassengerRequest,
  buildPassengerAnalyticsTotals
} from "../../services/analytics/passengerAnalyticsUtils.js"

test("проживание/питание = сумма гостевых строк, ghost-строки исключены", () => {
  const req = {
    id: "r1",
    requestNumber: "0001SVO0526f",
    flightNumber: "SU1177",
    status: "COMPLETED",
    airline: { id: "a1", name: "Россия" },
    airport: { id: "p1", name: "Внуково", code: "VKO" },
    livingService: {
      hotels: [{ name: "Отель", people: [{ fullName: "Иванов" }, { fullName: "Петров" }] }]
    },
    hotelReports: [
      {
        reportRows: [
          { fullName: "", accommodationCost: 9999, foodCost: 9999 }, // ghost/тариф — игнор
          { fullName: "Иванов", accommodationCost: 3500, foodCost: 200 },
          { fullName: "Петров", accommodationCost: 3500, foodCost: 200 }
        ]
      }
    ]
  }
  const row = aggregatePassengerRequest(req)
  assert.equal(row.living, 7000)
  assert.equal(row.meal, 400)
  assert.equal(row.costMissing, false)
  assert.deepEqual(row.hotelNames, ["Отель"])
})

test("трансфер = сумма reportCost по всем трансфер-услугам", () => {
  const req = {
    id: "r2",
    flightNumber: "SU2",
    status: "COMPLETED",
    transferService: { drivers: [{ reportCost: 1000 }, { reportCost: 500 }] },
    departureTransferService: { drivers: [{ reportCost: 800 }] },
    baggageDeliveryService: { drivers: [{ reportCost: 200 }] },
    hotelReports: []
  }
  const row = aggregatePassengerRequest(req)
  assert.equal(row.transfer, 2500)
  assert.equal(row.total, 2500)
})

test("costMissing=true, если проживание запланировано, но отчёт не сохранён", () => {
  const req = {
    id: "r3",
    flightNumber: "SU3",
    status: "IN_PROGRESS",
    livingService: { hotels: [{ name: "Отель", people: [{ fullName: "Сидоров" }] }] },
    hotelReports: []
  }
  const row = aggregatePassengerRequest(req)
  assert.equal(row.costMissing, true)
  assert.equal(row.living, 0)
})

test("итоги: costMissing не входят в деньги, но считаются в missingCostCount", () => {
  const rows = [
    { costMissing: false, peopleCount: 2, living: 7000, meal: 400, transfer: 0, total: 7400 },
    { costMissing: true, peopleCount: 1, living: 0, meal: 0, transfer: 0, total: 0 }
  ]
  const t = buildPassengerAnalyticsTotals(rows)
  assert.equal(t.requestsCount, 2)
  assert.equal(t.peopleCount, 2)
  assert.equal(t.living, 7000)
  assert.equal(t.total, 7400)
  assert.equal(t.missingCostCount, 1)
})

test("группы: groupsCount = число групп, linkedPeopleCount = уникальные участники", () => {
  const req = {
    id: "r5",
    flightNumber: "SU5",
    status: "COMPLETED",
    passengerGroups: [
      { groupId: "g1", memberPersonIds: ["p1", "p2"] },
      { groupId: "g2", memberPersonIds: ["p3", "p4", "p5"] }
    ],
    hotelReports: []
  }
  const row = aggregatePassengerRequest(req)
  assert.equal(row.groupsCount, 2)
  assert.equal(row.linkedPeopleCount, 5)
})

test("нет групп → groupsCount=0, linkedPeopleCount=0", () => {
  const req = { id: "r6", flightNumber: "SU6", status: "COMPLETED", hotelReports: [] }
  const row = aggregatePassengerRequest(req)
  assert.equal(row.groupsCount, 0)
  assert.equal(row.linkedPeopleCount, 0)
})

test("итоги: linkedPeopleCount суммируется по ВСЕМ строкам, включая costMissing", () => {
  const rows = [
    { costMissing: false, peopleCount: 2, linkedPeopleCount: 2, living: 7000, meal: 400, transfer: 0, total: 7400 },
    { costMissing: true, peopleCount: 1, linkedPeopleCount: 3, living: 0, meal: 0, transfer: 0, total: 0 }
  ]
  const t = buildPassengerAnalyticsTotals(rows)
  assert.equal(t.linkedPeopleCount, 5)
})

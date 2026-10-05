import test from "node:test"
import assert from "node:assert/strict"
import {
  aggregatePassengerRequest,
  buildPassengerAnalyticsTotals,
  resolvePeriodBounds
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

test("период: date-only границы = московские сутки (+03:00)", () => {
  const { dateFrom, dateTo } = resolvePeriodBounds("2026-07-01", "2026-07-31")
  assert.equal(dateFrom.toISOString(), "2026-06-30T21:00:00.000Z")
  assert.equal(dateTo.toISOString(), "2026-07-31T20:59:59.999Z")
})

test("период: рейс 1-го числа (полночь МСК в UTC) попадает в границы", () => {
  const { dateFrom } = resolvePeriodBounds("2026-07-01", "2026-07-31")
  const flightDate = new Date("2026-06-30T21:00:00.000Z")
  assert.ok(flightDate >= dateFrom)
})

test("период: полный ISO проходит как есть", () => {
  const { dateFrom, dateTo } = resolvePeriodBounds(
    "2026-07-01T10:00:00.000Z",
    "2026-07-02T10:00:00.000Z"
  )
  assert.equal(dateFrom.toISOString(), "2026-07-01T10:00:00.000Z")
  assert.equal(dateTo.toISOString(), "2026-07-02T10:00:00.000Z")
})

test("период: мусор и перевёрнутые границы бросают ошибку", () => {
  assert.throws(() => resolvePeriodBounds("абв", "2026-07-31"), /Некорректный период/)
  assert.throws(() => resolvePeriodBounds("2026-08-01", "2026-07-01"), /не может быть позже/)
})

test("детализация: категории людей и экипаж", () => {
  const req = {
    id: "d1",
    status: "COMPLETED",
    livingService: {
      hotels: [
        { name: "Азия", people: [
          { fullName: "A", personCategory: "ADULT" },
          { fullName: "B", personCategory: "CHILD" },
          { fullName: "C", personCategory: "INFANT" },
          { fullName: "D", personCategory: null },
          { fullName: "E" }
        ] }
      ]
    },
    crewMembers: [{ fullName: "К1" }, { fullName: "К2" }],
    hotelReports: []
  }
  const row = aggregatePassengerRequest(req)
  assert.equal(row.adultsCount, 3)
  assert.equal(row.childrenCount, 1)
  assert.equal(row.infantsCount, 1)
  assert.equal(row.crewCount, 2)
})

test("детализация: ночи по гостевым строкам, ghost исключён; средняя цена за ночь", () => {
  const req = {
    id: "d2",
    status: "COMPLETED",
    hotelReports: [
      { hotelIndex: 0, reportRows: [
        { fullName: "A", accommodationCost: 4000, daysCount: 2 },
        { fullName: "B", accommodationCost: 3000, daysCount: 1.5 },
        { fullName: "", accommodationCost: 9999, daysCount: 99 }
      ] }
    ]
  }
  const row = aggregatePassengerRequest(req)
  assert.equal(row.roomNights, 3.5)
  assert.equal(row.avgPricePerNight, 2000)
})

test("детализация: ноль ночей → avgPricePerNight = 0", () => {
  const req = {
    id: "d3",
    status: "COMPLETED",
    hotelReports: [{ hotelIndex: 0, reportRows: [{ fullName: "A", accommodationCost: 5000 }] }]
  }
  const row = aggregatePassengerRequest(req)
  assert.equal(row.roomNights, 0)
  assert.equal(row.avgPricePerNight, 0)
})

test("детализация: split трансфера по сервисам, сумма равна transfer", () => {
  const req = {
    id: "d4",
    status: "COMPLETED",
    transferService: { drivers: [{ reportCost: 1000 }, { reportCost: 500 }] },
    departureTransferService: { drivers: [{ reportCost: 800 }] },
    baggageDeliveryService: { drivers: [{ reportCost: 200 }] },
    intercityTransferService: { drivers: [{ reportCost: 300 }] },
    hotelReports: []
  }
  const row = aggregatePassengerRequest(req)
  assert.equal(row.transferArrival, 1500)
  assert.equal(row.transferDeparture, 800)
  assert.equal(row.transferBaggage, 200)
  assert.equal(row.transferIntercity, 300)
  assert.equal(
    Math.round((row.transferArrival + row.transferDeparture + row.transferBaggage + row.transferIntercity) * 100) / 100,
    row.transfer
  )
})

test("детализация: счётчики питания — легаси-правило и ланчбоксы", () => {
  const req = {
    id: "d5",
    status: "COMPLETED",
    hotelReports: [
      { hotelIndex: 0, reportRows: [
        { fullName: "A", breakfast: 500, lunch: 300, lunchCount: 2, dinner: 0, breakfastLunchbox: true, lunchLunchbox: true },
        { fullName: "B", dinner: 400, dinnerCount: 0, dinnerLunchbox: true },
        { fullName: "", breakfast: 999, breakfastCount: 99 }
      ] }
    ]
  }
  const row = aggregatePassengerRequest(req)
  assert.equal(row.breakfastsCount, 1)
  assert.equal(row.lunchesCount, 2)
  assert.equal(row.dinnersCount, 0)
  assert.equal(row.lunchboxesCount, 3)
})

test("детализация: вода и раздача питания — план/факт", () => {
  const req = {
    id: "d6",
    status: "COMPLETED",
    waterService: { plan: { peopleCount: 10 }, people: [{ fullName: "A" }, { fullName: "B" }] },
    mealService: { plan: { peopleCount: 5 }, people: [{ fullName: "C" }] },
    hotelReports: []
  }
  const row = aggregatePassengerRequest(req)
  assert.equal(row.waterPlanned, 10)
  assert.equal(row.waterServed, 2)
  assert.equal(row.mealServicePlanned, 5)
  assert.equal(row.mealServiceServed, 1)
})

test("детализация: по-гостиничная разбивка, гостиница без отчёта", () => {
  const req = {
    id: "d7",
    status: "COMPLETED",
    livingService: {
      hotels: [
        { name: "Азия", people: [{ fullName: "A" }, { fullName: "B" }] },
        { name: "Престиж", people: [{ fullName: "C" }] }
      ]
    },
    hotelReports: [
      { hotelIndex: 0, reportRows: [
        { fullName: "A", accommodationCost: 3000, foodCost: 400, daysCount: 2 },
        { fullName: "", accommodationCost: 999, daysCount: 9 }
      ] }
    ]
  }
  const row = aggregatePassengerRequest(req)
  assert.deepEqual(row.hotels, [
    { hotelName: "Азия", peopleCount: 2, roomNights: 2, living: 3000, meal: 400, reportSaved: true },
    { hotelName: "Престиж", peopleCount: 1, roomNights: 0, living: 0, meal: 0, reportSaved: false }
  ])
})

test("детализация: легаси-заявка без сервисов → нули, hotels пуст", () => {
  const req = { id: "d8", status: "COMPLETED", hotelReports: [] }
  const row = aggregatePassengerRequest(req)
  assert.equal(row.adultsCount, 0)
  assert.equal(row.crewCount, 0)
  assert.equal(row.roomNights, 0)
  assert.equal(row.transferArrival, 0)
  assert.equal(row.breakfastsCount, 0)
  assert.equal(row.waterPlanned, 0)
  assert.deepEqual(row.hotels, [])
})

test("вода и питание: сумма поставки по правилу книги, входит в total", () => {
  const req = {
    id: "w1",
    status: "IN_PROGRESS",
    hotelReports: [],
    transferService: { drivers: [{ reportCost: 1000 }] },
    waterService: { plan: { enabled: true }, quantity: 94, unitPrice: 60, deliveryCost: 800, people: [] },
    mealService: { plan: { enabled: true }, quantity: 10, unitPrice: 350.5, deliveryCost: null, people: [] }
  }
  const row = aggregatePassengerRequest(req)
  assert.equal(row.waterMeal, 6440 + 3505)
  assert.equal(row.total, 1000 + 6440 + 3505)
})

test("вода и питание: выключенная услуга и факт без цены и доставки не считаются", () => {
  const req = {
    id: "w2",
    status: "IN_PROGRESS",
    hotelReports: [],
    waterService: { plan: { enabled: false }, quantity: 94, unitPrice: 60, deliveryCost: 800 },
    mealService: { plan: { enabled: true }, quantity: 10, unitPrice: null, deliveryCost: null }
  }
  assert.equal(aggregatePassengerRequest(req).waterMeal, 0)
})

test("вода и питание: только доставка — сумма = доставка; статус услуги не важен", () => {
  const req = {
    id: "w3",
    status: "IN_PROGRESS",
    hotelReports: [],
    waterService: { plan: { enabled: true }, status: "CANCELLED", quantity: null, unitPrice: null, deliveryCost: 800 }
  }
  assert.equal(aggregatePassengerRequest(req).waterMeal, 800)
})

test("вода и питание: зрителю-авиакомпании поставка не отдаётся и в total не входит", () => {
  const req = {
    id: "w4",
    status: "IN_PROGRESS",
    hotelReports: [],
    transferService: { drivers: [{ reportCost: 1000 }] },
    waterService: { plan: { enabled: true }, quantity: 94, unitPrice: 60, deliveryCost: 800 }
  }
  const row = aggregatePassengerRequest(req, { viewerIsAirline: true })
  assert.equal(row.waterMeal, 0)
  assert.equal(row.total, 1000)
})

test("отменённая заявка: деньги строки и гостиниц обнулены, люди и сутки остаются", () => {
  const req = {
    id: "c1",
    status: "CANCELLED",
    livingService: {
      hotels: [
        { name: "Азия", people: [{ fullName: "A" }, { fullName: "B" }] },
        { name: "Престиж", people: [{ fullName: "C" }] }
      ]
    },
    hotelReports: [
      { hotelIndex: 0, reportRows: [{ fullName: "A", accommodationCost: 3000, foodCost: 400, daysCount: 2 }] }
    ],
    transferService: { drivers: [{ reportCost: 1000 }] },
    baggageDeliveryService: { drivers: [{ reportCost: 200 }] },
    waterService: { plan: { enabled: true }, quantity: 94, unitPrice: 60, deliveryCost: 800 }
  }
  const row = aggregatePassengerRequest(req)
  for (const key of [
    "living", "meal", "transfer", "waterMeal", "total", "avgPricePerNight",
    "transferArrival", "transferDeparture", "transferBaggage", "transferIntercity"
  ]) {
    assert.equal(row[key], 0, key)
  }
  assert.deepEqual(row.hotels.map((h) => [h.living, h.meal]), [[0, 0], [0, 0]])
  assert.equal(row.peopleCount, 3)
  assert.equal(row.roomNights, 2)
  assert.equal(row.status, "CANCELLED")
})

test("отменённая заявка без отчёта гостиницы — не «нет отчёта»", () => {
  const req = {
    id: "c2",
    status: "CANCELLED",
    livingService: { hotels: [{ name: "Отель", people: [{ fullName: "Сидоров" }] }] },
    hotelReports: []
  }
  assert.equal(aggregatePassengerRequest(req).costMissing, false)
})

test("итоги (вариант C): трансфер и поставка заявки «нет отчёта» — в деньгах, её люди — нет", () => {
  const rows = [
    { status: "COMPLETED", costMissing: false, peopleCount: 2, adultsCount: 2, childrenCount: 1, infantsCount: 0, roomNights: 3.5, transferArrival: 1000, transferDeparture: 0, transferBaggage: 200, transferIntercity: 0, living: 7000, meal: 400, transfer: 1200, waterMeal: 0, total: 8600 },
    { status: "IN_PROGRESS", costMissing: true, peopleCount: 5, adultsCount: 5, childrenCount: 5, infantsCount: 5, roomNights: 0, transferArrival: 500, transferDeparture: 0, transferBaggage: 100, transferIntercity: 0, living: 0, meal: 0, transfer: 600, waterMeal: 6440, total: 7040 }
  ]
  const t = buildPassengerAnalyticsTotals(rows)
  assert.equal(t.peopleCount, 2)
  assert.equal(t.adultsCount, 2)
  assert.equal(t.childrenCount, 1)
  assert.equal(t.infantsCount, 0)
  assert.equal(t.roomNights, 3.5)
  assert.equal(t.transferArrival, 1500)
  assert.equal(t.transferBaggage, 300)
  assert.equal(t.transfer, 1800)
  assert.equal(t.waterMeal, 6440)
  assert.equal(t.total, 15640)
  assert.equal(t.missingCostCount, 1)
})

test("итоги: отменённые — только в requestsCount и cancelledCount", () => {
  const rows = [
    { status: "COMPLETED", costMissing: false, peopleCount: 2, adultsCount: 2, childrenCount: 0, infantsCount: 0, linkedPeopleCount: 2, roomNights: 2, living: 7000, meal: 400, transfer: 1000, waterMeal: 500, total: 8900 },
    { status: "CANCELLED", costMissing: false, peopleCount: 5, adultsCount: 5, childrenCount: 1, infantsCount: 1, linkedPeopleCount: 4, roomNights: 3, living: 999, meal: 99, transfer: 900, waterMeal: 999, total: 2997 },
    { status: "CANCELLED", costMissing: true, peopleCount: 1, adultsCount: 1, childrenCount: 0, infantsCount: 0, linkedPeopleCount: 0, roomNights: 0, living: 0, meal: 0, transfer: 500, waterMeal: 100, total: 600 }
  ]
  const t = buildPassengerAnalyticsTotals(rows)
  assert.equal(t.requestsCount, 3)
  assert.equal(t.cancelledCount, 2)
  assert.equal(t.peopleCount, 2)
  assert.equal(t.adultsCount, 2)
  assert.equal(t.childrenCount, 0)
  assert.equal(t.infantsCount, 0)
  assert.equal(t.linkedPeopleCount, 2)
  assert.equal(t.roomNights, 2)
  assert.equal(t.living, 7000)
  assert.equal(t.transfer, 1000)
  assert.equal(t.waterMeal, 500)
  assert.equal(t.total, 8900)
  assert.equal(t.missingCostCount, 0)
})

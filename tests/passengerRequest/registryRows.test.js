import test from "node:test"
import assert from "node:assert/strict"
import { buildRegistryRows, roundMoney } from "../../services/passengerRequest/registryRows.js"

// Границы июня 2026 по МСК (как resolvePeriodBounds для "2026-06-01".."2026-06-30").
const bounds = {
  dateFrom: new Date("2026-06-01T00:00:00.000+03:00"),
  dateTo: new Date("2026-06-30T23:59:59.999+03:00")
}

const trip = (overrides = {}) => ({
  id: "trip-1",
  fullName: "Водитель Один",
  deliveryCompletedAt: "2026-06-24T06:00:00.000Z",
  driverCost: 5300,
  distanceKm: 126,
  people: [
    { personId: "p1", fullName: "SIDOROVA/MARIA", baggageTags: ["FV902150"], addressTo: "г. Тестовск, ул. Ленина 1", reportCost: 8360 },
    { personId: "p2", fullName: "1PETROV/IVAN", baggageTags: ["902151", "902152"], addressTo: "г. Тестовск, ул. Мира 2", reportCost: 560 }
  ],
  ...overrides
})

const baggageRequest = (overrides = {}) => ({
  id: "req-1",
  requestNumber: "0010SVX0626f",
  flightNumber: "FV6601",
  flightDate: "2026-06-22T00:00:00.000Z",
  baggageDeliveryService: { plan: { enabled: true }, drivers: [trip()] },
  ...overrides
})

test("BAGGAGE: строка на каждого пассажира поездки с датой доставки в периоде", () => {
  const { rows, totals } = buildRegistryRows({ kind: "BAGGAGE", requests: [baggageRequest()], bounds })
  assert.equal(rows.length, 2)
  assert.deepEqual(
    rows.map((r) => [r.fullName, r.price, r.driverName, r.driverCost, r.distanceKm, r.tripId]),
    [
      ["1PETROV/IVAN", 560, "Водитель Один", 5300, 126, "trip-1"],
      ["SIDOROVA/MARIA", 8360, "Водитель Один", 5300, 126, "trip-1"]
    ],
    "внутри одной даты — по ФИО"
  )
  assert.equal(rows[0].requestId, "req-1")
  assert.equal(rows[0].flightNumber, "FV6601")
  assert.deepEqual(rows[0].baggageTags, ["902151", "902152"])
  assert.equal(rows[0].deliveredAt, "2026-06-24T06:00:00.000Z")
  assert.deepEqual(totals, { rowsCount: 2, airlineTotal: 8920, internalCost: 5300 })
})

test("BAGGAGE: стоимость водителю считается один раз на поездку", () => {
  const request = baggageRequest({
    baggageDeliveryService: {
      plan: { enabled: true },
      drivers: [trip(), trip({ id: "trip-2", driverCost: 1800, people: [{ fullName: "Пассажир Три", reportCost: 1500, baggageTags: [] }] })]
    }
  })
  const { totals } = buildRegistryRows({ kind: "BAGGAGE", requests: [request], bounds })
  assert.equal(totals.internalCost, 7100)
  assert.equal(totals.rowsCount, 3)
})

test("BAGGAGE: поездка без даты доставки и поездка вне периода не попадают", () => {
  const request = baggageRequest({
    baggageDeliveryService: {
      plan: { enabled: true },
      drivers: [
        trip({ id: "t-none", deliveryCompletedAt: null }),
        trip({ id: "t-july", deliveryCompletedAt: "2026-07-01T05:00:00.000Z" }),
        trip({ id: "t-edge", deliveryCompletedAt: "2026-06-30T20:59:59.000Z" })
      ]
    }
  })
  const { rows } = buildRegistryRows({ kind: "BAGGAGE", requests: [request], bounds })
  assert.deepEqual([...new Set(rows.map((r) => r.tripId))], ["t-edge"], "23:59 МСК последнего дня попадает")
})

test("BAGGAGE: пассажир без цены попадает с price null и не ломает итог", () => {
  const request = baggageRequest({
    baggageDeliveryService: {
      plan: { enabled: true },
      drivers: [trip({ people: [{ fullName: "Без Цены", reportCost: null, baggageTags: [] }] })]
    }
  })
  const { rows, totals } = buildRegistryRows({ kind: "BAGGAGE", requests: [request], bounds })
  assert.equal(rows[0].price, null)
  assert.equal(totals.airlineTotal, 0)
})

test("BAGGAGE: поездка без пассажиров не даёт строк и не входит в стоимость водителю", () => {
  const request = baggageRequest({
    baggageDeliveryService: {
      plan: { enabled: true },
      drivers: [trip({ id: "t-empty", driverCost: 999, people: [] })]
    }
  })
  const { rows, totals } = buildRegistryRows({ kind: "BAGGAGE", requests: [request], bounds })
  assert.equal(rows.length, 0)
  assert.equal(totals.internalCost, 0)
})

test("BAGGAGE: tripId без driver.id — из requestId и индекса", () => {
  const request = baggageRequest({
    baggageDeliveryService: { plan: { enabled: true }, drivers: [trip({ id: undefined })] }
  })
  const { rows } = buildRegistryRows({ kind: "BAGGAGE", requests: [request], bounds })
  assert.equal(rows[0].tripId, "req-1:0")
})

const cateringRequest = (overrides = {}) => ({
  id: "req-2",
  requestNumber: "0326PKV0826f",
  flightNumber: "A4-7036",
  flightDate: "2026-06-28T00:00:00.000Z",
  waterService: {
    plan: { enabled: true, peopleCount: 100 },
    supplier: "Моя столовая",
    suppliedAt: "2026-06-28T16:54:00.000Z",
    quantity: 100,
    unitPrice: 60,
    deliveryCost: 800,
    supplierCost: 5000
  },
  mealService: {
    plan: { enabled: true, peopleCount: 99 },
    supplier: "Вкусно и точка",
    suppliedAt: "2026-06-28T18:44:00.000Z",
    quantity: 99,
    unitPrice: 380,
    deliveryCost: 800,
    supplierCost: 30000
  },
  ...overrides
})

test("CATERING: строка воды и строка питания одного рейса, суммы посчитаны", () => {
  const { rows, totals } = buildRegistryRows({ kind: "CATERING", requests: [cateringRequest()], bounds })
  assert.equal(rows.length, 2)
  assert.deepEqual(
    rows.map((r) => [r.serviceKind, r.quantity, r.unitPrice, r.amount, r.deliveryCost, r.total, r.supplier, r.supplierCost]),
    [
      ["WATER", 100, 60, 6000, 800, 6800, "Моя столовая", 5000],
      ["MEAL", 99, 380, 37620, 800, 38420, "Вкусно и точка", 30000]
    ]
  )
  assert.equal(rows[0].flightNumber, "A4-7036")
  assert.deepEqual(totals, { rowsCount: 2, airlineTotal: 45220, internalCost: 35000 })
})

test("CATERING: услуга без suppliedAt, выключенная и вне периода не попадают", () => {
  const request = cateringRequest({
    waterService: { plan: { enabled: true }, suppliedAt: null, quantity: 10, unitPrice: 1 },
    mealService: { plan: { enabled: false }, suppliedAt: "2026-06-10T10:00:00.000Z", quantity: 5, unitPrice: 1 }
  })
  const late = cateringRequest({
    id: "req-3",
    waterService: { plan: { enabled: true }, suppliedAt: "2026-07-01T00:00:00.000Z", quantity: 1, unitPrice: 1 },
    mealService: { plan: { enabled: false } }
  })
  const { rows } = buildRegistryRows({ kind: "CATERING", requests: [request, late], bounds })
  assert.equal(rows.length, 0)
})

test("CATERING: пустые цены дают нули, не NaN", () => {
  const request = cateringRequest({
    mealService: { plan: { enabled: false } },
    waterService: { plan: { enabled: true }, suppliedAt: "2026-06-10T10:00:00.000Z", quantity: null, unitPrice: null, deliveryCost: null }
  })
  const { rows, totals } = buildRegistryRows({ kind: "CATERING", requests: [request], bounds })
  assert.equal(rows[0].amount, 0)
  assert.equal(rows[0].total, 0)
  assert.equal(totals.airlineTotal, 0)
  assert.equal(totals.internalCost, 0)
})

test("сортировка по дате факта", () => {
  const a = cateringRequest({ id: "a", mealService: { plan: { enabled: false } }, waterService: { plan: { enabled: true }, suppliedAt: "2026-06-20T10:00:00.000Z", quantity: 1, unitPrice: 1 } })
  const b = cateringRequest({ id: "b", mealService: { plan: { enabled: false } }, waterService: { plan: { enabled: true }, suppliedAt: "2026-06-05T10:00:00.000Z", quantity: 1, unitPrice: 1 } })
  const { rows } = buildRegistryRows({ kind: "CATERING", requests: [a, b], bounds })
  assert.deepEqual(rows.map((r) => r.requestId), ["b", "a"])
})

test("неизвестный вид реестра — ошибка", () => {
  assert.throws(() => buildRegistryRows({ kind: "HOTEL", requests: [], bounds }), /kind/)
})

test("roundMoney", () => {
  assert.equal(roundMoney(0.1 + 0.2), 0.3)
  assert.equal(roundMoney(null), 0)
})

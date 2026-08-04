// Таблица услуг ФАП — единственный список семи встроенных сервисов заявки.
// Тесты стерегут ровно то, из-за чего список и сведён в одно место: потерянную
// или задвоенную услугу, ошибку в признаке водительской услуги и подсчёт факта
// не по тому полю.

import test from "node:test"
import assert from "node:assert/strict"
import {
  PASSENGER_SERVICE_FIELDS,
  PASSENGER_SERVICE_TABLE,
  findPassengerService
} from "../../services/passengerRequest/serviceTable.js"
import { makeRequest } from "./fixtures/passengerRequest.js"

const DRIVER_SERVICES = [
  "TRANSFER",
  "DEPARTURE_TRANSFER",
  "INTERCITY_TRANSFER",
  "BAGGAGE_DELIVERY"
]

test("в таблице ровно семь услуг, имена и поля не повторяются", () => {
  assert.equal(PASSENGER_SERVICE_TABLE.length, 7)

  const services = PASSENGER_SERVICE_TABLE.map((entry) => entry.service)
  const fields = PASSENGER_SERVICE_TABLE.map((entry) => entry.field)
  assert.equal(new Set(services).size, 7)
  assert.equal(new Set(fields).size, 7)

  // Набор ключей-исключений обязан совпадать с таблицей: разъехавшись, он
  // пропустит сервисный объект в документ как есть.
  assert.deepEqual([...PASSENGER_SERVICE_FIELDS].sort(), [...fields].sort())

  for (const entry of PASSENGER_SERVICE_TABLE) {
    assert.equal(findPassengerService(entry.service), entry, entry.service)
  }
  assert.equal(findPassengerService("UNKNOWN_SERVICE"), null)
})

test("hasDrivers стоит ровно у четырёх водительских услуг", () => {
  const withDrivers = PASSENGER_SERVICE_TABLE.filter((entry) => entry.hasDrivers)
  assert.deepEqual(
    withDrivers.map((entry) => entry.service),
    DRIVER_SERVICES
  )

  const withoutDrivers = PASSENGER_SERVICE_TABLE.filter(
    (entry) => !entry.hasDrivers
  )
  assert.deepEqual(
    withoutDrivers.map((entry) => entry.service),
    ["WATER", "MEAL", "LIVING"]
  )
})

test("factCount каждой услуги считает свой источник факта", () => {
  // Трансфер набит нарочно: у первой поездки факт даёт поимённый список, у
  // второй — введённое «перевезено N». Итог 2 + 3, а не длина списков.
  const request = makeRequest({
    transferService: {
      plan: { enabled: true, peopleCount: 4 },
      status: "NEW",
      times: {},
      drivers: [
        { fullName: "Водитель 1", people: [{ personId: "p1" }, { personId: "p2" }] },
        { fullName: "Водитель 2", people: [], transportedCount: 3 }
      ]
    }
  })

  const expected = {
    // вода: один получатель в списке
    waterService: 1,
    // питание: список пуст
    mealService: 0,
    // проживание: сумма людей по двум гостиницам (1 + 0)
    livingService: 1,
    transferService: 5,
    departureTransferService: 0,
    intercityTransferService: 0,
    baggageDeliveryService: 0
  }

  for (const entry of PASSENGER_SERVICE_TABLE) {
    assert.equal(
      entry.factCount(request[entry.field]),
      expected[entry.field],
      entry.field
    )
    // Услуги в документе может не быть вовсе — счётчик обязан пережить это.
    assert.equal(entry.factCount(undefined), 0, `${entry.field}: услуги нет`)
  }
})

test("statusExtra есть только у проживания и чинит легаси-выселения", () => {
  const withExtra = PASSENGER_SERVICE_TABLE.filter((entry) => entry.statusExtra)
  assert.deepEqual(
    withExtra.map((entry) => entry.service),
    ["LIVING"]
  )

  const living = findPassengerService("LIVING")
  assert.deepEqual(living.statusExtra({ evictions: null }), { evictions: [] })
  const kept = [{ hotelIndex: 0 }]
  assert.deepEqual(living.statusExtra({ evictions: kept }), { evictions: kept })
})

test("empty() и statusFallback() — разные дефолты и совпадать не должны", () => {
  // empty() рождает услугу целиком (создание заявки), statusFallback() отдаёт
  // только пустую коллекцию (смена статуса услуги).
  const water = findPassengerService("WATER")
  assert.deepEqual(water.empty(), {
    plan: null,
    status: "NEW",
    times: null,
    earlyCompletionReason: null,
    earlyCompletedAt: null,
    people: []
  })
  assert.deepEqual(water.statusFallback(), { people: [] })

  assert.deepEqual(findPassengerService("LIVING").statusFallback(), {
    hotels: [],
    evictions: []
  })
  for (const service of DRIVER_SERVICES) {
    assert.deepEqual(
      findPassengerService(service).statusFallback(),
      { drivers: [] },
      service
    )
  }
})

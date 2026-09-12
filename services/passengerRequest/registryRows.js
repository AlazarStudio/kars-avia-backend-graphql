// Сборка строк реестра услуг ФАП за период — чистые функции, без базы.
//
// Ключи строк — единый источник для снимка rows в PassengerServiceRegistry:
// книгу XLSX и просмотр на фронте читают по этим же именам. Внутренние ключи
// (INTERNAL_ROW_KEYS в registryAccess.js) авиакомпании маскируются.
//
// BAGGAGE: строка = пассажир поездки, у которой deliveryCompletedAt в периоде
//   (одна дата на всех пассажиров машины). Поездка без даты — не доставлено, не
//   попадает. Пассажир без цены попадает с price null: реестр покажет
//   предупреждение, а не потеряет строку.
// CATERING: строка = услуга воды или питания с suppliedAt в периоде.

import { toMoney } from "./coerce.js"

export const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100

const toTime = (value) => {
  if (value == null || value === "") return null
  const t = new Date(value).getTime()
  return Number.isNaN(t) ? null : t
}

const toIso = (value) => {
  const t = toTime(value)
  return t == null ? null : new Date(t).toISOString()
}

const inBounds = (value, bounds) => {
  const t = toTime(value)
  return t != null && t >= bounds.dateFrom.getTime() && t <= bounds.dateTo.getTime()
}

const byDateThenName = (dateKey, nameKey) => (a, b) => {
  const da = toTime(a[dateKey]) ?? 0
  const db = toTime(b[dateKey]) ?? 0
  if (da !== db) return da - db
  return String(a[nameKey] ?? "").localeCompare(String(b[nameKey] ?? ""), "ru")
}

const requestFields = (request) => ({
  requestId: request.id,
  requestNumber: request.requestNumber ?? null,
  flightNumber: request.flightNumber ?? null,
  flightDate: toIso(request.flightDate)
})

function buildBaggageRows(requests, bounds) {
  const rows = []
  const tripCosts = new Map() // tripId → driverCost, чтобы считать один раз на поездку
  for (const request of requests) {
    const drivers = request?.baggageDeliveryService?.drivers ?? []
    drivers.forEach((driver, index) => {
      if (!inBounds(driver?.deliveryCompletedAt, bounds)) return
      const tripId = driver?.id || `${request.id}:${index}`
      const driverCost = toMoney(driver?.driverCost)
      const people = driver?.people ?? []
      for (const person of people) {
        rows.push({
          ...requestFields(request),
          fullName: person?.fullName ?? "",
          baggageTags: Array.isArray(person?.baggageTags) ? person.baggageTags : [],
          addressTo: person?.addressTo ?? null,
          deliveredAt: toIso(driver.deliveryCompletedAt),
          price: toMoney(person?.reportCost),
          tripId,
          driverName: driver?.fullName ?? null,
          driverCost,
          distanceKm: driver?.distanceKm ?? null
        })
      }
      // поездка без пассажиров строк не даёт — и в итог не входит: Σ внутреннего
      // согласуется с Σ строк
      if (people.length) tripCosts.set(tripId, driverCost)
    })
  }
  rows.sort(byDateThenName("deliveredAt", "fullName"))
  const airlineTotal = roundMoney(rows.reduce((acc, r) => acc + (r.price ?? 0), 0))
  const internalCost = roundMoney([...tripCosts.values()].reduce((acc, c) => acc + (c ?? 0), 0))
  return { rows, totals: { rowsCount: rows.length, airlineTotal, internalCost } }
}

const CATERING_SERVICES = [
  ["WATER", "waterService"],
  ["MEAL", "mealService"]
]

function buildCateringRows(requests, bounds) {
  const rows = []
  for (const request of requests) {
    for (const [serviceKind, field] of CATERING_SERVICES) {
      const service = request?.[field]
      if (!service?.plan?.enabled) continue
      if (!inBounds(service.suppliedAt, bounds)) continue
      const quantity = Number(service.quantity) || 0
      const unitPrice = toMoney(service.unitPrice) ?? 0
      const deliveryCost = toMoney(service.deliveryCost) ?? 0
      const amount = roundMoney(quantity * unitPrice)
      rows.push({
        ...requestFields(request),
        serviceKind,
        suppliedAt: toIso(service.suppliedAt),
        quantity: service.quantity ?? null,
        unitPrice: toMoney(service.unitPrice),
        amount,
        deliveryCost: toMoney(service.deliveryCost),
        total: roundMoney(amount + deliveryCost),
        supplier: service.supplier ?? null,
        supplierCost: toMoney(service.supplierCost)
      })
    }
  }
  rows.sort(byDateThenName("suppliedAt", "flightNumber"))
  const airlineTotal = roundMoney(rows.reduce((acc, r) => acc + (r.total ?? 0), 0))
  const internalCost = roundMoney(rows.reduce((acc, r) => acc + (r.supplierCost ?? 0), 0))
  return { rows, totals: { rowsCount: rows.length, airlineTotal, internalCost } }
}

// bounds — { dateFrom: Date, dateTo: Date } из resolvePeriodBounds (МСК-сутки).
export function buildRegistryRows({ kind, requests, bounds }) {
  if (kind === "BAGGAGE") return buildBaggageRows(requests ?? [], bounds)
  if (kind === "CATERING") return buildCateringRows(requests ?? [], bounds)
  throw new Error(`registryRows: неизвестный kind «${kind}»`)
}

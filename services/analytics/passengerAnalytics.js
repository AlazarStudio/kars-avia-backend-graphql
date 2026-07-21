import { prisma } from "../../prisma.js"
import {
  aggregatePassengerRequest,
  buildPassengerAnalyticsTotals
} from "./passengerAnalyticsUtils.js"

// airline/airport/hotelReports — реляции, их надо include.
// livingService/transferService/... — встроенные composite-типы Mongo, возвращаются автоматически.
const PASSENGER_ANALYTICS_INCLUDE = {
  airline: { select: { id: true, name: true } },
  airport: { select: { id: true, name: true, code: true, city: true } },
  hotelReports: true
}

export async function computePassengerAnalytics(input, options = {}) {
  const { scopedAirlineId = null } = options
  const dateFrom = new Date(input.dateFrom)
  const dateTo = new Date(input.dateTo)
  if (Number.isNaN(dateFrom.getTime()) || Number.isNaN(dateTo.getTime())) {
    throw new Error("Некорректный период (dateFrom/dateTo)")
  }
  if (dateFrom > dateTo) {
    throw new Error("dateFrom не может быть позже dateTo")
  }

  const airlineId = scopedAirlineId || input.airlineId || null

  const baseWhere = {}
  if (airlineId) baseWhere.airlineId = airlineId
  if (input.airportIds?.length) baseWhere.airportId = { in: input.airportIds }
  if (input.flightNumber) baseWhere.flightNumber = { contains: input.flightNumber }
  if (input.statuses?.length) baseWhere.status = { in: input.statuses }
  else baseWhere.status = { not: "CANCELLED" }

  // Период по дате рейса; если flightDate не заполнена — по дате создания (гибрид),
  // чтобы заявки без даты рейса не выпадали из аналитики.
  // ВАЖНО (Prisma+Mongo): flightDate может быть explicit null ИЛИ вовсе не задана (unset).
  // { flightDate: null } матчит только явный null и НЕ матчит unset-документы (старые заявки),
  // поэтому для «нет даты рейса» нужен и { flightDate: { isSet: false } }.
  const inPeriod = { gte: dateFrom, lte: dateTo }
  const flightDateMissing = {
    OR: [{ flightDate: null }, { flightDate: { isSet: false } }]
  }
  const where = {
    ...baseWhere,
    OR: [
      { flightDate: inPeriod },
      { AND: [flightDateMissing, { createdAt: inPeriod }] }
    ]
  }

  const requests = await prisma.passengerRequest.findMany({
    where,
    include: PASSENGER_ANALYTICS_INCLUDE,
    orderBy: { createdAt: "desc" }
  })

  const rows = requests.map(aggregatePassengerRequest)
  // Сколько показанных заявок попало по дате создания (без даты рейса) — информативно.
  const noFlightDateCount = rows.filter((r) => !r.flightDate).length
  const totals = { ...buildPassengerAnalyticsTotals(rows), noFlightDateCount }

  return {
    period: { dateFrom: dateFrom.toISOString(), dateTo: dateTo.toISOString() },
    totals,
    requests: rows
  }
}

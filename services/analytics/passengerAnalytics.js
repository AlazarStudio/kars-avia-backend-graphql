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

  // базовый where без периода (для отдельного count заявок без даты рейса)
  const baseWhere = {}
  if (airlineId) baseWhere.airlineId = airlineId
  if (input.airportIds?.length) baseWhere.airportId = { in: input.airportIds }
  if (input.flightNumber) baseWhere.flightNumber = { contains: input.flightNumber }
  if (input.statuses?.length) baseWhere.status = { in: input.statuses }
  else baseWhere.status = { not: "CANCELLED" }

  const where = { ...baseWhere, flightDate: { gte: dateFrom, lte: dateTo } }

  const [requests, noFlightDateCount] = await Promise.all([
    prisma.passengerRequest.findMany({
      where,
      include: PASSENGER_ANALYTICS_INCLUDE,
      orderBy: { flightDate: "asc" }
    }),
    prisma.passengerRequest.count({ where: { ...baseWhere, flightDate: null } })
  ])

  const rows = requests.map(aggregatePassengerRequest)
  const totals = { ...buildPassengerAnalyticsTotals(rows), noFlightDateCount }

  return {
    period: { dateFrom: dateFrom.toISOString(), dateTo: dateTo.toISOString() },
    totals,
    requests: rows
  }
}

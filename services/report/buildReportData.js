import { prisma } from "../../prisma.js"
import {
  applyCreateFilters,
  buildPositionWhere,
  aggregateRequestReports,
  buildAllocation
} from "./reportUtils.js"
import {
  buildPriceSearchLocation,
  resolvePriceByHotelLocation
} from "../airline/resolvePriceByHotelLocation.js"
import { resolvePartialDayRules } from "./partialDaySettings.js"

const REQUEST_STATUSES = [
  "done",
  "transferred",
  "extended",
  "archiving",
  "archived",
  "reduced"
]

const requestIncludeAirline = {
  person: { include: { position: true } },
  hotelChess: { include: { room: true } },
  hotel: true,
  airline: {
    include: {
      prices: { include: { airports: true, geography: true } }
    }
  },
  mealPlan: true,
  airport: true
}

const requestIncludeHotel = {
  person: { include: { position: true } },
  hotelChess: {
    include: {
      room: { include: { roomKind: { include: { seasons: true } } } }
    }
  },
  hotel: true,
  airline: {
    include: {
      prices: { include: { airports: true, geography: true } }
    }
  },
  mealPlan: true,
  airport: true
}

/**
 * Собирает строки отчёта (aggregate + allocation) с учётом настроек РЗПВ.
 * @returns {{ rows, companyData, filterStart, filterEnd, airlineId, hotelId, partialDayRules }}
 */
export const buildAirlineReportData = async (filter) => {
  if (filter?.passengersReport) {
    throw new Error("passenger report not implemented!")
  }
  if (!filter?.airlineId) {
    throw new Error("Airline ID is required for this report")
  }

  const filterStart = new Date(filter.startDate)
  const filterEnd = new Date(filter.endDate)

  const where = {
    AND: [
      { ...applyCreateFilters(filter) },
      { status: { in: REQUEST_STATUSES } },
      buildPositionWhere(filter?.position)
    ]
  }

  const requests = await prisma.request.findMany({
    where,
    include: requestIncludeAirline,
    orderBy: { arrival: "asc" }
  })

  const company = await prisma.airline.findUnique({
    where: { id: filter.airlineId },
    include: { prices: { include: { airports: true, geography: true } } }
  })

  const firstRequestWithHotel = requests.find((r) => r.hotel)
  const reportHotel = firstRequestWithHotel?.hotel
  let reportAirport = firstRequestWithHotel?.airport || null
  if (filter.airportId) {
    reportAirport = await prisma.airport.findUnique({
      where: { id: filter.airportId }
    })
  }

  const hotelLocation = await buildPriceSearchLocation(
    reportHotel,
    reportAirport
  )

  for (const request of requests) {
    request._reportAirportId = filter.airportId || null
    request._skipCountryLevel = true
    request._priceAtDate = filter.startDate || null

    if (request.hotel || request.airport || reportAirport) {
      request._priceSearchLocation = await buildPriceSearchLocation(
        request.hotel,
        request.airport || reportAirport
      )
    }
  }

  const contract = resolvePriceByHotelLocation({
    airlinePrices: company?.prices,
    hotelLocation,
    airportId:
      filter.airportId ||
      firstRequestWithHotel?.airport?.id ||
      reportHotel?.airportId ||
      null,
    skipCountryLevel: true,
    contractTypes: ["request", "all"],
    atDate: filter.startDate || null
  })

  if (!contract) {
    throw new Error("Airline has no prices")
  }

  const companyData = {
    name: company.name,
    nameFull: company.nameFull,
    city: hotelLocation.city || reportAirport?.city || "",
    contractName: contract.name
  }

  const partialDayRules = await resolvePartialDayRules({
    reportType: "airline",
    airlineId: filter.airlineId
  })

  const reportData = aggregateRequestReports(
    requests,
    "airline",
    filterStart,
    filterEnd,
    partialDayRules
  )
  const rows = buildAllocation(reportData, partialDayRules)

  return {
    rows,
    companyData,
    filterStart,
    filterEnd,
    airlineId: filter.airlineId,
    hotelId: null,
    partialDayRules
  }
}

export const buildHotelReportData = async (filter) => {
  if (filter?.passengersReport) {
    throw new Error("passenger report not implemented!")
  }
  if (!filter?.hotelId) {
    throw new Error("Hotel ID is required for this report")
  }

  const filterStart = new Date(filter.startDate)
  const filterEnd = new Date(filter.endDate)

  const where = {
    AND: [
      { ...applyCreateFilters(filter) },
      { status: { in: REQUEST_STATUSES } },
      buildPositionWhere(filter?.position)
    ]
  }

  const requests = await prisma.request.findMany({
    where,
    include: requestIncludeHotel,
    orderBy: { arrival: "asc" }
  })

  const hotel = await prisma.hotel.findUnique({
    where: { id: filter.hotelId }
  })

  const companyData = {
    name: hotel?.name || "",
    nameFull: hotel?.nameFull || hotel?.name || "",
    city: hotel?.city || hotel?.location?.city || "",
    contractName: hotel?.contractName || ""
  }

  const partialDayRules = await resolvePartialDayRules({
    reportType: "hotel",
    hotelId: filter.hotelId
  })

  const reportData = aggregateRequestReports(
    requests,
    "hotel",
    filterStart,
    filterEnd,
    partialDayRules
  )
  const rows = buildAllocation(reportData, partialDayRules)

  return {
    rows,
    companyData,
    filterStart,
    filterEnd,
    airlineId: null,
    hotelId: filter.hotelId,
    partialDayRules
  }
}

import { recomputeReportDraftShareMetadata } from "./reportShareMetadata.js"

export const normalizeReportDraftRows = (rows) => {
  if (!Array.isArray(rows)) return []
  const normalized = rows.map((row, i) => ({
    index: row.index != null ? row.index : i + 1,
    requestId: row.requestId ?? null,
    arrival: row.arrival ?? "",
    departure: row.departure ?? "",
    totalDays: row.totalDays != null ? Number(row.totalDays) : 0,
    category: row.category ?? "",
    personName: row.personName ?? "",
    personPosition: row.personPosition ?? "",
    roomName: row.roomName ?? "",
    roomId: row.roomId ?? "",
    shareNote: row.shareNote ?? "",
    breakfastCount: row.breakfastCount != null ? Number(row.breakfastCount) : 0,
    lunchCount: row.lunchCount != null ? Number(row.lunchCount) : 0,
    dinnerCount: row.dinnerCount != null ? Number(row.dinnerCount) : 0,
    breakfastIncludedInPrice: Boolean(row.breakfastIncludedInPrice),
    totalMealCost: row.totalMealCost != null ? Number(row.totalMealCost) : 0,
    totalLivingCost:
      row.totalLivingCost != null ? Number(row.totalLivingCost) : 0,
    pricePerDay: row.pricePerDay != null ? Number(row.pricePerDay) : null,
    totalDebt: row.totalDebt != null ? Number(row.totalDebt) : 0,
    hotelName: row.hotelName ?? "",
    roomGroupId: row.roomGroupId ?? null,
    shareClusterId: row.shareClusterId ?? null,
    changedKeys: Array.isArray(row.changedKeys)
      ? row.changedKeys.filter((key) => typeof key === "string")
      : [],
    shareSegments: Array.isArray(row.shareSegments)
      ? row.shareSegments.map((seg) => ({
          start: seg.start ?? "",
          end: seg.end ?? "",
          alone: Boolean(seg.alone),
          cohabitants: Array.isArray(seg.cohabitants)
            ? seg.cohabitants.map((c) => ({
                requestId: c.requestId ?? null,
                personName: c.personName ?? ""
              }))
            : []
        }))
      : []
  }))
  return recomputeReportDraftShareMetadata(normalized)
}

import { prisma } from "../../prisma.js"
import {
  validateDateRange,
  buildRequestWhere,
  buildTransferWhere,
  REQUEST_INCLUDE,
  TRANSFER_INCLUDE,
  computeRequestCosts,
  computeTransferSpend,
  extractRoomIds,
  extractUniquePersonIds,
  buildPositionsBreakdown,
  filterTransfersByPositions,
  countTransferUniquePeople
} from "./airlineAnalyticsUtils.js"

const roundMoney = (v) => Math.round((Number(v) || 0) * 100) / 100

function normalizeServices(services) {
  if (!Array.isArray(services) || !services.length) {
    return ["LIVING", "MEAL", "TRANSFER"]
  }
  return [...new Set(services)]
}

async function fetchRequests(where) {
  return prisma.request.findMany({ where, include: REQUEST_INCLUDE })
}

async function fetchTransfers(where) {
  return prisma.transfer.findMany({ where, include: TRANSFER_INCLUDE })
}

async function computeMetricsForDataset({
  requests,
  transfers,
  airlineId,
  start,
  end,
  enabledServices
}) {
  let livingSpend = 0
  let mealSpend = 0
  let transferSpend = 0

  const wantLiving = enabledServices.includes("LIVING")
  const wantMeal = enabledServices.includes("MEAL")
  const wantTransfer = enabledServices.includes("TRANSFER")

  if (wantLiving || wantMeal) {
    for (const r of requests) {
      const costs = computeRequestCosts(r, start, end)
      if (wantLiving) livingSpend += costs.livingCost
      if (wantMeal) mealSpend += costs.mealCost
    }
  }

  if (wantTransfer && transfers.length) {
    transferSpend = await computeTransferSpend(transfers, airlineId)
  }

  livingSpend = roundMoney(livingSpend)
  mealSpend = roundMoney(mealSpend)
  transferSpend = roundMoney(transferSpend)

  const uniquePeopleFromRequests = extractUniquePersonIds(requests)
  const uniquePeopleFromTransfers = wantTransfer
    ? countTransferUniquePeople(transfers)
    : new Set()

  const allPeopleIds = new Set([
    ...uniquePeopleFromRequests,
    ...uniquePeopleFromTransfers
  ])

  const roomIds = extractRoomIds(requests)

  return {
    totalRequests: requests.length,
    uniquePeopleCount: allPeopleIds.size,
    usedRoomsCount: roomIds.size,
    totalSpend: roundMoney(livingSpend + mealSpend + transferSpend),
    livingSpend,
    mealSpend,
    transferSpend
  }
}

async function buildAirportsBreakdown({
  requests,
  airlineId,
  start,
  end,
  enabledServices,
  airportIds = null
}) {
  const byAirport = new Map()

  for (const r of requests) {
    const apId = r.airportId || "__none__"
    if (!byAirport.has(apId)) {
      byAirport.set(apId, {
        airportId: r.airportId,
        airportName: r.airport?.name || null,
        airportCode: r.airport?.code || null,
        requests: [],
        transfers: []
      })
    }
    byAirport.get(apId).requests.push(r)
  }

  const result = []
  for (const [, group] of byAirport) {
    if (!group.airportId) continue

    const metrics = await computeMetricsForDataset({
      requests: group.requests,
      transfers: group.transfers,
      airlineId,
      start,
      end,
      enabledServices
    })

    result.push({
      airportId: group.airportId,
      airportName: group.airportName,
      airportCode: group.airportCode,
      ...metrics
    })
  }

  if (Array.isArray(airportIds) && airportIds.length) {
    const present = new Set(result.map((r) => String(r.airportId)))
    const zeroMetrics = await computeMetricsForDataset({
      requests: [],
      transfers: [],
      airlineId,
      start,
      end,
      enabledServices
    })
    for (const apId of airportIds) {
      if (apId == null || apId === "") continue
      const idStr = String(apId)
      if (present.has(idStr)) continue
      const airport = await prisma.airport.findUnique({
        where: { id: apId },
        select: { name: true, code: true }
      })
      result.push({
        airportId: apId,
        airportName: airport?.name ?? null,
        airportCode: airport?.code ?? null,
        ...zeroMetrics
      })
      present.add(idStr)
    }
  }

  result.sort((a, b) => b.totalSpend - a.totalSpend)
  return result
}

async function buildAirlineAnalyticsPeriod({
  airlineId,
  periodInput,
  enabledServices,
  label
}) {
  const range = validateDateRange(periodInput.dateFrom, periodInput.dateTo, label)
  const airportIds = periodInput.airportIds?.length ? periodInput.airportIds : null
  const positionIds = periodInput.positionIds?.length
    ? periodInput.positionIds
    : null

  const reqWhere = buildRequestWhere({
    airlineId,
    start: range.start,
    end: range.end,
    airportIds,
    positionIds
  })

  const trWhere = buildTransferWhere({
    airlineId,
    start: range.start,
    end: range.end
  })

  const [requests, rawTransfers] = await Promise.all([
    fetchRequests(reqWhere),
    enabledServices.includes("TRANSFER")
      ? fetchTransfers(trWhere)
      : Promise.resolve([])
  ])

  const transfers = filterTransfersByPositions(rawTransfers, positionIds)

  const summary = await computeMetricsForDataset({
    requests,
    transfers,
    airlineId,
    start: range.start,
    end: range.end,
    enabledServices
  })

  const positionsBreakdown = buildPositionsBreakdown(requests)

  const airportsBreakdown = await buildAirportsBreakdown({
    requests,
    transfers,
    airlineId,
    start: range.start,
    end: range.end,
    enabledServices,
    airportIds
  })

  return {
    summary,
    positionsBreakdown,
    airportsBreakdown
  }
}

export async function computeAirlineAnalytics(input) {
  const { airlineId } = input
  if (!airlineId) throw new Error("airlineId обязателен")

  const enabledServices = normalizeServices(input.services)
  if (!input.period1) {
    throw new Error("period1 обязателен")
  }

  const period1 = await buildAirlineAnalyticsPeriod({
    airlineId,
    periodInput: input.period1,
    enabledServices,
    label: "period1"
  })

  const period2 = input.period2
    ? await buildAirlineAnalyticsPeriod({
        airlineId,
        periodInput: input.period2,
        enabledServices,
        label: "period2"
      })
    : null

  return {
    period1,
    period2
  }
}

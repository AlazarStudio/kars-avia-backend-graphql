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
  transfers,
  airlineId,
  start,
  end,
  enabledServices
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

  result.sort((a, b) => b.totalSpend - a.totalSpend)
  return result
}

async function buildSegmentsByAirport({
  requests,
  transfers,
  airlineId,
  start,
  end,
  enabledServices,
  airportIds
}) {
  const byAirport = new Map()

  for (const r of requests) {
    if (!r.airportId) continue
    if (!byAirport.has(r.airportId)) {
      byAirport.set(r.airportId, {
        airportId: r.airportId,
        label: r.airport?.name || r.airport?.code || r.airportId,
        requests: []
      })
    }
    byAirport.get(r.airportId).requests.push(r)
  }

  if (airportIds?.length) {
    for (const apId of airportIds) {
      if (!byAirport.has(apId)) {
        const airport = await prisma.airport.findUnique({
          where: { id: apId },
          select: { name: true, code: true }
        })
        byAirport.set(apId, {
          airportId: apId,
          label: airport?.name || airport?.code || apId,
          requests: []
        })
      }
    }
  }

  const segments = []
  for (const [, group] of byAirport) {
    const metrics = await computeMetricsForDataset({
      requests: group.requests,
      transfers: [],
      airlineId,
      start,
      end,
      enabledServices
    })

    const airportsBreakdownSeg = await buildAirportsBreakdown({
      requests: group.requests,
      transfers: [],
      airlineId,
      start,
      end,
      enabledServices
    })

    segments.push({
      label: group.label,
      segmentKey: group.airportId,
      segmentType: "airport",
      metrics,
      positionsBreakdown: buildPositionsBreakdown(group.requests),
      airportsBreakdown: airportsBreakdownSeg
    })
  }

  segments.sort((a, b) => b.metrics.totalSpend - a.metrics.totalSpend)
  return segments
}

async function buildSegmentsByPosition({
  requests,
  transfers,
  airlineId,
  start,
  end,
  enabledServices,
  positionIds
}) {
  const byPosition = new Map()

  for (const r of requests) {
    const posName = r.person?.position?.name || "Не указана"
    const posId = r.person?.positionId || "__none__"
    if (!byPosition.has(posId)) {
      byPosition.set(posId, {
        positionId: r.person?.positionId || null,
        label: posName,
        requests: []
      })
    }
    byPosition.get(posId).requests.push(r)
  }

  if (positionIds?.length) {
    for (const pId of positionIds) {
      if (!byPosition.has(pId)) {
        const pos = await prisma.position.findUnique({
          where: { id: pId },
          select: { name: true }
        })
        byPosition.set(pId, {
          positionId: pId,
          label: pos?.name || pId,
          requests: []
        })
      }
    }
  }

  const segments = []
  for (const [, group] of byPosition) {
    const metrics = await computeMetricsForDataset({
      requests: group.requests,
      transfers: [],
      airlineId,
      start,
      end,
      enabledServices
    })

    const airportsBreakdownSeg = await buildAirportsBreakdown({
      requests: group.requests,
      transfers: [],
      airlineId,
      start,
      end,
      enabledServices
    })

    segments.push({
      label: group.label,
      segmentKey: group.positionId || "__none__",
      segmentType: "position",
      metrics,
      positionsBreakdown: buildPositionsBreakdown(group.requests),
      airportsBreakdown: airportsBreakdownSeg
    })
  }

  segments.sort((a, b) => b.metrics.totalRequests - a.metrics.totalRequests)
  return segments
}

async function buildSegmentsByPeriod({
  airlineId,
  mainRange,
  comparePeriods,
  airportIds,
  positionIds,
  enabledServices
}) {
  const allRanges = [
    { label: formatRangeLabel(mainRange.start, mainRange.end), ...mainRange }
  ]

  if (Array.isArray(comparePeriods)) {
    for (let i = 0; i < comparePeriods.length; i++) {
      const cp = comparePeriods[i]
      const range = validateDateRange(
        cp.startDate,
        cp.endDate,
        `comparePeriods[${i}]`
      )
      allRanges.push({
        label: formatRangeLabel(range.start, range.end),
        ...range
      })
    }
  }

  const segments = []

  for (const range of allRanges) {
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

    const metrics = await computeMetricsForDataset({
      requests,
      transfers,
      airlineId,
      start: range.start,
      end: range.end,
      enabledServices
    })

    const airportsBreakdownSeg = await buildAirportsBreakdown({
      requests,
      transfers,
      airlineId,
      start: range.start,
      end: range.end,
      enabledServices
    })

    segments.push({
      label: range.label,
      segmentKey: `${range.start.toISOString()}_${range.end.toISOString()}`,
      segmentType: "period",
      metrics,
      positionsBreakdown: buildPositionsBreakdown(requests),
      airportsBreakdown: airportsBreakdownSeg
    })
  }

  return segments
}

function formatRangeLabel(start, end) {
  const fmt = (d) => {
    const dd = String(d.getDate()).padStart(2, "0")
    const mm = String(d.getMonth() + 1).padStart(2, "0")
    const yyyy = d.getFullYear()
    return `${dd}.${mm}.${yyyy}`
  }
  return `${fmt(start)} — ${fmt(end)}`
}

export async function computeAirlineAnalytics(input) {
  const { airlineId, dateFrom, dateTo } = input
  if (!airlineId) throw new Error("airlineId обязателен")

  const mainRange = validateDateRange(dateFrom, dateTo, "main")
  const enabledServices = normalizeServices(input.services)
  const airportIds = input.airportIds?.length ? input.airportIds : null
  const positionIds = input.positionIds?.length ? input.positionIds : null
  const groupBy = input.groupBy || "NONE"

  const reqWhere = buildRequestWhere({
    airlineId,
    start: mainRange.start,
    end: mainRange.end,
    airportIds,
    positionIds
  })

  const trWhere = buildTransferWhere({
    airlineId,
    start: mainRange.start,
    end: mainRange.end
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
    start: mainRange.start,
    end: mainRange.end,
    enabledServices
  })

  const positionsBreakdown = buildPositionsBreakdown(requests)

  const airportsBreakdown = await buildAirportsBreakdown({
    requests,
    transfers,
    airlineId,
    start: mainRange.start,
    end: mainRange.end,
    enabledServices
  })

  let segments = []

  if (groupBy === "AIRPORT") {
    segments = await buildSegmentsByAirport({
      requests,
      transfers,
      airlineId,
      start: mainRange.start,
      end: mainRange.end,
      enabledServices,
      airportIds
    })
  } else if (groupBy === "POSITION") {
    segments = await buildSegmentsByPosition({
      requests,
      transfers,
      airlineId,
      start: mainRange.start,
      end: mainRange.end,
      enabledServices,
      positionIds
    })
  } else if (groupBy === "PERIOD") {
    segments = await buildSegmentsByPeriod({
      airlineId,
      mainRange,
      comparePeriods: input.comparePeriods,
      airportIds,
      positionIds,
      enabledServices
    })
  }

  return {
    summary,
    positionsBreakdown,
    airportsBreakdown,
    segments
  }
}

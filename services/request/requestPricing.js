import { prisma } from "../../prisma.js"
import {
  buildAllocation,
  calculateEffectiveCostDaysWithPartial,
  calculateMealCostForReportDays,
  formatDateToISO,
  formatLocalDate,
  getAirlineMealPrice,
  getLivingPricePerDay
} from "../report/reportUtils.js"
import { logger } from "../infra/logger.js"
import {
  getRequestCheckInAt,
  getRequestCheckOutAt
} from "./requestStayDates.js"

const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100

const toStoredRequestPrice = (price) => {
  if (!price) return null
  const { breakfastIncluded: _ignored, ...stored } = price
  return stored
}

const createAllocationKey = (row) =>
  [
    row.arrival || "",
    row.departure || "",
    row.personName || "",
    row.personPosition || "",
    row.roomId || "",
    row.roomName || "",
    row.category || "",
    String(roundMoney(row.totalMealCost || 0))
  ].join("|")

const REQUEST_INCLUDE_FOR_PRICING = {
  hotelChess: {
    include: {
      room: {
        include: {
          roomKind: { include: { seasons: true } }
        }
      }
    }
  },
  hotel: {
    select: {
      id: true,
      name: true,
      external: true,
      mealPrice: true,
      mealPriceForAir: true,
      breakfastIncluded: true,
      location: true,
      information: true,
      airportId: true
    }
  },
  // prices подтягиваем отдельно batch-ом — иначе N раз грузим geography
  airline: { select: { id: true, name: true } },
  airport: { select: { id: true, city: true } },
  person: { include: { position: true } }
}

const AIRLINE_PRICES_INCLUDE = {
  prices: { include: { airports: true, geography: true } }
}

async function hydrateAirlinePrices(requests) {
  const airlineIds = [
    ...new Set(requests.map((row) => row.airlineId).filter(Boolean))
  ]
  if (!airlineIds.length) return requests

  const airlines = await prisma.airline.findMany({
    where: { id: { in: airlineIds } },
    include: AIRLINE_PRICES_INCLUDE
  })
  const byId = new Map(airlines.map((airline) => [airline.id, airline]))

  for (const request of requests) {
    const airline = byId.get(request.airlineId)
    if (!airline) continue
    request.airline = {
      ...(request.airline || {}),
      ...airline
    }
  }
  return requests
}

function staysOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && aEnd > bStart
}

function clusterForRequest(allLoaded, request, roomId) {
  const hc = request.hotelChess?.[0]
  if (!hc?.start || !hc?.end) return [request]
  const start = new Date(hc.start).getTime()
  const end = new Date(hc.end).getTime()

  return allLoaded.filter((row) => {
    const rowHc = row.hotelChess?.[0]
    if (!rowHc?.roomId || rowHc.roomId !== roomId) return false
    if (!rowHc.start || !rowHc.end) return false
    return staysOverlap(
      new Date(rowHc.start).getTime(),
      new Date(rowHc.end).getTime(),
      start,
      end
    )
  })
}

function computeRequestPricesFromCluster(request, clusterRequests) {
  const hotelCosts = buildLivingCostsByRequestId(clusterRequests, "hotel")
  const airlineCosts = buildLivingCostsByRequestId(clusterRequests, "airline")

  return {
    hotelPrice: buildPriceForRequest(
      request,
      "hotel",
      hotelCosts.livingCostByRequestId,
      hotelCosts.pricePerDayByRequestId
    ),
    airlinePrice: buildPriceForRequest(
      request,
      "airline",
      airlineCosts.livingCostByRequestId,
      airlineCosts.pricePerDayByRequestId
    )
  }
}

function getEffectiveStay(request) {
  const rawStart = getRequestCheckInAt(request)
  const rawEnd = getRequestCheckOutAt(request)

  if (!rawStart || !rawEnd || rawStart >= rawEnd) return null
  return { start: rawStart, end: rawEnd }
}

function getMealPricesForType(request, reportType) {
  if (reportType === "airline") {
    return getAirlineMealPrice(request)
  }
  return request.hotel?.mealPrice
}

function buildRequestRowForAllocation(request, reportType) {
  const stay = getEffectiveStay(request)
  if (!stay) return null

  const effectiveDays = calculateEffectiveCostDaysWithPartial(
    formatDateToISO(stay.start),
    formatDateToISO(stay.end),
    formatDateToISO(stay.start),
    formatDateToISO(stay.end)
  )
  if (effectiveDays <= 0) return null

  const pricePerDay = getLivingPricePerDay(request, reportType, {
    stayStart: stay.start,
    stayEnd: stay.end
  })
  const mealPlan = request.mealPlan || { dailyMeals: [] }
  const {
    totalMealCost,
    breakfastCount,
    lunchCount,
    dinnerCount,
    breakfastIncludedInPrice
  } = mealPlan?.dailyMeals
    ? calculateMealCostForReportDays(
        request,
        reportType,
        effectiveDays,
        effectiveDays,
        mealPlan,
        stay.start,
        stay.end
      )
    : {
        totalMealCost: 0,
        breakfastCount: 0,
        lunchCount: 0,
        dinnerCount: 0,
        breakfastIncludedInPrice: false
      }

  const totalLivingCost = effectiveDays > 0 ? pricePerDay * effectiveDays : 0
  if (!totalLivingCost && !totalMealCost) return null

  const hc = request.hotelChess?.[0] || {}
  return {
    id: request.id,
    arrival: formatLocalDate(stay.start),
    departure: formatLocalDate(stay.end),
    totalDays: effectiveDays,
    category: request.roomCategory || "",
    personName: request.person?.name || "Не указано",
    personPosition: request.person?.position?.name || "Не указано",
    roomName: hc.room?.name || "",
    roomId: hc.room?.id || hc.roomId || "",
    breakfastCount,
    lunchCount,
    dinnerCount,
    breakfastIncludedInPrice,
    totalMealCost: roundMoney(totalMealCost),
    totalLivingCost: roundMoney(totalLivingCost),
    pricePerDay: roundMoney(pricePerDay),
    totalDebt: roundMoney(totalLivingCost + totalMealCost),
    hotelName: request.hotel?.name || "Не указано"
  }
}

function buildLivingCostsByRequestId(requests, reportType) {
  const rows = []
  const requestIdQueuesByKey = new Map()
  const pricePerDayByRequestId = new Map()

  for (const request of requests) {
    const row = buildRequestRowForAllocation(request, reportType)
    if (!row) continue
    rows.push(row)
    pricePerDayByRequestId.set(request.id, row.pricePerDay)

    const key = createAllocationKey(row)
    if (!requestIdQueuesByKey.has(key)) {
      requestIdQueuesByKey.set(key, [])
    }
    requestIdQueuesByKey.get(key).push(request.id)
  }

  const livingCostByRequestId = new Map()
  const allocatedRows = buildAllocation(rows)
  for (const allocatedRow of allocatedRows) {
    const key = createAllocationKey(allocatedRow)
    const queue = requestIdQueuesByKey.get(key)
    if (!queue?.length) continue
    const requestId = queue.shift()
    livingCostByRequestId.set(
      requestId,
      roundMoney(
        (livingCostByRequestId.get(requestId) || 0) +
          (Number(allocatedRow.totalLivingCost) || 0)
      )
    )
  }

  return { livingCostByRequestId, pricePerDayByRequestId }
}

function calculateMealParts(request, reportType) {
  const stay = getEffectiveStay(request)
  if (!stay) {
    return { breakfast: 0, lunch: 0, dinner: 0, breakfastIncluded: false }
  }

  const effectiveDays = calculateEffectiveCostDaysWithPartial(
    formatDateToISO(stay.start),
    formatDateToISO(stay.end),
    formatDateToISO(stay.start),
    formatDateToISO(stay.end)
  )
  if (effectiveDays <= 0) {
    return { breakfast: 0, lunch: 0, dinner: 0, breakfastIncluded: false }
  }

  const mealPlan = request.mealPlan || { dailyMeals: [] }
  const {
    breakfastCount,
    lunchCount,
    dinnerCount,
    breakfastIncludedInPrice
  } = mealPlan?.dailyMeals
    ? calculateMealCostForReportDays(
        request,
        reportType,
        effectiveDays,
        effectiveDays,
        mealPlan,
        stay.start,
        stay.end
      )
    : {
        breakfastCount: 0,
        lunchCount: 0,
        dinnerCount: 0,
        breakfastIncludedInPrice: false
      }

  const mealPrices = getMealPricesForType(request, reportType)
  return {
    breakfast: breakfastIncludedInPrice
      ? 0
      : roundMoney(breakfastCount * (mealPrices?.breakfast || 0)),
    lunch: roundMoney(lunchCount * (mealPrices?.lunch || 0)),
    dinner: roundMoney(dinnerCount * (mealPrices?.dinner || 0)),
    breakfastIncluded: breakfastIncludedInPrice
  }
}

function buildPriceForRequest(
  request,
  reportType,
  livingCostByRequestId,
  pricePerDayByRequestId
) {
  const mealParts = calculateMealParts(request, reportType)
  return {
    livingCost: roundMoney(livingCostByRequestId.get(request.id) || 0),
    breakfast: mealParts.breakfast,
    lunch: mealParts.lunch,
    dinner: mealParts.dinner,
    breakfastIncluded: mealParts.breakfastIncluded,
    pricePerDay: roundMoney(pricePerDayByRequestId.get(request.id) || 0)
  }
}

async function fetchRoomClusterRequests(roomId, start, end) {
  if (!roomId || !start || !end) return []
  const rows = await prisma.request.findMany({
    where: {
      hotelChess: {
        some: {
          roomId,
          start: { lt: new Date(end) },
          end: { gt: new Date(start) }
        }
      }
    },
    include: REQUEST_INCLUDE_FOR_PRICING
  })
  return hydrateAirlinePrices(rows)
}

async function mapWithConcurrency(items, concurrency, mapper) {
  if (!items.length) return []
  const limit = Math.max(1, concurrency)
  const results = new Array(items.length)
  let nextIndex = 0

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++
      results[index] = await mapper(items[index], index)
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker())
  )
  return results
}

async function computeRequestPrices(request) {
  const hc = request.hotelChess?.[0]
  if (!hc?.roomId || !hc?.start || !hc?.end) {
    return { hotelPrice: null, airlinePrice: null }
  }

  const clusterRequests = await fetchRoomClusterRequests(
    hc.roomId,
    hc.start,
    hc.end
  )
  const withCurrent = clusterRequests.some((row) => row.id === request.id)
    ? clusterRequests.map((row) => (row.id === request.id ? request : row))
    : [...clusterRequests, request]

  return computeRequestPricesFromCluster(request, withCurrent)
}

export async function calculateRequestHotelPrice(requestId) {
  const request = await prisma.request.findUnique({
    where: { id: requestId },
    include: REQUEST_INCLUDE_FOR_PRICING
  })
  if (!request || request.hotel?.external) return null
  await hydrateAirlinePrices([request])
  const { hotelPrice } = await computeRequestPrices(request)
  return hotelPrice
}

export async function calculateRequestAirlinePrice(requestId) {
  const request = await prisma.request.findUnique({
    where: { id: requestId },
    include: REQUEST_INCLUDE_FOR_PRICING
  })
  if (!request || request.hotel?.external) return null
  await hydrateAirlinePrices([request])
  const { airlinePrice } = await computeRequestPrices(request)
  return airlinePrice
}

/**
 * Один load заявки + один load кластера комнаты → обе цены.
 */
export async function recalculateRequestPricing(requestId) {
  try {
    const request = await prisma.request.findUnique({
      where: { id: requestId },
      include: REQUEST_INCLUDE_FOR_PRICING
    })
    if (!request) return null

    if (request.hotel?.external) {
      return { hotelPrice: null, airlinePrice: null }
    }

    await hydrateAirlinePrices([request])
    const { hotelPrice, airlinePrice } = await computeRequestPrices(request)

    await prisma.request.update({
      where: { id: requestId },
      data: {
        requestHotelPrice: toStoredRequestPrice(hotelPrice),
        requestAirlinePrice: toStoredRequestPrice(airlinePrice)
      }
    })

    return { hotelPrice, airlinePrice }
  } catch (error) {
    logger.error(`Ошибка при пересчете цен заявки ${requestId}:`, error)
    return null
  }
}

const PRICING_CONCURRENCY = 8

/**
 * Batch: находим затронутые заявки → один supercluster по комнате →
 * цены в памяти → точечные update. Без N× полных перезагрузок кластера.
 */
export async function recalculateOverlappingRequests(
  roomId,
  start,
  end,
  excludeRequestId,
  extraPeriods = []
) {
  if (!roomId) return

  const periods = [
    start && end ? { start, end } : null,
    ...(Array.isArray(extraPeriods) ? extraPeriods : [])
  ].filter((period) => period?.start && period?.end)

  if (!periods.length) return

  try {
    const overlapping = await prisma.hotelChess.findMany({
      where: {
        roomId,
        requestId: { not: null },
        OR: periods.map((period) => ({
          start: { lt: new Date(period.end) },
          end: { gt: new Date(period.start) }
        }))
      },
      select: { requestId: true, start: true, end: true }
    })

    const requestIds = [
      ...new Set(
        overlapping
          .map((hc) => hc.requestId)
          .filter((id) => id && id !== excludeRequestId)
      )
    ]
    if (!requestIds.length) return

    const targets = await prisma.request.findMany({
      where: { id: { in: requestIds } },
      include: REQUEST_INCLUDE_FOR_PRICING
    })

    let minStart = Infinity
    let maxEnd = -Infinity
    for (const request of targets) {
      const hc = request.hotelChess?.[0]
      if (!hc?.start || !hc?.end) continue
      const s = new Date(hc.start).getTime()
      const e = new Date(hc.end).getTime()
      if (s < minStart) minStart = s
      if (e > maxEnd) maxEnd = e
    }
    for (const period of periods) {
      const s = new Date(period.start).getTime()
      const e = new Date(period.end).getTime()
      if (s < minStart) minStart = s
      if (e > maxEnd) maxEnd = e
    }

    if (!Number.isFinite(minStart) || !Number.isFinite(maxEnd)) return

    const supercluster = await fetchRoomClusterRequests(
      roomId,
      new Date(minStart),
      new Date(maxEnd)
    )
    await hydrateAirlinePrices(targets)

    const targetIdSet = new Set(requestIds)
    const byId = new Map(supercluster.map((row) => [row.id, row]))
    for (const target of targets) {
      byId.set(target.id, target)
    }
    const allLoaded = [...byId.values()]

    await mapWithConcurrency(targets, PRICING_CONCURRENCY, async (request) => {
      if (request.hotel?.external) return null
      if (!targetIdSet.has(request.id)) return null

      const cluster = clusterForRequest(allLoaded, request, roomId)
      if (!cluster.length) return null

      const { hotelPrice, airlinePrice } = computeRequestPricesFromCluster(
        request,
        cluster
      )

      await prisma.request.update({
        where: { id: request.id },
        data: {
          requestHotelPrice: toStoredRequestPrice(hotelPrice),
          requestAirlinePrice: toStoredRequestPrice(airlinePrice)
        }
      })
      return request.id
    })
  } catch (error) {
    logger.error("Ошибка при пересчете пересекающихся заявок:", error)
  }
}

export async function recalculateAffectedByRoomChange(
  oldRoomId,
  oldStart,
  oldEnd,
  newRoomId,
  newStart,
  newEnd,
  requestId
) {
  const promises = []

  if (oldRoomId && oldStart && oldEnd) {
    promises.push(
      recalculateOverlappingRequests(oldRoomId, oldStart, oldEnd, requestId)
    )
  }

  if (
    newRoomId &&
    newStart &&
    newEnd &&
    !(
      newRoomId === oldRoomId &&
      String(newStart) === String(oldStart) &&
      String(newEnd) === String(oldEnd)
    )
  ) {
    promises.push(
      recalculateOverlappingRequests(newRoomId, newStart, newEnd, requestId)
    )
  }

  await Promise.all(promises)
}

/**
 * Пересчёт незаархивированных заявок RoomKind, чьё проживание пересекает [startDate, endDate].
 * Если даты не переданы — пересчитывает все незаархивированные заявки этого RoomKind.
 */
export async function recalculateNonArchivedForRoomKindPeriod(
  roomKindId,
  startDate = null,
  endDate = null
) {
  if (!roomKindId) return

  try {
    const rooms = await prisma.room.findMany({
      where: { roomKindId },
      select: { id: true }
    })
    const roomIds = rooms.map((r) => r.id)
    if (!roomIds.length) return

    const where = {
      roomId: { in: roomIds },
      requestId: { not: null },
      request: {
        archive: false,
        status: { notIn: ["archived", "archiving"] }
      }
    }

    if (startDate && endDate) {
      const periodStart = new Date(startDate)
      const periodEnd = new Date(endDate)
      const periodEndInclusive = new Date(periodEnd)
      periodEndInclusive.setHours(23, 59, 59, 999)
      where.start = { lte: periodEndInclusive }
      where.end = { gte: periodStart }
    }

    const chess = await prisma.hotelChess.findMany({
      where,
      select: { requestId: true }
    })

    const requestIds = [
      ...new Set(chess.map((c) => c.requestId).filter(Boolean))
    ]
    await mapWithConcurrency(requestIds, PRICING_CONCURRENCY, (id) =>
      recalculateRequestPricing(id)
    )
  } catch (error) {
    logger.error(
      `Ошибка пересчёта заявок для RoomKind ${roomKindId}:`,
      error
    )
  }
}

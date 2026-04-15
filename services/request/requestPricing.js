import { prisma } from "../../prisma.js"
import {
  buildAllocation,
  calculateEffectiveCostDaysWithPartial,
  calculateMealCostForReportDays,
  formatDateToISO,
  formatLocalDate,
  getAirlineMealPrice,
  getLivingPricePerDay,
  parseAsLocal
} from "../report/reportUtils.js"
import { logger } from "../infra/logger.js"

const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100

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
      room: { include: { roomKind: true } }
    }
  },
  hotel: { select: { id: true, mealPrice: true, mealPriceForAir: true } },
  airline: { include: { prices: { include: { airports: true } } } },
  airport: { select: { id: true } },
  person: { include: { position: true } }
}

function getEffectiveStay(request) {
  const hc = request.hotelChess?.[0]
  const rawStart = hc?.start ? parseAsLocal(hc.start) : parseAsLocal(request.arrival)
  const rawEnd = hc?.end ? parseAsLocal(hc.end) : parseAsLocal(request.departure)

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

  const pricePerDay = getLivingPricePerDay(request, reportType)
  const mealPlan = request.mealPlan || { dailyMeals: [] }
  const { totalMealCost, breakfastCount, lunchCount, dinnerCount } = mealPlan?.dailyMeals
    ? calculateMealCostForReportDays(
        request,
        reportType,
        effectiveDays,
        effectiveDays,
        mealPlan,
        stay.start,
        stay.end
      )
    : { totalMealCost: 0, breakfastCount: 0, lunchCount: 0, dinnerCount: 0 }

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

  for (const request of requests) {
    const row = buildRequestRowForAllocation(request, reportType)
    if (!row) continue
    rows.push(row)

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

  return livingCostByRequestId
}

function calculateMealParts(request, reportType) {
  const stay = getEffectiveStay(request)
  if (!stay) {
    return { breakfast: 0, lunch: 0, dinner: 0 }
  }

  const effectiveDays = calculateEffectiveCostDaysWithPartial(
    formatDateToISO(stay.start),
    formatDateToISO(stay.end),
    formatDateToISO(stay.start),
    formatDateToISO(stay.end)
  )
  if (effectiveDays <= 0) {
    return { breakfast: 0, lunch: 0, dinner: 0 }
  }

  const mealPlan = request.mealPlan || { dailyMeals: [] }
  const { breakfastCount, lunchCount, dinnerCount } = mealPlan?.dailyMeals
    ? calculateMealCostForReportDays(
        request,
        reportType,
        effectiveDays,
        effectiveDays,
        mealPlan,
        stay.start,
        stay.end
      )
    : { breakfastCount: 0, lunchCount: 0, dinnerCount: 0 }

  const mealPrices = getMealPricesForType(request, reportType)
  return {
    breakfast: roundMoney(breakfastCount * (mealPrices?.breakfast || 0)),
    lunch: roundMoney(lunchCount * (mealPrices?.lunch || 0)),
    dinner: roundMoney(dinnerCount * (mealPrices?.dinner || 0))
  }
}

function buildPriceForRequest(request, reportType, livingCostByRequestId) {
  const mealParts = calculateMealParts(request, reportType)
  return {
    livingCost: roundMoney(livingCostByRequestId.get(request.id) || 0),
    breakfast: mealParts.breakfast,
    lunch: mealParts.lunch,
    dinner: mealParts.dinner
  }
}

async function fetchRoomClusterRequests(roomId, start, end) {
  if (!roomId || !start || !end) return []
  return prisma.request.findMany({
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
}

export async function calculateRequestHotelPrice(requestId) {
  const request = await prisma.request.findUnique({
    where: { id: requestId },
    include: REQUEST_INCLUDE_FOR_PRICING
  })
  if (!request) return null

  const hc = request.hotelChess?.[0]
  if (!hc?.roomId || !hc?.start || !hc?.end) return null

  const clusterRequests = await fetchRoomClusterRequests(hc.roomId, hc.start, hc.end)
  const livingCostByRequestId = buildLivingCostsByRequestId(clusterRequests, "hotel")
  return buildPriceForRequest(request, "hotel", livingCostByRequestId)
}

export async function calculateRequestAirlinePrice(requestId) {
  const request = await prisma.request.findUnique({
    where: { id: requestId },
    include: REQUEST_INCLUDE_FOR_PRICING
  })
  if (!request) return null

  const hc = request.hotelChess?.[0]
  if (!hc?.roomId || !hc?.start || !hc?.end) return null

  const clusterRequests = await fetchRoomClusterRequests(hc.roomId, hc.start, hc.end)
  const livingCostByRequestId = buildLivingCostsByRequestId(clusterRequests, "airline")
  return buildPriceForRequest(request, "airline", livingCostByRequestId)
}

export async function recalculateRequestPricing(requestId) {
  try {
    const [hotelPrice, airlinePrice] = await Promise.all([
      calculateRequestHotelPrice(requestId),
      calculateRequestAirlinePrice(requestId)
    ])

    await prisma.request.update({
      where: { id: requestId },
      data: {
        requestHotelPrice: hotelPrice,
        requestAirlinePrice: airlinePrice
      }
    })

    return { hotelPrice, airlinePrice }
  } catch (error) {
    logger.error(`Ошибка при пересчете цен заявки ${requestId}:`, error)
    return null
  }
}

export async function recalculateOverlappingRequests(roomId, start, end, excludeRequestId) {
  if (!roomId || !start || !end) return

  try {
    const overlapping = await prisma.hotelChess.findMany({
      where: {
        roomId,
        start: { lt: new Date(end) },
        end: { gt: new Date(start) },
        requestId: { not: null }
      },
      select: { requestId: true }
    })

    const requestIds = [...new Set(
      overlapping
        .map((hc) => hc.requestId)
        .filter((id) => id && id !== excludeRequestId)
    )]

    await Promise.all(requestIds.map((reqId) => recalculateRequestPricing(reqId)))
  } catch (error) {
    logger.error("Ошибка при пересчете пересекающихся заявок:", error)
  }
}

export async function recalculateAffectedByRoomChange(
  oldRoomId, oldStart, oldEnd,
  newRoomId, newStart, newEnd,
  requestId
) {
  const promises = []

  if (oldRoomId && oldStart && oldEnd) {
    promises.push(recalculateOverlappingRequests(oldRoomId, oldStart, oldEnd, requestId))
  }

  if (newRoomId && newStart && newEnd) {
    promises.push(recalculateOverlappingRequests(newRoomId, newStart, newEnd, requestId))
  }

  await Promise.all(promises)
}

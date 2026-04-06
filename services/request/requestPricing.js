import { prisma } from "../../prisma.js"
import {
  getAirlinePriceForCategory,
  getAirlineMealPrice
} from "../report/reportUtils.js"
import { logger } from "../infra/logger.js"

const NO_MEAL_CATEGORIES = ["apartment", "studio"]

const MS_PER_DAY = 86_400_000

function listDays(start, end) {
  const days = []
  const s = new Date(start)
  const e = new Date(end)
  let cur = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate()))
  const last = new Date(Date.UTC(e.getUTCFullYear(), e.getUTCMonth(), e.getUTCDate()))
  while (cur < last) {
    days.push(new Date(cur))
    cur = new Date(cur.getTime() + MS_PER_DAY)
  }
  return days
}

async function countOccupantsForDay(roomId, dayStart, dayEnd) {
  return prisma.hotelChess.count({
    where: {
      roomId,
      start: { lt: dayEnd },
      end: { gt: dayStart }
    }
  })
}

function getHotelPricePerDay(room) {
  const cat = room.category
  if (cat === "studio" || cat === "apartment") {
    return room.price || 0
  }
  return room.roomKind?.price || 0
}

function getAirlinePricePerDay(request) {
  return getAirlinePriceForCategory(request, request.roomCategory)
}

function getMealCounts(mealPlan) {
  if (!mealPlan?.included || !mealPlan.dailyMeals?.length) {
    return { breakfastCount: 0, lunchCount: 0, dinnerCount: 0 }
  }
  let breakfastCount = 0
  let lunchCount = 0
  let dinnerCount = 0
  for (const day of mealPlan.dailyMeals) {
    breakfastCount += day.breakfast ?? 0
    lunchCount += day.lunch ?? 0
    dinnerCount += day.dinner ?? 0
  }
  return { breakfastCount, lunchCount, dinnerCount }
}

const REQUEST_INCLUDE_FOR_PRICING = {
  hotelChess: {
    include: {
      room: { include: { roomKind: true } }
    }
  },
  hotel: { select: { id: true, mealPrice: true, mealPriceForAir: true } },
  airline: { include: { prices: { include: { airports: true } } } },
  airport: { select: { id: true } }
}

export async function calculateRequestHotelPrice(requestId) {
  const request = await prisma.request.findUnique({
    where: { id: requestId },
    include: REQUEST_INCLUDE_FOR_PRICING
  })
  if (!request) return null

  const hc = request.hotelChess?.[0]
  if (!hc || !hc.roomId || !hc.start || !hc.end) return null

  const room = hc.room
  if (!room) return null

  const pricePerDay = getHotelPricePerDay(room)
  const days = listDays(hc.start, hc.end)

  let livingCost = 0
  for (const day of days) {
    const dayEnd = new Date(day.getTime() + MS_PER_DAY)
    const occupants = await countOccupantsForDay(hc.roomId, day, dayEnd)
    const divisor = Math.max(1, occupants)
    livingCost += pricePerDay / divisor
  }
  livingCost = Math.round(livingCost * 100) / 100

  const isNoMeal = NO_MEAL_CATEGORIES.includes(request.roomCategory)
  const { breakfastCount, lunchCount, dinnerCount } = getMealCounts(request.mealPlan)
  const mealPrice = request.hotel?.mealPrice

  const breakfast = isNoMeal ? 0 : Math.round(breakfastCount * (mealPrice?.breakfast || 0) * 100) / 100
  const lunch = isNoMeal ? 0 : Math.round(lunchCount * (mealPrice?.lunch || 0) * 100) / 100
  const dinner = isNoMeal ? 0 : Math.round(dinnerCount * (mealPrice?.dinner || 0) * 100) / 100

  return { livingCost, breakfast, lunch, dinner }
}

export async function calculateRequestAirlinePrice(requestId) {
  const request = await prisma.request.findUnique({
    where: { id: requestId },
    include: REQUEST_INCLUDE_FOR_PRICING
  })
  if (!request) return null

  const hc = request.hotelChess?.[0]
  if (!hc || !hc.roomId || !hc.start || !hc.end) return null

  const pricePerDay = getAirlinePricePerDay(request)
  const days = listDays(hc.start, hc.end)

  let livingCost = 0
  for (const day of days) {
    const dayEnd = new Date(day.getTime() + MS_PER_DAY)
    const occupants = await countOccupantsForDay(hc.roomId, day, dayEnd)
    const divisor = Math.max(1, occupants)
    livingCost += pricePerDay / divisor
  }
  livingCost = Math.round(livingCost * 100) / 100

  const isNoMeal = NO_MEAL_CATEGORIES.includes(request.roomCategory)
  const { breakfastCount, lunchCount, dinnerCount } = getMealCounts(request.mealPlan)
  const airlineMealPrice = getAirlineMealPrice(request)

  const breakfast = isNoMeal ? 0 : Math.round(breakfastCount * (airlineMealPrice?.breakfast || 0) * 100) / 100
  const lunch = isNoMeal ? 0 : Math.round(lunchCount * (airlineMealPrice?.lunch || 0) * 100) / 100
  const dinner = isNoMeal ? 0 : Math.round(dinnerCount * (airlineMealPrice?.dinner || 0) * 100) / 100

  return { livingCost, breakfast, lunch, dinner }
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

    for (const reqId of requestIds) {
      await recalculateRequestPricing(reqId)
    }
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

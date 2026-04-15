import { prisma } from "../../prisma.js"
import {
  calculateLivingCost,
  calculateMealCostForReportDays,
  calculateEffectiveCostDaysWithPartial,
  parseAsLocal,
  formatDateToISO,
  formatLocalDate,
  buildAllocation
} from "../report/reportUtils.js"

const ACTIVE_STATUSES = [
  "done",
  "transferred",
  "extended",
  "archiving",
  "archived",
  "reduced"
]

const roundMoney = (v) => Math.round((Number(v) || 0) * 100) / 100

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

export function validateDateRange(dateFrom, dateTo, label = "period") {
  const start = new Date(dateFrom)
  const end = new Date(dateTo)
  if (Number.isNaN(start.getTime()))
    throw new Error(`Некорректная дата ${label}.dateFrom`)
  if (Number.isNaN(end.getTime()))
    throw new Error(`Некорректная дата ${label}.dateTo`)
  if (start > end)
    throw new Error(`${label}: dateFrom не может быть позже dateTo`)
  return { start, end }
}

export function buildRequestWhere({ airlineId, start, end, airportIds, positionIds }) {
  const where = {
    airlineId,
    status: { in: ACTIVE_STATUSES },
    AND: [
      {
        OR: [
          { arrival: { gte: start, lte: end } },
          { departure: { gte: start, lte: end } },
          { AND: [{ arrival: { lte: start } }, { departure: { gte: end } }] }
        ]
      }
    ]
  }

  if (airportIds?.length) {
    where.airportId = { in: airportIds }
  }

  if (positionIds?.length) {
    where.person = { positionId: { in: positionIds } }
  }

  return where
}

export const REQUEST_INCLUDE = {
  person: { include: { position: true } },
  hotelChess: true,
  airline: { include: { prices: { include: { airports: true } } } },
  hotel: true,
  mealPlan: true,
  airport: true
}

export function buildTransferWhere({ airlineId, start, end }) {
  return {
    airlineId,
    status: { not: "CANCELLED" },
    OR: [
      { scheduledPickupAt: { gte: start, lte: end } },
      {
        AND: [
          { scheduledPickupAt: null },
          { createdAt: { gte: start, lte: end } }
        ]
      }
    ]
  }
}

export const TRANSFER_INCLUDE = {
  persons: { include: { personal: { include: { position: true } } } }
}

function getVehicleType(passengersCount) {
  if (passengersCount <= 3) return "threeSeater"
  if (passengersCount <= 5) return "fiveSeater"
  return "sevenSeater"
}

export async function computeTransferSpend(transfers, airlineId) {
  const { total } = await computeTransferBudgetDetails(transfers, airlineId)
  return total
}

export async function computeTransferBudgetDetails(transfers, airlineId) {
  if (!transfers.length) return { total: 0, byTransferId: new Map() }

  const transferPrices = await prisma.transferPrice.findMany({
    where: { airlineId },
    include: {
      airportOnTransferPrice: true,
      cityOnTransferPrice: true
    }
  })

  if (!transferPrices.length) return { total: 0, byTransferId: new Map() }

  let total = 0
  const byTransferId = new Map()

  for (const t of transfers) {
    const vehicleType = getVehicleType(t.passengersCount || 1)
    let price = 0

    for (const tp of transferPrices) {
      const routePrices = tp.prices?.[vehicleType]
      if (routePrices) {
        price = routePrices.city || routePrices.intercity || 0
        break
      }
    }

    const roundedPrice = roundMoney(price)
    byTransferId.set(t.id, roundedPrice)
    total += roundedPrice
  }

  return { total: roundMoney(total), byTransferId }
}

export function computeRequestCosts(request, rangeStart, rangeEnd) {
  const hotelChess = request.hotelChess?.[0] || {}
  const rawIn = hotelChess.start
    ? parseAsLocal(hotelChess.start)
    : parseAsLocal(request.arrival)
  const rawOut = hotelChess.end
    ? parseAsLocal(hotelChess.end)
    : parseAsLocal(request.departure)

  const effectiveArrival = rawIn < rangeStart ? rangeStart : rawIn
  const effectiveDeparture = rawOut > rangeEnd ? rangeEnd : rawOut

  const effectiveDays = calculateEffectiveCostDaysWithPartial(
    formatDateToISO(effectiveArrival),
    formatDateToISO(effectiveDeparture),
    formatDateToISO(rangeStart),
    formatDateToISO(rangeEnd)
  )

  const livingCost = calculateLivingCost(request, "airline", effectiveDays)

  const mealPlan = request.mealPlan || { dailyMeals: [] }
  const { totalMealCost } = mealPlan?.dailyMeals
    ? calculateMealCostForReportDays(
        request,
        "airline",
        effectiveDays,
        effectiveDays,
        mealPlan,
        effectiveArrival,
        effectiveDeparture
      )
    : { totalMealCost: 0 }

  return {
    livingCost: roundMoney(Number(livingCost) || 0),
    mealCost: roundMoney(Number(totalMealCost) || 0)
  }
}

function buildRequestRowForAllocation(request, rangeStart, rangeEnd) {
  const hotelChess = request.hotelChess?.[0] || {}
  const rawIn = hotelChess.start
    ? parseAsLocal(hotelChess.start)
    : parseAsLocal(request.arrival)
  const rawOut = hotelChess.end
    ? parseAsLocal(hotelChess.end)
    : parseAsLocal(request.departure)

  const effectiveArrival = rawIn < rangeStart ? rangeStart : rawIn
  const effectiveDeparture = rawOut > rangeEnd ? rangeEnd : rawOut
  if (effectiveArrival > effectiveDeparture) {
    return null
  }

  const effectiveDaysRaw = calculateEffectiveCostDaysWithPartial(
    formatDateToISO(effectiveArrival),
    formatDateToISO(effectiveDeparture),
    formatDateToISO(rangeStart),
    formatDateToISO(rangeEnd)
  )
  const effectiveDays = Math.max(0, Number(effectiveDaysRaw) || 0)

  const livingCost = calculateLivingCost(request, "airline", effectiveDays)
  const mealPlan = request.mealPlan || { dailyMeals: [] }
  const { totalMealCost, breakfastCount, lunchCount, dinnerCount } = mealPlan?.dailyMeals
    ? calculateMealCostForReportDays(
        request,
        "airline",
        effectiveDays,
        effectiveDays,
        mealPlan,
        effectiveArrival,
        effectiveDeparture
      )
    : { totalMealCost: 0, breakfastCount: 0, lunchCount: 0, dinnerCount: 0 }

  if (!livingCost && !totalMealCost) {
    return null
  }

  const pricePerDay = effectiveDays > 0 ? Number(livingCost || 0) / effectiveDays : 0

  return {
    id: request.id,
    arrival: formatLocalDate(effectiveArrival),
    departure: formatLocalDate(effectiveDeparture),
    totalDays: effectiveDays,
    category: request.roomCategory || "",
    personName: request.person?.name || "Не указано",
    personPosition: request.person?.position?.name || "Не указано",
    roomName: hotelChess.room?.name || "",
    roomId: hotelChess.room?.id || hotelChess.roomId || "",
    breakfastCount,
    lunchCount,
    dinnerCount,
    totalMealCost: roundMoney(Number(totalMealCost) || 0),
    totalLivingCost: roundMoney(Number(livingCost) || 0),
    pricePerDay: roundMoney(pricePerDay),
    totalDebt: roundMoney((Number(livingCost) || 0) + (Number(totalMealCost) || 0)),
    hotelName: request.hotel?.name || "Не указано"
  }
}

export function buildRequestBudgetMapWithAllocation(requests, rangeStart, rangeEnd) {
  const rows = []
  const requestIdQueuesByKey = new Map()

  for (const request of requests) {
    const row = buildRequestRowForAllocation(request, rangeStart, rangeEnd)
    if (!row) continue

    rows.push(row)
    const key = createAllocationKey(row)
    if (!requestIdQueuesByKey.has(key)) {
      requestIdQueuesByKey.set(key, [])
    }
    requestIdQueuesByKey.get(key).push(request.id)
  }

  const livingBudgetByRequestId = new Map()
  const mealBudgetByRequestId = new Map()

  for (const row of rows) {
    mealBudgetByRequestId.set(
      row.id,
      roundMoney((mealBudgetByRequestId.get(row.id) || 0) + (Number(row.totalMealCost) || 0))
    )
  }

  const allocatedRows = buildAllocation(rows)
  for (const allocatedRow of allocatedRows) {
    const key = createAllocationKey(allocatedRow)
    const queue = requestIdQueuesByKey.get(key)
    if (!queue?.length) continue

    const requestId = queue.shift()
    livingBudgetByRequestId.set(
      requestId,
      roundMoney(
        (livingBudgetByRequestId.get(requestId) || 0) +
          (Number(allocatedRow.totalLivingCost) || 0)
      )
    )
  }

  const budgetByRequestId = new Map()
  for (const request of requests) {
    budgetByRequestId.set(request.id, {
      livingBudget: roundMoney(livingBudgetByRequestId.get(request.id) || 0),
      mealBudget: roundMoney(mealBudgetByRequestId.get(request.id) || 0)
    })
  }

  return budgetByRequestId
}

export function extractRoomIds(requests) {
  const ids = new Set()
  for (const r of requests) {
    const hc = Array.isArray(r.hotelChess) ? r.hotelChess : []
    for (const item of hc) {
      const roomId = item?.roomId || item?.room?.id
      if (roomId) ids.add(roomId)
    }
  }
  return ids
}

export function extractUniquePersonIds(requests) {
  const ids = new Set()
  for (const r of requests) {
    if (r.personId) ids.add(r.personId)
  }
  return ids
}

export function buildPositionsBreakdown(requests) {
  const posMap = new Map()
  let total = 0

  for (const r of requests) {
    if (!r.personId) continue
    total++
    const posName = r.person?.position?.name || "Не указана"
    const posId = r.person?.positionId || null
    if (!posMap.has(posName)) {
      posMap.set(posName, { positionId: posId, positionName: posName, count: 0 })
    }
    posMap.get(posName).count++
  }

  const result = []
  for (const entry of posMap.values()) {
    result.push({
      positionId: entry.positionId,
      positionName: entry.positionName,
      count: entry.count,
      percent: total > 0 ? roundMoney((entry.count / total) * 100) : 0
    })
  }

  result.sort((a, b) => b.count - a.count)
  return result
}

export function filterTransfersByPositions(transfers, positionIds) {
  if (!positionIds?.length) return transfers

  const posSet = new Set(positionIds)

  return transfers.filter((t) => {
    const persons = Array.isArray(t.persons) ? t.persons : []
    return persons.some((link) => {
      const p = link?.personal
      return p?.positionId && posSet.has(p.positionId)
    })
  })
}

export function countTransferUniquePeople(transfers) {
  const ids = new Set()
  for (const t of transfers) {
    const persons = Array.isArray(t.persons) ? t.persons : []
    for (const link of persons) {
      if (link?.personal?.id) ids.add(link.personal.id)
    }
  }
  return ids
}

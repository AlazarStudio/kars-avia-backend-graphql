import { prisma } from "../../prisma.js"
import {
  buildPositionWhere,
  calculateLivingCost,
  calculateMealCostForReportDays,
  calculateEffectiveCostDaysWithPartial,
  parseAsLocal,
  formatDateToISO
} from "../report/reportUtils.js"

const assertDate = (d, name) => {
  const dt = new Date(d)
  if (Number.isNaN(dt.getTime())) throw new Error(`Некорректная дата ${name}`)
  return dt
}

const validateRange = (range, label) => {
  const start = assertDate(range?.startDate, `${label}.startDate`)
  const end = assertDate(range?.endDate, `${label}.endDate`)
  if (start > end) {
    throw new Error(`${label}: startDate не может быть позже endDate`)
  }
  return { start, end }
}

const normalizeServices = (services) => {
  const s = Array.isArray(services) ? services : []
  const set = new Set(s)
  if (!set.size) return ["LIVING", "MEAL", "TRANSFER"]
  return Array.from(set)
}

const normalizeRegions = (regions) => {
  if (!regions) return null
  const arr = Array.isArray(regions) ? regions : [regions]
  const cleaned = arr.map((r) => String(r).trim()).filter(Boolean)
  return cleaned.length ? cleaned : null
}

const buildCrewWhere = (crew) => {
  const mode = crew?.mode || "ALL"
  if (mode === "SQUADRON") return buildPositionWhere("squadron")
  if (mode === "TECHNICIAN") return buildPositionWhere("technician")
  if (mode === "POSITIONS") {
    const names = Array.isArray(crew?.positionNames) ? crew.positionNames : []
    const cleaned = names.map((x) => String(x).trim()).filter(Boolean)
    if (!cleaned.length) {
      throw new Error("crew.positionNames обязателен для режима POSITIONS")
    }
    return { person: { position: { name: { in: cleaned } } } }
  }
  return {}
}

const pct = (base, delta) => {
  if (!base) return null
  return (delta / base) * 100
}

const addMetrics = (acc, m) => {
  acc.peopleIds ??= new Set()
  acc.roomIds ??= new Set()
  acc.peopleCount += m.peopleCount
  acc.budgetRub += m.budgetRub
  acc.roomsUsed += m.roomsUsed
  return acc
}

const roundMoney = (v) => Math.round((Number(v) || 0) * 100) / 100

async function getRegionToAirportIds({ regions }) {
  // if regions not provided -> compute for all existing regions in City
  if (!regions) {
    const cities = await prisma.city.findMany({
      select: { region: true },
      distinct: ["region"]
    })
    regions = cities.map((c) => c.region).filter(Boolean)
  }

  const result = new Map()
  for (const region of regions) {
    const cities = await prisma.city.findMany({
      where: { region: region },
      select: { city: true }
    })
    const cityNames = cities.map((c) => c.city).filter(Boolean)
    if (!cityNames.length) {
      result.set(region, [])
      continue
    }
    const airports = await prisma.airport.findMany({
      where: { city: { in: cityNames } },
      select: { id: true }
    })
    result.set(
      region,
      airports.map((a) => a.id)
    )
  }
  return result
}

function extractRoomsUsedFromRequest(request) {
  const ids = new Set()
  const hc = Array.isArray(request?.hotelChess) ? request.hotelChess : []
  for (const item of hc) {
    const roomId = item?.roomId || item?.room?.id
    if (roomId) ids.add(roomId)
  }
  return ids
}

function computeRequestCostsWithinRange(request, rangeStart, rangeEnd, reportType) {
  const hotelChess = request.hotelChess?.[0] || {}
  const rawIn = hotelChess.start ? parseAsLocal(hotelChess.start) : parseAsLocal(request.arrival)
  const rawOut = hotelChess.end ? parseAsLocal(hotelChess.end) : parseAsLocal(request.departure)

  const effectiveArrival = rawIn < rangeStart ? rangeStart : rawIn
  const effectiveDeparture = rawOut > rangeEnd ? rangeEnd : rawOut

  const effectiveDays = calculateEffectiveCostDaysWithPartial(
    formatDateToISO(effectiveArrival),
    formatDateToISO(effectiveDeparture),
    formatDateToISO(rangeStart),
    formatDateToISO(rangeEnd)
  )

  const totalLivingCost = calculateLivingCost(request, reportType, effectiveDays)

  const mealPlan = request.mealPlan || { dailyMeals: [] }
  const { totalMealCost } = mealPlan?.dailyMeals
    ? calculateMealCostForReportDays(
        request,
        reportType,
        effectiveDays,
        effectiveDays,
        mealPlan,
        effectiveArrival,
        effectiveDeparture
      )
    : { totalMealCost: 0 }

  return {
    totalLivingCost: Number(totalLivingCost) || 0,
    totalMealCost: Number(totalMealCost) || 0
  }
}

async function computePeriodMetricsForRegion({
  airlineId,
  airportIds,
  range,
  crewWhere,
  services
}) {
  const { start, end } = range

  const requestNeeded = services.includes("LIVING") || services.includes("MEAL")
  const transferNeeded = services.includes("TRANSFER")

  const metricsByService = new Map()
  for (const s of services) {
    metricsByService.set(s, {
      peopleIds: new Set(),
      roomIds: new Set(),
      peopleCount: 0,
      budgetRub: 0,
      roomsUsed: 0
    })
  }

  if (requestNeeded) {
    const where = {
      airlineId,
      ...(airportIds?.length ? { airportId: { in: airportIds } } : {}),
      AND: [
        // пересечение интервала проживания с периодом
        {
          OR: [
            { arrival: { gte: start, lte: end } },
            { departure: { gte: start, lte: end } },
            { AND: [{ arrival: { lte: start } }, { departure: { gte: end } }] }
          ]
        },
        crewWhere
      ],
      status: {
        in: [
          "done",
          "transferred",
          "extended",
          "archiving",
          "archived",
          "reduced"
        ]
      }
    }

    const requests = await prisma.request.findMany({
      where,
      include: {
        person: { include: { position: true } },
        hotelChess: true,
        airline: { include: { prices: { include: { airports: true } } } },
        hotel: true,
        mealPlan: true,
        airport: true
      }
    })

    for (const r of requests) {
      const personId = r.personId
      if (personId) {
        if (services.includes("LIVING")) metricsByService.get("LIVING").peopleIds.add(personId)
        if (services.includes("MEAL")) metricsByService.get("MEAL").peopleIds.add(personId)
      }

      if (services.includes("LIVING")) {
        const rooms = extractRoomsUsedFromRequest(r)
        rooms.forEach((id) => metricsByService.get("LIVING").roomIds.add(id))
      }

      if (services.includes("MEAL")) {
        // room фонд к питанию не относится
      }

      const costs = computeRequestCostsWithinRange(r, start, end, "airline")

      if (services.includes("LIVING")) {
        metricsByService.get("LIVING").budgetRub += costs.totalLivingCost
      }
      if (services.includes("MEAL")) {
        metricsByService.get("MEAL").budgetRub += costs.totalMealCost
      }
    }
  }

  if (transferNeeded) {
    // В трансфере нет прямой привязки к аэропорту/региону. Пока считаем по airlineId и датам.
    // Временной якорь: scheduledPickupAt (если есть) иначе createdAt.
    const transfers = await prisma.transfer.findMany({
      where: {
        airlineId,
        OR: [
          { scheduledPickupAt: { gte: start, lte: end } },
          { AND: [{ scheduledPickupAt: null }, { createdAt: { gte: start, lte: end } }] }
        ]
      },
      include: {
        persons: { include: { personal: { include: { position: true } } } }
      }
    })

    for (const t of transfers) {
      const persons = Array.isArray(t.persons) ? t.persons : []
      for (const link of persons) {
        const p = link?.personal
        if (!p?.id) continue

        // фильтр по crew для transfer: повторяем правила на базе position.name
        const mode = crewWhere?.person?.position?.name ? "POSITIONS" : null
        if (crewWhere?.person?.position?.name?.in) {
          if (!crewWhere.person.position.name.in.includes(p.position?.name)) continue
        } else if (crewWhere?.person?.position?.name?.notIn) {
          if (crewWhere.person.position.name.notIn.includes(p.position?.name)) continue
        } else if (mode) {
          // no-op
        }

        metricsByService.get("TRANSFER").peopleIds.add(p.id)
      }
    }

    // budgetRub остаётся 0 (нет модели стоимости)
  }

  // finalize
  const out = {}
  for (const [service, m] of metricsByService.entries()) {
    const peopleCount = m.peopleIds.size
    const roomsUsed = service === "LIVING" ? m.roomIds.size : 0
    out[service] = {
      peopleCount,
      budgetRub: roundMoney(m.budgetRub),
      roomsUsed
    }
  }

  return out
}

export async function analyticsAirlineServiceComparison(input) {
  const airlineId = input?.airlineId
  if (!airlineId) throw new Error("airlineId обязателен")

  const period1 = validateRange(input?.period1, "period1")
  const period2 = validateRange(input?.period2, "period2")

  const services = normalizeServices(input?.services)
  const regions = normalizeRegions(input?.regions)
  const crewWhere = buildCrewWhere(input?.crew)

  const regionToAirportIds = await getRegionToAirportIds({ regions })

  const rows = []
  for (const [region, airportIds] of regionToAirportIds.entries()) {
    const p1 = await computePeriodMetricsForRegion({
      airlineId,
      airportIds,
      range: period1,
      crewWhere,
      services
    })
    const p2 = await computePeriodMetricsForRegion({
      airlineId,
      airportIds,
      range: period2,
      crewWhere,
      services
    })

    for (const service of services) {
      const m1 = p1[service] || { peopleCount: 0, budgetRub: 0, roomsUsed: 0 }
      const m2 = p2[service] || { peopleCount: 0, budgetRub: 0, roomsUsed: 0 }

      const peopleDelta = m2.peopleCount - m1.peopleCount
      const budgetDeltaRub = roundMoney(m2.budgetRub - m1.budgetRub)
      const roomsDelta = m2.roomsUsed - m1.roomsUsed

      rows.push({
        region: region || "",
        service,
        period1: m1,
        period2: m2,
        diff: {
          peopleDelta,
          peopleDeltaPct: pct(m1.peopleCount, peopleDelta),
          budgetDeltaRub,
          budgetDeltaPct: pct(m1.budgetRub, budgetDeltaRub),
          roomsDelta,
          roomsDeltaPct: pct(m1.roomsUsed, roomsDelta)
        }
      })
    }
  }

  return rows
}


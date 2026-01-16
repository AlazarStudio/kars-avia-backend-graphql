import { prisma } from "../../prisma.js"

const MS_PER_DAY = 86400000

const toDayStartUtcMs = (date) =>
  Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())

const toInclusiveEndMs = (date) => toDayStartUtcMs(date) + MS_PER_DAY

const mergeIntervals = (intervals) => {
  if (!intervals.length) return []
  intervals.sort((a, b) => a.start - b.start)
  const merged = [intervals[0]]
  for (let i = 1; i < intervals.length; i += 1) {
    const current = intervals[i]
    const last = merged[merged.length - 1]
    if (current.start <= last.end) {
      last.end = Math.max(last.end, current.end)
    } else {
      merged.push(current)
    }
  }
  return merged
}

const countDaysFromIntervals = (intervals) => {
  return intervals.reduce(
    (sum, interval) => sum + (interval.end - interval.start) / MS_PER_DAY,
    0
  )
}

export const getPersonStaySummaries = async ({ startDate, endDate, filters }) => {
  if (!filters?.airlineId) {
    throw new Error("airlineId обязателен для аналитики проживания")
  }
  if (!startDate || !endDate) {
    throw new Error("startDate и endDate обязательны для аналитики проживания")
  }

  const rangeStart = new Date(startDate)
  const rangeEnd = new Date(endDate)
  if (Number.isNaN(rangeStart.getTime()) || Number.isNaN(rangeEnd.getTime())) {
    throw new Error("Некорректный диапазон дат")
  }

  const rangeStartMs = toDayStartUtcMs(rangeStart)
  const rangeEndMs = toInclusiveEndMs(rangeEnd)

  const where = {
    airlineId: filters.airlineId,
    ...(filters.personId ? { personId: filters.personId } : {}),
    arrival: { lte: rangeEnd },
    departure: { gte: rangeStart }
  }

  const requests = await prisma.request.findMany({
    where,
    include: {
      person: { select: { id: true, name: true, position: { select: { name: true } } } },
      sender: { select: { id: true, name: true } },
      posted: { select: { id: true, name: true } },
      hotelChess: { select: { start: true, end: true } }
    },
    orderBy: { arrival: "asc" }
  })

  const byPerson = new Map()

  for (const request of requests) {
    if (!request.personId) continue

    const personKey = request.personId
    const entry =
      byPerson.get(personKey) || {
        personId: request.personId,
        personName: request.person?.name || "",
        personPosition: request.person?.position?.name || "",
        intervals: [],
        createdByMap: new Map(),
        postedByMap: new Map()
      }

    const stayStart = request.hotelChess?.[0]?.start || request.arrival
    const stayEnd = request.hotelChess?.[0]?.end || request.departure

    if (stayStart && stayEnd) {
      const startMs = Math.max(toDayStartUtcMs(stayStart), rangeStartMs)
      const endMs = Math.min(toInclusiveEndMs(stayEnd), rangeEndMs)
      if (endMs > startMs) {
        entry.intervals.push({ start: startMs, end: endMs })
      }
    }

    if (request.sender) {
      entry.createdByMap.set(request.sender.id, request.sender)
    }
    if (request.posted) {
      entry.postedByMap.set(request.posted.id, request.posted)
    }

    byPerson.set(personKey, entry)
  }

  return Array.from(byPerson.values()).map((entry) => {
    const merged = mergeIntervals(entry.intervals)
    return {
      personId: entry.personId,
      personName: entry.personName,
      personPosition: entry.personPosition,
      totalDays: Math.round(countDaysFromIntervals(merged)),
      createdBy: Array.from(entry.createdByMap.values()),
      postedBy: Array.from(entry.postedByMap.values())
    }
  })
}


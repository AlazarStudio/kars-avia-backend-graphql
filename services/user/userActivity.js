const MS_PER_MINUTE = 60000
const MS_PER_DAY = 24 * 60 * 60 * 1000

const toDayKeyUtc = (date) => date.toISOString().slice(0, 10)

const dayStartUtcMs = (ms) => {
  const date = new Date(ms)
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

export const splitDurationByDay = (startAt, endAt) => {
  if (!(startAt instanceof Date) || !(endAt instanceof Date)) return {}
  const startMs = startAt.getTime()
  const endMs = endAt.getTime()
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return {}
  }

  const dayBucketsMs = {}
  let cursor = startMs

  while (cursor < endMs) {
    const dayStart = dayStartUtcMs(cursor)
    const nextDayStart = dayStart + MS_PER_DAY
    const chunkEnd = Math.min(endMs, nextDayStart)
    const dayKey = toDayKeyUtc(new Date(dayStart))
    dayBucketsMs[dayKey] = (dayBucketsMs[dayKey] || 0) + (chunkEnd - cursor)
    cursor = chunkEnd
  }

  const dayBucketsMinutes = {}
  for (const [dayKey, milliseconds] of Object.entries(dayBucketsMs)) {
    dayBucketsMinutes[dayKey] = Math.max(0, Math.round(milliseconds / MS_PER_MINUTE))
  }

  return dayBucketsMinutes
}

export const mergeDailyStats = (currentStats = [], additions = {}) => {
  const merged = new Map()

  for (const item of currentStats) {
    if (!item?.date) continue
    merged.set(item.date, Math.max(0, item.minutes || 0))
  }

  for (const [date, minutes] of Object.entries(additions)) {
    merged.set(date, (merged.get(date) || 0) + Math.max(0, minutes || 0))
  }

  return Array.from(merged.entries())
    .sort(([a], [b]) => (a > b ? 1 : -1))
    .map(([date, minutes]) => ({ date, minutes }))
}

export const buildClosedSessionStats = ({
  sessionStartedAt,
  currentDailyStats = [],
  now = new Date()
}) => {
  if (!(sessionStartedAt instanceof Date)) {
    return {
      addedMinutes: 0,
      nextDailyStats: currentDailyStats || []
    }
  }

  const additions = splitDurationByDay(sessionStartedAt, now)
  const addedMinutes = Object.values(additions).reduce((sum, item) => sum + item, 0)
  const nextDailyStats = mergeDailyStats(currentDailyStats, additions)

  return { addedMinutes, nextDailyStats }
}

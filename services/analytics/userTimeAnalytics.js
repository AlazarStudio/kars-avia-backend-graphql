const toDayKeyUtc = (date) => date.toISOString().slice(0, 10)

const getPeriodRange = ({ period, startDate, endDate }) => {
  const now = new Date()
  const todayUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  )

  if (period === "WEEK") {
    const start = new Date(todayUtc)
    start.setUTCDate(start.getUTCDate() - 6)
    const end = new Date(todayUtc)
    end.setUTCDate(end.getUTCDate() + 1)
    return { start, endExclusive: end }
  }

  if (period === "MONTH") {
    const start = new Date(todayUtc)
    start.setUTCDate(start.getUTCDate() - 29)
    const end = new Date(todayUtc)
    end.setUTCDate(end.getUTCDate() + 1)
    return { start, endExclusive: end }
  }

  if (!startDate || !endDate) {
    throw new Error("Для CUSTOM периода передайте startDate и endDate")
  }

  const start = new Date(startDate)
  const end = new Date(endDate)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error("Некорректный диапазон дат")
  }
  if (start > end) {
    throw new Error("startDate не может быть больше endDate")
  }

  const startUtc = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())
  )
  const endExclusive = new Date(
    Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate() + 1)
  )

  return { start: startUtc, endExclusive }
}

export const buildUserTimeAnalytics = ({
  dailyTimeStats = [],
  totalTimeMinutes = 0,
  period,
  startDate,
  endDate
}) => {
  const { start, endExclusive } = getPeriodRange({ period, startDate, endDate })
  const startKey = toDayKeyUtc(start)
  const endKey = toDayKeyUtc(new Date(endExclusive.getTime() - 1))

  const filtered = dailyTimeStats
    .filter((item) => item?.date && item.date >= startKey && item.date <= endKey)
    .sort((a, b) => (a.date > b.date ? 1 : -1))
    .map((item) => ({
      date: item.date,
      minutes: Math.max(0, item.minutes || 0),
      hours: Number(((item.minutes || 0) / 60).toFixed(2))
    }))

  const periodTotalMinutes = filtered.reduce((sum, day) => sum + day.minutes, 0)
  const periodDaysCount = filtered.length

  return {
    periodStart: start,
    periodEnd: new Date(endExclusive.getTime() - 1),
    totalMinutes: Math.max(0, totalTimeMinutes || 0),
    totalHours: Number(((totalTimeMinutes || 0) / 60).toFixed(2)),
    periodTotalMinutes,
    periodTotalHours: Number((periodTotalMinutes / 60).toFixed(2)),
    averageMinutesPerActiveDay: periodDaysCount
      ? Math.round(periodTotalMinutes / periodDaysCount)
      : 0,
    days: filtered
  }
}

const DAYS_FIRST_END = 10
const DAYS_SECOND_END = 20

const startOfLocalDay = (year, monthIndex, day) =>
  new Date(year, monthIndex, day, 0, 0, 0, 0)

const endOfLocalDay = (year, monthIndex, day) =>
  new Date(year, monthIndex, day, 23, 59, 59, 999)

const lastDayOfMonth = (year, monthIndex) =>
  new Date(year, monthIndex + 1, 0).getDate()

export const getDecadeRange = (date = new Date()) => {
  const year = date.getFullYear()
  const monthIndex = date.getMonth()
  const day = date.getDate()
  const monthLast = lastDayOfMonth(year, monthIndex)

  if (day <= DAYS_FIRST_END) {
    return {
      start: startOfLocalDay(year, monthIndex, 1),
      end: endOfLocalDay(year, monthIndex, DAYS_FIRST_END)
    }
  }
  if (day <= DAYS_SECOND_END) {
    return {
      start: startOfLocalDay(year, monthIndex, DAYS_FIRST_END + 1),
      end: endOfLocalDay(year, monthIndex, DAYS_SECOND_END)
    }
  }
  return {
    start: startOfLocalDay(year, monthIndex, DAYS_SECOND_END + 1),
    end: endOfLocalDay(year, monthIndex, monthLast)
  }
}

export const getPreviousDecadeRange = (date = new Date()) => {
  const current = getDecadeRange(date)
  const dayBefore = new Date(current.start.getTime() - 1)
  return getDecadeRange(dayBefore)
}

export const getArchiveThreshold = (date = new Date()) =>
  getPreviousDecadeRange(date).start

export const isPastArchiveThreshold = (endDate, now = new Date()) => {
  if (!endDate) return false
  return new Date(endDate).getTime() < getArchiveThreshold(now).getTime()
}

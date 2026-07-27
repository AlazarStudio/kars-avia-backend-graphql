/**
 * Сезонные цены RoomKind: резолв цены по ночам проживания.
 * Границы сезона: startDate и endDate включительно (по календарным суткам).
 */

const MS_PER_DAY = 86400000

const toDayUtc = (input) => {
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return null
    return new Date(
      Date.UTC(input.getFullYear(), input.getMonth(), input.getDate())
    )
  }
  const str = String(input || "").trim()
  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]))
  const ru = str.match(/^(\d{2})\.(\d{2})\.(\d{4})/)
  if (ru) return new Date(Date.UTC(+ru[3], +ru[2] - 1, +ru[1]))
  const d = new Date(str)
  if (Number.isNaN(d.getTime())) return null
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
}

const addDaysUtc = (day, n) => new Date(day.getTime() + n * MS_PER_DAY)

/**
 * Ночи проживания: [arrivalDay, departureDay) — классическая hotel-night модель.
 * Если arrival и departure в один день — одна ночь (arrivalDay).
 */
export const listStayNights = (start, end) => {
  const startDay = toDayUtc(start)
  const endDay = toDayUtc(end)
  if (!startDay || !endDay) return []

  if (endDay.getTime() <= startDay.getTime()) {
    return [startDay]
  }

  const nights = []
  for (let d = startDay; d.getTime() < endDay.getTime(); d = addDaysUtc(d, 1)) {
    nights.push(d)
  }
  return nights
}

export const seasonsOverlap = (aStart, aEnd, bStart, bEnd) => {
  const aS = toDayUtc(aStart)
  const aE = toDayUtc(aEnd)
  const bS = toDayUtc(bStart)
  const bE = toDayUtc(bEnd)
  if (!aS || !aE || !bS || !bE) return false
  return aS.getTime() <= bE.getTime() && bS.getTime() <= aE.getTime()
}

export const assertValidSeasonRange = (startDate, endDate) => {
  const start = toDayUtc(startDate)
  const end = toDayUtc(endDate)
  if (!start || !end) {
    throw new Error("Некорректные даты сезона")
  }
  if (start.getTime() > end.getTime()) {
    throw new Error("Дата начала сезона должна быть не позже даты окончания")
  }
  return { start, end }
}

/**
 * @param {Array<{ startDate: Date|string, endDate: Date|string }>} seasons
 * @param {Date|string} startDate
 * @param {Date|string} endDate
 * @param {string} [excludeId]
 */
export const assertNoSeasonOverlap = (
  seasons,
  startDate,
  endDate,
  excludeId = null
) => {
  const { start, end } = assertValidSeasonRange(startDate, endDate)
  for (const season of seasons || []) {
    if (excludeId && String(season.id) === String(excludeId)) continue
    if (seasonsOverlap(start, end, season.startDate, season.endDate)) {
      throw new Error("Сезон пересекается с уже существующим периодом")
    }
  }
}

/**
 * @param {Date|string} nightDate
 * @param {Array<{ startDate: Date|string, endDate: Date|string, price: number, priceForAirline?: number|null }>} seasons
 */
export const findSeasonForNight = (nightDate, seasons = []) => {
  const night = toDayUtc(nightDate)
  if (!night) return null
  const nightTs = night.getTime()

  for (const season of seasons) {
    const s = toDayUtc(season.startDate)
    const e = toDayUtc(season.endDate)
    if (!s || !e) continue
    if (nightTs >= s.getTime() && nightTs <= e.getTime()) {
      return season
    }
  }
  return null
}

/**
 * @param {"price"|"priceForAirline"} field
 */
export const resolvePriceForNight = (
  roomKind,
  seasons,
  nightDate,
  field = "price"
) => {
  const season = findSeasonForNight(nightDate, seasons)
  if (season) {
    const seasonal = Number(season[field])
    if (Number.isFinite(seasonal) && seasonal >= 0) return seasonal
    // fallback внутри сезона, если priceForAirline не задан
    if (field === "priceForAirline") {
      const baseSeason = Number(season.price)
      if (Number.isFinite(baseSeason)) return baseSeason
    }
  }

  const base = Number(roomKind?.[field])
  if (Number.isFinite(base) && base >= 0) return base

  if (field === "priceForAirline") {
    const fallback = Number(roomKind?.price)
    return Number.isFinite(fallback) ? fallback : 0
  }
  return 0
}

/**
 * Сумма и средневзвешенная цена/сутки по ночам в [start, end).
 * @returns {{ nights: number, livingCost: number, pricePerDay: number, nightPrices: number[] }}
 */
export const calculateSeasonalLivingForStay = (
  roomKind,
  seasons,
  start,
  end,
  field = "price"
) => {
  const nights = listStayNights(start, end)
  if (!nights.length) {
    return { nights: 0, livingCost: 0, pricePerDay: 0, nightPrices: [] }
  }

  const nightPrices = nights.map((night) =>
    resolvePriceForNight(roomKind, seasons, night, field)
  )
  const livingCost = nightPrices.reduce((sum, p) => sum + p, 0)
  const pricePerDay = livingCost / nights.length

  return {
    nights: nights.length,
    livingCost,
    pricePerDay,
    nightPrices
  }
}

/**
 * Цена/сутки для окна отчёта: средневзвешенная по ночам,
 * попадающим в пересечение проживания и [filterStart, filterEnd].
 */
export const resolveWeightedPricePerDay = (
  roomKind,
  seasons,
  stayStart,
  stayEnd,
  filterStart = null,
  filterEnd = null,
  field = "price"
) => {
  const stayNights = listStayNights(stayStart, stayEnd)
  if (!stayNights.length) return 0

  let nights = stayNights
  if (filterStart || filterEnd) {
    const fStart = filterStart ? toDayUtc(filterStart) : null
    const fEnd = filterEnd ? toDayUtc(filterEnd) : null
    nights = stayNights.filter((night) => {
      if (fStart && night.getTime() < fStart.getTime()) return false
      if (fEnd && night.getTime() > fEnd.getTime()) return false
      return true
    })
  }

  if (!nights.length) {
    // окно отчёта не пересекло ночи — fallback на весь stay
    nights = stayNights
  }

  const sum = nights.reduce(
    (acc, night) =>
      acc + resolvePriceForNight(roomKind, seasons, night, field),
    0
  )
  return sum / nights.length
}

export const isArchivedRequestForPricing = (request) => {
  if (!request) return false
  if (request.archive === true) return true
  const status = String(request.status || "").toLowerCase()
  return status === "archived" || status === "archiving"
}

/**
 * Базовая цена отеля без сезонов (как раньше), для studio/apartment и fallback.
 */
export const getBaseHotelPricePerDay = (request) => {
  const roomCategory = request?.roomCategory
  const room = request?.hotelChess?.[0]?.room
  const roomKind = room?.roomKind

  if (roomCategory === "studio" || roomCategory === "apartment") {
    return Number(room?.price) || 0
  }

  return Number(roomKind?.price) || 0
}

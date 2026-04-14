const TECH_POS = ["Техник", "Инженер"]
const NOT_TECH_POS = [
  "КАЭ",
  "КВС",
  "ВП",
  "СБ",
  "ИПБ",
  "БП",
  "СА",
  "Директор",
  "Заместитель директора",
  "Нач. СБП",
  "Нач. ЛМО",
  "ЛД"
]

export const applyCreateFilters = (filter) => {
  const {
    startDate,
    endDate,
    archived,
    personId,
    hotelId,
    airlineId,
    airportId,
    positionId,
    region
  } = filter
  const where = {}

  if (startDate || endDate) {
    where.OR = [
      {
        arrival: {
          gte: new Date(startDate),
          lte: new Date(endDate)
        }
      },
      {
        departure: {
          gte: new Date(startDate),
          lte: new Date(endDate)
        }
      },
      {
        AND: [
          { arrival: { lte: new Date(startDate) } },
          { departure: { gte: new Date(endDate) } }
        ]
      }
    ]
  }

  if (archived !== undefined) where.archived = archived
  if (personId) where.personId = personId
  if (hotelId) where.hotelId = hotelId
  if (airlineId) where.airlineId = airlineId
  if (airportId) where.airportId = airportId
  if (positionId) {
    where.person = {
      positionId: positionId
    }
  }
  if (region && region.trim()) {
    const AND = []
    const s = region.trim()
    AND.push({
      OR: [
        { contractNumber: { contains: s, mode: "insensitive" } },
        { region: { contains: s, mode: "insensitive" } },
        { applicationType: { contains: s, mode: "insensitive" } },
        { notes: { contains: s, mode: "insensitive" } },
        { airline: { name: { contains: s, mode: "insensitive" } } },
        { company: { name: { contains: s, mode: "insensitive" } } }
      ]
    })
    where.AND = AND
  }

  return where
}

export const applyFilters = (filter) => {
  if (filter == null || filter == undefined) {
    return
  }
  const {
    startDate,
    endDate,
    archived,
    personId,
    hotelId,
    airlineId,
    positionId,
    region
  } = filter

  const where = {}

  if (startDate)
    where.startDate = { gte: new Date(startDate), lte: new Date(endDate) }
  if (endDate)
    where.endDate = { gte: new Date(startDate), lte: new Date(endDate) }
  if (archived !== undefined) where.archived = archived
  if (personId) where.personId = personId
  if (hotelId) where.hotelId = hotelId
  if (airlineId) where.airlineId = airlineId
  if (positionId) where.positionId = positionId

  if (region) {
    where.airport = {
      isNot: null,
      city: region
    }
  }

  return where
}

export const buildPositionWhere = (position) => {
  const p = String(position || "all").toLowerCase()
  if (p === "squadron") {
    return { person: { position: { name: { notIn: TECH_POS } } } }
  }
  if (p === "technician") {
    return { person: { position: { name: { notIn: NOT_TECH_POS } } } }
  }
  return {}
}

export const calculateLivingCost = (request, type, days) => {
  const roomCategory = request.roomCategory
  let pricePerDay = 0

  if (type === "airline") {
    pricePerDay = getAirlinePriceForCategory(request, roomCategory)
  } else if (type === "hotel") {
    const hotelPriceMapping = {
      studio: request.hotelChess[0]?.room?.price || 1,
      apartment: request.hotelChess[0]?.room?.price || 1,
      luxe: request.hotelChess[0]?.room?.roomKind?.price || 1,
      comfort: request.hotelChess[0]?.room?.roomKind?.price || 1,
      improvedComfort: request.hotelChess[0]?.room?.roomKind?.price || 1,
      onePlace: request.hotelChess[0]?.room?.roomKind?.price || 1,
      twoPlace: request.hotelChess[0]?.room?.roomKind?.price || 1,
      threePlace: request.hotelChess[0]?.room?.roomKind?.price || 1,
      fourPlace: request.hotelChess[0]?.room?.roomKind?.price || 1,
      fivePlace: request.hotelChess[0]?.room?.roomKind?.price || 1,
      sixPlace: request.hotelChess[0]?.room?.roomKind?.price || 1,
      sevenPlace: request.hotelChess[0]?.room?.roomKind?.price || 1,
      eightPlace: request.hotelChess[0]?.room?.roomKind?.price || 1,
      ninePlace: request.hotelChess[0]?.room?.roomKind?.price || 1,
      tenPlace: request.hotelChess[0]?.room?.roomKind?.price || 1
    }
    pricePerDay = hotelPriceMapping[roomCategory] || 0
  }

  return days > 0 ? days * pricePerDay : 0
}

export const getAirlinePriceForCategory = (request, category) => {
  const airportId = request.airport?.id

  const airlinePrices = request.airline?.prices
  for (const contract of airlinePrices) {
    if (contract.airports && contract.airports.length > 0) {
      const match = contract.airports.find(
        (item) => item.airportId && item.airportId === airportId
      )
      if (match) {
        switch (category) {
          case "studio":
            return contract.prices?.priceStudio || 0
          case "apartment":
            return contract.prices?.priceApartment || 0
          case "luxe":
            return contract.prices?.priceLuxe || 0
          case "comfort":
            return contract.prices?.priceComfort || 0
          case "improvedComfort":
            return contract.prices?.priceImprovedComfort || 0
          case "onePlace":
            return contract.prices?.priceOneCategory || 0
          case "twoPlace":
            return contract.prices?.priceTwoCategory || 0
          case "threePlace":
            return contract.prices?.priceThreeCategory || 0
          case "fourPlace":
            return contract.prices?.priceFourCategory || 0
          case "fivePlace":
            return contract.prices?.priceFiveCategory || 0
          case "sixPlace":
            return contract.prices?.priceSixCategory || 0
          case "sevenPlace":
            return contract.prices?.priceSevenCategory || 0
          case "eightPlace":
            return contract.prices?.priceEightCategory || 0
          case "ninePlace":
            return contract.prices?.priceNineCategory || 0
          case "tenPlace":
            return contract.prices?.priceTenCategory || 0
          default:
            return 0
        }
      }
    }
  }
  return 0
}

export const getAirlineMealPrice = (request) => {
  const airportId = request.airport?.id

  const airlinePrices = request.airline?.prices
  for (const contract of airlinePrices) {
    if (contract.airports && contract.airports.length > 0) {
      const match = contract.airports.find(
        (item) => item.airportId && item.airportId === airportId
      )
      if (match) {
        return contract.mealPrice
      }
    }
  }
  return 0
}

export const calculateMealCostForReportDays = (
  request,
  reportType,
  _effectiveDays,
  _fullDays,
  mealPlan,
  startDate,
  endDate
) => {
  const start = toUTCDate(startDate)
  const end = toUTCDate(endDate)

  let breakfastCount = 0
  let lunchCount = 0
  let dinnerCount = 0

  mealPlan.dailyMeals.forEach((mealDay) => {
    const mealDate = toUTCDate(mealDay.date)

    if (mealDate >= start && mealDate <= end) {
      breakfastCount += mealDay.breakfast ?? 0
      lunchCount += mealDay.lunch ?? 0
      dinnerCount += mealDay.dinner ?? 0
    }
  })

  const isNoMealCategory = ["apartment", "studio"].includes(
    request.roomCategory
  )
  if (isNoMealCategory) {
    breakfastCount = 0
    lunchCount = 0
    dinnerCount = 0
  }

  let mealPrices
  if (reportType === "airline") {
    mealPrices = getAirlineMealPrice(request)
  } else if (reportType === "hotel") {
    mealPrices = request.hotel?.mealPrice
  }

  const breakfastCost = breakfastCount * (mealPrices?.breakfast || 0)
  const lunchCost = lunchCount * (mealPrices?.lunch || 0)
  const dinnerCost = dinnerCount * (mealPrices?.dinner || 0)
  const totalMealCost = breakfastCost + lunchCost + dinnerCost

  return { totalMealCost, breakfastCount, lunchCount, dinnerCount }
}

export const parseAsLocal = (input) => {
  let year, monthIndex, day, hour, minute, second

  if (typeof input === "string") {
    const [y, m, d, h, min, s] = input
      .match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/)
      .slice(1)
      .map(Number)
    year = y
    monthIndex = m - 1
    day = d
    hour = h
    minute = min
    second = s
  } else if (input instanceof Date) {
    year = input.getUTCFullYear()
    monthIndex = input.getUTCMonth()
    day = input.getUTCDate()
    hour = input.getUTCHours()
    minute = input.getUTCMinutes()
    second = input.getUTCSeconds()
  } else {
    throw new TypeError("Ожидается строка ISO или Date")
  }

  return new Date(year, monthIndex, day, hour, minute, second)
}

export const formatLocalDate = (date) => {
  const dd = String(date.getDate()).padStart(2, "0")
  const mm = String(date.getMonth() + 1).padStart(2, "0")
  const yyyy = date.getFullYear()
  const hh = String(date.getHours()).padStart(2, "0")
  const min = String(date.getMinutes()).padStart(2, "0")
  const ss = String(date.getSeconds()).padStart(2, "0")
  return `${dd}.${mm}.${yyyy} ${hh}:${min}:${ss}`
}

export const formatDateToISO = (dateInput) => {
  const date = new Date(dateInput)

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")

  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")
  const seconds = String(date.getSeconds()).padStart(2, "0")

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`
}

export const aggregateRequestReports = (
  requests,
  reportType,
  filterStart,
  filterEnd
) => {
  const filtered = requests.filter((r) => {
    const pos = r.person?.position?.name
    return pos !== null
  })

  filtered.sort((a, b) => {
    const hotelA = a.hotel?.name || ""
    const hotelB = b.hotel?.name || ""
    const hotelCmp = hotelA.localeCompare(hotelB, "ru")
    if (hotelCmp !== 0) return hotelCmp

    const catOrder = [
      "studio",
      "apartment",
      "luxe",
      "comfort",
      "improvedComfort",
      "onePlace",
      "twoPlace",
      "threePlace",
      "fourPlace",
      "fivePlace",
      "sixPlace",
      "sevenPlace",
      "eightPlace",
      "ninePlace",
      "tenPlace"
    ]
    const catA = catOrder.indexOf(a.roomCategory)
    const catB = catOrder.indexOf(b.roomCategory)
    if (catA !== catB) return catA - catB

    const roomNameA = a.roomName || ""
    const roomNameB = b.roomName || ""

    if (roomNameA !== roomNameB) return roomNameA.localeCompare(roomNameB, "ru")

    const roomIdA = a.roomId || ""
    const roomIdB = b.roomId || ""

    if (roomIdA != roomIdB) return roomIdA.localeCompare(roomIdB, "ru")

    const nameA = a.person?.name || ""
    const nameB = b.person?.name || ""
    return nameA.localeCompare(nameB, "ru")
  })

  return filtered.map((request, index) => {
    const hotelChess = request.hotelChess?.[0] || {}
    const rawIn = hotelChess.start
      ? parseAsLocal(hotelChess.start)
      : parseAsLocal(request.arrival)
    const rawOut = hotelChess.end
      ? parseAsLocal(hotelChess.end)
      : parseAsLocal(request.departure)

    const effectiveArrival = rawIn < filterStart ? filterStart : rawIn
    const effectiveDeparture = rawOut > filterEnd ? filterEnd : rawOut

    const categoryMapping = {
      studio: "Студия",
      apartment: "Апартаменты",
      luxe: "Люкс",
      comfort: "Комфорт",
      improvedComfort: "Улучшенный комфорт",
      onePlace: "Одноместный",
      twoPlace: "Двухместный",
      threePlace: "Трёхместный",
      fourPlace: "Четырёхместный",
      fivePlace: "Пятиместный",
      sixPlace: "Шестиместный",
      sevenPlace: "Семиместный",
      eightPlace: "Восьмиместный",
      ninePlace: "Девятиместный",
      tenPlace: "Десятиместный"
    }

    const fullDays = calculateTotalDays(effectiveArrival, effectiveDeparture)
    const effectiveDays = calculateEffectiveCostDaysWithPartial(
      formatDateToISO(effectiveArrival),
      formatDateToISO(effectiveDeparture),
      formatDateToISO(filterStart),
      formatDateToISO(filterEnd)
    )

    const pricePerDay = calculateLivingCost(request, reportType, 1)
    const totalLivingCost = effectiveDays > 0 ? pricePerDay * effectiveDays : 0

    const { totalMealCost, breakfastCount, lunchCount, dinnerCount } =
      calculateMealCostForReportDays(
        request,
        reportType,
        effectiveDays,
        fullDays,
        request.mealPlan || {},
        effectiveArrival,
        effectiveDeparture
      )

    if (!totalLivingCost && !totalMealCost) return null

    return {
      index: index + 1,
      id: request.id,
      hotelName: request.hotel?.name || "Не указано",
      arrival: formatLocalDate(effectiveArrival),
      departure: formatLocalDate(effectiveDeparture),
      totalDays: effectiveDays,
      category: categoryMapping[request.roomCategory] || request.roomCategory,
      personName: request.person?.name || "Не указано",
      personPosition: request.person?.position?.name || "Не указано",
      roomName: hotelChess.room?.name || "",
      roomId: hotelChess.room?.id || "",
      breakfastCount,
      lunchCount,
      dinnerCount,
      totalMealCost,
      totalLivingCost,
      pricePerDay,
      totalDebt: totalLivingCost + totalMealCost
    }
  }).filter(Boolean)
}

export const calculateTotalDays = (start, end) => {
  if (!start || !end) return 0
  const differenceInMilliseconds = new Date(end) - new Date(start)
  return Math.ceil(differenceInMilliseconds / (1000 * 60 * 60 * 24))
}

export const calculateEffectiveCostDaysWithPartial = (
  arrivalStr,
  departureStr,
  _reportStart,
  _reportEnd
) => {
  const parseDateTime = (str) => {
    if (!str || typeof str !== "string") return null
    const s = str.trim()

    const iso = s.match(
      /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})?$/
    )
    if (iso) {
      const [, yyyy, MM, dd, hh, mm, ss = "0"] = iso
      return new Date(+yyyy, +MM - 1, +dd, +hh, +mm, +ss)
    }

    const local = s.match(
      /^(\d{2})\.(\d{2})\.(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
    )
    if (local) {
      const [, dd, MM, yyyy, hh = "0", mm = "0", ss = "0"] = local
      return new Date(+yyyy, +MM - 1, +dd, +hh, +mm, +ss)
    }

    const d = new Date(s)
    return isNaN(d) ? null : d
  }

  const arrival = parseDateTime(arrivalStr)
  const departure = parseDateTime(departureStr)

  if (!arrival || !departure || isNaN(arrival) || isNaN(departure)) return 0

  const arrivalYMD = new Date(
    arrival.getFullYear(),
    arrival.getMonth(),
    arrival.getDate()
  )
  const departureYMD = new Date(
    departure.getFullYear(),
    departure.getMonth(),
    departure.getDate()
  )
  const MS_PER_DAY = 1000 * 60 * 60 * 24
  const baseDays = Math.max(
    0,
    Math.floor((departureYMD - arrivalYMD) / MS_PER_DAY)
  )

  let arrivalAdjust = 0
  const arrivalMinutes = arrival.getHours() * 60 + arrival.getMinutes()

  if (arrival.getHours() === 0 && arrival.getMinutes() === 10) {
    arrivalAdjust = 0
  } else if (arrivalMinutes < 6 * 60) {
    arrivalAdjust = 1
  } else if (arrivalMinutes < 14 * 60) {
    arrivalAdjust = 0.5
  }

  let departureAdjust = 0
  const departureMinutes = departure.getHours() * 60 + departure.getMinutes()

  if (departure.getHours() === 23 && departure.getMinutes() === 50) {
    departureAdjust = 1
  } else if (departureMinutes >= 18 * 60) {
    departureAdjust = 1
  } else if (departureMinutes > 12 * 60) {
    departureAdjust = 0.5
  }

  const total = baseDays + arrivalAdjust + departureAdjust
  return total < 0 ? 0 : total
}

const MS_PER_DAY = 86400000
export const toUTCDate = (s) => {
  if (s instanceof Date)
    return new Date(Date.UTC(s.getFullYear(), s.getMonth(), s.getDate()))
  const str = String(s || "").trim()
  const m = str.match(/^(\d{2})\.(\d{2})\.(\d{4})/)
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]))
  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]))
  return new Date(NaN)
}

export const fmtYMD = (d) => {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, "0")
  const da = String(d.getUTCDate()).padStart(2, "0")
  return `${y}-${m}-${da}`
}

export const addDaysUTC = (d, n) => new Date(d.getTime() + n * MS_PER_DAY)
export const eachDayInclusive = (startYMD, endYMD, cb) => {
  let d = toUTCDate(startYMD),
    stop = toUTCDate(endYMD)
  while (d.getTime() <= stop.getTime()) {
    cb(fmtYMD(d))
    d = addDaysUTC(d, 1)
  }
}

export const fmtRu = (ymd) => {
  const [y, m, d] = ymd.split("-")
  return `${d}.${m}.${y}`
}

export const parseNum = (v) => {
  if (v == null) return NaN
  if (typeof v === "number") return v
  const n = parseFloat(
    String(v)
      .replace(/[^\d.,\-]/g, "")
      .replace(",", ".")
  )
  return Number.isFinite(n) ? n : NaN
}

// Эффективные сутки для одного сегмента шкалы.
// Partial-day корректировки применяются ТОЛЬКО на реальный заезд/выезд кластера
// (isClusterArrival / isClusterDeparture), чтобы Σ стоимостей = стоимость кластера.
const calcSegmentDays = (t1, t2, isClusterArrival, isClusterDeparture) => {
  const MS_PER_DAY = 86400000
  const d1 = new Date(t1.getFullYear(), t1.getMonth(), t1.getDate())
  const d2 = new Date(t2.getFullYear(), t2.getMonth(), t2.getDate())
  const baseDays = Math.max(0, Math.floor((d2 - d1) / MS_PER_DAY))

  let arrivalAdjust = 0
  if (isClusterArrival) {
    const m = t1.getHours() * 60 + t1.getMinutes()
    if (t1.getHours() === 0 && t1.getMinutes() === 10) arrivalAdjust = 0
    else if (m < 6 * 60) arrivalAdjust = 1
    else if (m < 14 * 60) arrivalAdjust = 0.5
  }

  let departureAdjust = 0
  if (isClusterDeparture) {
    const m = t2.getHours() * 60 + t2.getMinutes()
    if (t2.getHours() === 23 && t2.getMinutes() === 50) departureAdjust = 1
    else if (m >= 18 * 60) departureAdjust = 1
    else if (m > 12 * 60) departureAdjust = 0.5
  }

  return baseDays + arrivalAdjust + departureAdjust
}

// Разбивает гостей одного номера на кластеры по реальному пересечению периодов.
// Гости, жившие в разное время (без пересечения), попадают в разные кластеры
// и рассчитываются независимо.
const findOverlapClusters = (guests) => {
  if (!guests.length) return []
  const assigned = new Set()
  const clusters = []

  for (let i = 0; i < guests.length; i++) {
    if (assigned.has(i)) continue
    const cluster = [i]
    assigned.add(i)

    let changed = true
    while (changed) {
      changed = false
      for (let j = 0; j < guests.length; j++) {
        if (assigned.has(j)) continue
        const cand = guests[j]
        const overlaps = cluster.some((idx) => {
          const g = guests[idx]
          // строгое пересечение: один выехал — другой ещё не заехал → не пересекаются
          return g.arrivalTS < cand.departureTS && g.departureTS > cand.arrivalTS
        })
        if (overlaps) {
          cluster.push(j)
          assigned.add(j)
          changed = true
        }
      }
    }

    clusters.push(cluster.map((idx) => guests[idx]))
  }

  return clusters
}

export const buildAllocation = (data) => {
  if (!Array.isArray(data) || !data.length) return []

  const parseLocalDT = (s) => {
    if (!s) return null
    const m = String(s).match(
      /^(\d{2})\.(\d{2})\.(\d{4})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/
    )
    if (!m) return null
    const [, dd, MM, yyyy, hh, mm, ss = "0"] = m
    return new Date(+yyyy, +MM - 1, +dd, +hh, +mm, +ss)
  }

  const formatLocal = (d) => {
    const pad = (n) => String(n).padStart(2, "0")
    return `${pad(d.getDate())}.${pad(
      d.getMonth() + 1
    )}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`
  }

  const bookings = data.map((r) => ({
    ...r,
    arrivalTS: parseLocalDT(r.arrival),
    departureTS: parseLocalDT(r.departure)
  }))

  // Гости без roomId не группируются вместе — каждый получает уникальный ключ
  const rooms = new Map()
  let soloIndex = 0
  for (const b of bookings) {
    const key = b.roomId ? b.roomId : `__solo_${soloIndex++}`
    if (!rooms.has(key)) rooms.set(key, [])
    rooms.get(key).push(b)
  }

  // Карта livingCost для каждого гостя (все номера, все кластеры)
  const allLivingCosts = new Map()

  for (const [, guests] of rooms.entries()) {
    const valid = guests.filter(
      (g) => g.arrivalTS && g.departureTS && g.arrivalTS < g.departureTS
    )

    // Разбиваем на кластеры: только реально пересекающиеся гости считаются вместе
    const clusters = findOverlapClusters(valid)

    for (const cluster of clusters) {
      const pricePerDay = cluster.find((g) => g.pricePerDay > 0)?.pricePerDay || 0

      const clusterArrival = new Date(Math.min(...cluster.map((g) => +g.arrivalTS)))
      const clusterDeparture = new Date(Math.max(...cluster.map((g) => +g.departureTS)))

      // Временная шкала событий кластера
      const eventSet = new Set()
      for (const g of cluster) {
        eventSet.add(+g.arrivalTS)
        eventSet.add(+g.departureTS)
      }
      const timeline = [...eventSet].sort((a, b) => a - b)

      // Накапливаем стоимость посегментно
      const guestCosts = new Map(cluster.map((g) => [g, 0]))

      for (let i = 0; i < timeline.length - 1; i++) {
        const t1 = new Date(timeline[i])
        const t2 = new Date(timeline[i + 1])

        const present = cluster.filter(
          (g) => +g.arrivalTS <= +t1 && +g.departureTS >= +t2
        )
        if (!present.length) continue

        const days = calcSegmentDays(
          t1, t2,
          +t1 === +clusterArrival,
          +t2 === +clusterDeparture
        )
        if (days <= 0) continue

        const costPerPerson = (pricePerDay * days) / present.length
        for (const g of present) guestCosts.set(g, guestCosts.get(g) + costPerPerson)
      }

      // Округляем + корректируем копеечное расхождение у гостя с наибольшей долей
      const totalClusterCost =
        pricePerDay * calcSegmentDays(clusterArrival, clusterDeparture, true, true)

      const roundedCosts = new Map()
      for (const [g, cost] of guestCosts) roundedCosts.set(g, Math.round(cost))

      const computedSum = [...roundedCosts.values()].reduce((s, c) => s + c, 0)
      const diff = Math.round(totalClusterCost) - computedSum
      if (diff !== 0) {
        const topGuest = [...guestCosts.entries()].reduce((a, b) =>
          a[1] >= b[1] ? a : b
        )[0]
        roundedCosts.set(topGuest, (roundedCosts.get(topGuest) || 0) + diff)
      }

      for (const [g, cost] of roundedCosts) allLivingCosts.set(g, cost)
    }
  }

  // Формируем строки отчёта
  const out = []
  let index = 1

  for (const [, guests] of rooms.entries()) {
    const valid = guests.filter(
      (g) => g.arrivalTS && g.departureTS && g.arrivalTS < g.departureTS
    )

    const buildShareNote = (guest) => {
      if (!guest.arrivalTS || !guest.departureTS) return ""
      // Ищем реально пересекающихся соседей только из того же кластера
      const others = valid
        .filter(
          (g) =>
            g !== guest &&
            g.arrivalTS < guest.departureTS &&
            g.departureTS > guest.arrivalTS
        )
        .sort((a, b) => a.arrivalTS - b.arrivalTS)

      const segments = []
      for (const other of others) {
        const start = new Date(Math.max(+guest.arrivalTS, +other.arrivalTS))
        const end = new Date(Math.min(+guest.departureTS, +other.departureTS))
        if (start < end) {
          segments.push(
            `с ${formatLocal(start)} по ${formatLocal(end)} жил с ${other.personName}`
          )
        }
      }
      return segments.length
        ? segments.join(", ")
        : `с ${formatLocal(guest.arrivalTS)} по ${formatLocal(guest.departureTS)} жил один`
    }

    for (const g of guests) {
      const livingCost = allLivingCosts.get(g) ?? 0
      if (!livingCost && !g.totalMealCost) continue

      out.push({
        index: index++,
        arrival: g.arrival,
        departure: g.departure,
        totalDays: g.totalDays,
        category: g.category,
        personName: g.personName,
        roomName: g.roomName,
        roomId: g.roomId,
        shareNote: buildShareNote(g),
        personPosition: g.personPosition,
        breakfastCount: g.breakfastCount,
        lunchCount: g.lunchCount,
        dinnerCount: g.dinnerCount,
        totalMealCost: g.totalMealCost,
        totalLivingCost: livingCost,
        totalDebt: livingCost + g.totalMealCost,
        hotelName: g.hotelName
      })
    }
  }

  return out
}

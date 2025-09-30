import { prisma } from "../../prisma.js"
import { generateExcelAvia } from "../../exports/exporter.js"
import path from "path"
import fs from "fs"
import {
  adminMiddleware,
  airlineAdminMiddleware,
  hotelAdminMiddleware
} from "../../middlewares/authMiddleware.js"
import { pubsub, REPORT_CREATED } from "../../exports/pubsub.js"
import { deleteFiles } from "../../exports/uploadFiles.js"

const reportResolver = {
  Query: {
    getAirlineReport: async (_, { filter }, context) => {
      const { user } = context
      await airlineAdminMiddleware(context)

      if (filter && filter.hotelId) {
        throw new Error("Cannot fetch hotel reports in getAirlineReport")
      }

      const separator = user.airlineId ? "airline" : "dispatcher"

      const reports = await prisma.savedReport.findMany({
        where: {
          separator,
          ...applyFilters(filter),
          airlineId: { not: null },
          ...(filter && filter.airlineId
            ? { airlineId: filter.airlineId }
            : user.role === "SUPERADMIN" || user.role === "DISPATCHERADMIN"
            ? {}
            : { airlineId: user.airlineId })
        },
        include: { airline: true },
        orderBy: { createdAt: "desc" }
      })

      const uniqueReports = []
      const seenIds = new Set()
      reports.forEach((report) => {
        if (!seenIds.has(report.id)) {
          seenIds.add(report.id)
          uniqueReports.push(report)
        }
      })

      return [
        {
          airlineId:
            (filter && filter.airlineId) ||
            (user.role === "SUPERADMIN" || user.role === "DISPATCHERADMIN"
              ? null
              : user.airlineId),
          reports: uniqueReports.map((report) => ({
            id: report.id,
            name: report.name,
            url: report.url,
            startDate: report.startDate,
            endDate: report.endDate,
            createdAt: report.createdAt,
            hotelId: report.hotelId,
            airlineId: report.airlineId,
            airline: report.airline
          }))
        }
      ]
    },

    getHotelReport: async (_, { filter }, context) => {
      const { user } = context
      hotelAdminMiddleware(context)

      const separator = user.hotelId ? "hotel" : "dispatcher"

      const reports = await prisma.savedReport.findMany({
        where: {
          separator,
          ...applyFilters(filter),
          hotelId: { not: null },
          ...(filter.hotelId
            ? { hotelId: filter.hotelId }
            : user.role === "SUPERADMIN" || user.role === "DISPATCHERADMIN"
            ? {}
            : { hotelId: user.hotelId })
        },
        include: { hotel: true },
        orderBy: { createdAt: "desc" }
      })

      const uniqueReports = []
      const seenIds = new Set()
      reports.forEach((report) => {
        if (!seenIds.has(report.id)) {
          seenIds.add(report.id)
          uniqueReports.push(report)
        }
      })

      return [
        {
          hotelId:
            filter.hotelId ||
            (user.role === "SUPERADMIN" || user.role === "DISPATCHERADMIN"
              ? null
              : user.hotelId),
          reports: uniqueReports.map((report) => ({
            id: report.id,
            name: report.name,
            url: report.url,
            startDate: report.startDate,
            endDate: report.endDate,
            createdAt: report.createdAt,
            hotelId: report.hotelId,
            airlineId: report.airlineId,
            hotel: report.hotel
          }))
        }
      ]
    }
  },

  Mutation: {
    createAirlineReport: async (_, { input }, context) => {
      const { user } = context
      await airlineAdminMiddleware(context)
      const { filter, format } = input
      const separator = user.airlineId ? "airline" : "dispatcher"

      if (!user) {
        throw new Error("Access denied")
      }

      const filterStart = new Date(filter.startDate)
      const filterEnd = new Date(filter.endDate)
      const startDateStr = filterStart.toISOString().slice(0, 10)
      const endDateStr = filterEnd.toISOString().slice(0, 10)

      // console.log("\n filterStart" + filterStart, "\n filterEnd" + filterEnd)

      let reportData
      if (filter.passengersReport) {
        return (error = new Error(" \n passenger report not implemented! "))
      } else {
        const requests = await prisma.request.findMany({
          where: {
            ...applyCreateFilters(filter),
            status: {
              in: [
                "done",
                "transferred",
                "extended",
                "archiving",
                "archived",
                "reduced"
              ]
            },
            person: {
              position: {
                name: {
                  notIn: ["Техник", "Инженер"]
                }
              }
            }
          },
          include: {
            person: { include: { position: true } },
            hotelChess: {
              include: {
                room: true
              }
            },
            hotel: true,
            airline: { include: { prices: { include: { airports: true } } } },
            mealPlan: true,
            airport: true
          },
          orderBy: { arrival: "asc" }
        })

        // console.log("\n requests: \n " + JSON.stringify(requests))

        reportData = aggregateRequestReports(
          requests,
          "airline",
          filterStart,
          filterEnd
        )
      }

      const newRows = distributeNightsAndRoommates(reportData, {})

      // console.log("\n reportData: \n " + newRows)
      // console.log("\n reportData stringify: \n " + JSON.stringify(newRows))

      const reportName = filter.passengersReport
        ? `passenger_report_${startDateStr}-${endDateStr}_${Date.now()}.${format}`
        : `airline_report_${startDateStr}-${endDateStr}_${Date.now()}.${format}`
      const reportPath = path.resolve(`./reports/${reportName}`)
      fs.mkdirSync(path.dirname(reportPath), { recursive: true })

      if (format === "pdf") {
        throw new Error("PDF формат не реализован в данном примере")
      } else if (format === "xlsx") {
        await generateExcelAvia(reportData, reportPath)
      } else {
        throw new Error("Unsupported report format")
      }

      const reportRecord = {
        name: reportName,
        url: `/reports/${reportName}`,
        startDate: new Date(filter.startDate),
        endDate: new Date(filter.endDate),
        createdAt: new Date(),
        airlineId:
          user.role === "AIRLINEADMIN" ? user.airlineId : filter.airlineId,
        separator: separator
      }

      if (!reportRecord.airlineId) {
        throw new Error("Airline ID is required for this report")
      }

      const savedReport = await prisma.savedReport.create({
        data: reportRecord
      })
      pubsub.publish(REPORT_CREATED, { reportCreated: savedReport })
      return savedReport
    },

    deleteReport: async (_, { id }, context) => {
      const { user } = context
      const report = await prisma.savedReport.findUnique({
        where: { id },
        include: { airline: true, hotel: true }
      })
      if (!report) {
        throw new Error("Report not found")
      }
      if (report.separator === "dispatcher") {
        await adminMiddleware(context)
      }
      if (report.separator === "airline") {
        await airlineAdminMiddleware(context)
      }
      if (report.separator === "hotel") {
        hotelAdminMiddleware(context)
      }
      if (report.url) {
        await deleteFiles(report.url)
      }
      await prisma.savedReport.delete({ where: { id } })
      pubsub.publish(REPORT_CREATED, { reportCreated: report })
      return report
    }
  },

  Subscription: {
    reportCreated: {
      subscribe: () => pubsub.asyncIterator([REPORT_CREATED])
    }
  }
}

// Функции для формирования фильтров ---------------- ↓↓↓↓

const applyCreateFilters = (filter) => {
  const {
    startDate,
    endDate,
    archived,
    personId,
    hotelId,
    airlineId,
    airportId,
    positionId,
    //position Id`s,
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
  // position Id`s []
  if (positionId) {
    where.person = {
      positionId: positionId
    }
  }
  if (region) {
    where.airport = {
      isNot: null,
      city: region
    }
  }

  return where
}

const applyFilters = (filter) => {
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

// Функции для формирования фильтров ---------------- ↑↑↑↑

// Функции для подсчёта цен ---------------- ↓↓↓↓

const calculateLivingCost = (request, type, days) => {
  const roomCategory = request.roomCategory
  let pricePerDay = 0

  if (type === "airline") {
    pricePerDay = getAirlinePriceForCategory(request, roomCategory)
  } else if (type === "hotel") {
    const hotelPriceMapping = {
      studio: request.hotelChess[0]?.room?.price || 1,
      apartment: request.hotelChess[0]?.room?.price || 1,
      luxe: request.hotelChess[0]?.room?.roomKind?.price || 1,
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

const getAirlinePriceForCategory = (request, category) => {
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

const getAirlineMealPrice = (request) => {
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

const calculateMealCostForReportDays = (
  request,
  reportType,
  effectiveDays,
  fullDays,
  mealPlan,
  startDate,
  endDate
) => {
  // 1. Преобразуем startDate и endDate в Date объекты
  const start = new Date(startDate)
  const end = new Date(endDate)

  // 2. Инициализация счётчиков пищи
  let breakfastCount = 0
  let lunchCount = 0
  let dinnerCount = 0

  // 3. Проходим по каждому дню в dailyMeals
  mealPlan.dailyMeals.forEach((mealDay) => {
    const mealDate = new Date(mealDay.date)

    // Проверяем, попадает ли день в отчётный период
    if (mealDate >= start && mealDate <= end) {
      breakfastCount += mealDay.breakfast || 0
      lunchCount += mealDay.lunch || 0
      dinnerCount += mealDay.dinner || 0
    }
  })

  // 4. Если нет питания (по категории), то обнуляем количество
  const isNoMealCategory = ["apartment", "studio"].includes(
    request.roomCategory
  )
  if (isNoMealCategory) {
    breakfastCount = 0
    lunchCount = 0
    dinnerCount = 0
  }

  // 5. Получаем цены на еду в зависимости от типа отчёта
  let mealPrices
  if (reportType === "airline") {
    mealPrices = getAirlineMealPrice(request) // Для авиакомпаний
  } else if (reportType === "hotel") {
    mealPrices = request.hotel?.mealPrice // Для отелей
  }

  // 6. Рассчитываем стоимость пищи
  const breakfastCost = breakfastCount * (mealPrices?.breakfast || 0)
  const lunchCost = lunchCount * (mealPrices?.lunch || 0)
  const dinnerCost = dinnerCount * (mealPrices?.dinner || 0)
  const totalMealCost = breakfastCost + lunchCost + dinnerCost

  // Возвращаем результаты
  return { totalMealCost, breakfastCount, lunchCount, dinnerCount }
}

// Функции для подсчёта цен ---------------- ↑↑↑↑

// Функции обработки дат ---------------- ↓↓↓↓

function parseAsLocal(input) {
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

const formatLocalDate = (date) => {
  const dd = String(date.getDate()).padStart(2, "0")
  const mm = String(date.getMonth() + 1).padStart(2, "0")
  const yyyy = date.getFullYear()
  const hh = String(date.getHours()).padStart(2, "0")
  const min = String(date.getMinutes()).padStart(2, "0")
  const ss = String(date.getSeconds()).padStart(2, "0")
  return `${dd}.${mm}.${yyyy} ${hh}:${min}:${ss}`
}

function formatDateToISO(dateInput) {
  const date = new Date(dateInput)

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0") // месяцы с 0
  const day = String(date.getDate()).padStart(2, "0")

  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")
  const seconds = String(date.getSeconds()).padStart(2, "0")

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`
}

// Функции обработки дат ---------------- ↑↑↑↑

// Функции агрегации заяврк ---------------- ↓↓↓↓

const aggregateRequestReports = (
  requests,
  reportType,
  filterStart,
  filterEnd
) => {
  const filtered = requests.filter((r) => {
    const pos = r.person?.position?.name
    return pos !== "Техник" && pos !== "Инженер"
  })

  filtered.sort((a, b) => {
    // Сортировка по отелю ---------------- ↓↓↓↓
    const hotelA = a.hotel?.name || ""
    const hotelB = b.hotel?.name || ""
    const hotelCmp = hotelA.localeCompare(hotelB, "ru")
    if (hotelCmp !== 0) return hotelCmp
    // Сортировка по отелю ---------------- ↑↑↑↑

    // Сортировка по категории номера ---------------- ↓↓↓↓
    const catOrder = [
      "studio",
      "apartment",
      "luxe",
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
    // Сортировка по категории номера ---------------- ↑↑↑↑

    // Сортировка по номеру и ID номера ---------------- ↓↓↓↓
    const roomNameA = a.roomName || ""
    const roomNameB = b.roomName || ""

    // Если roomName одинаков, сортируем по roomId
    if (roomNameA !== roomNameB) return roomNameA.localeCompare(roomNameB, "ru")

    const roomIdA = a.roomId || ""
    const roomIdB = b.roomId || ""

    if (roomIdA != roomIdB) return roomIdA.localeCompare(roomIdB, "ru")
    // Сортировка по номеру и ID номера ---------------- ↑↑↑↑

    // Сортировка по имени проживающего ---------------- ↓↓↓↓
    const nameA = a.person?.name || ""
    const nameB = b.person?.name || ""
    return nameA.localeCompare(nameB, "ru")
    // Сортировка по имени проживающего ---------------- ↑↑↑↑
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

    // const breakdown = calculateDaysBreakdown(
    //   rawIn,
    //   rawOut,
    //   filterStart,
    //   filterEnd
    // )

    // console.log(breakdown)

    const totalLivingCost = calculateLivingCost(
      request,
      reportType,
      effectiveDays
    )

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
      totalDebt: totalLivingCost + totalMealCost
    }
  })
}

// Функции агрегации заяврк ---------------- ↑↑↑↑

// Функции для подсчёта дней ---------------- ↓↓↓↓

const calculateTotalDays = (start, end) => {
  if (!start || !end) return 0
  const differenceInMilliseconds = new Date(end) - new Date(start)
  return Math.ceil(differenceInMilliseconds / (1000 * 60 * 60 * 24))
}

/**
 * Возвращает подробный breakdown расчёта для одного интервала.
 * @param {string} checkInStr   — ISO-строка фактического заезда
 * @param {string} checkOutStr  — ISO-строка фактического выезда
 * @param {string} filterStartStr — ISO-строка начала отчётного периода
 * @param {string} filterEndStr   — ISO-строка конца отчётного периода
 */
function calculateDaysBreakdown(
  checkInStr,
  checkOutStr,
  filterStartStr,
  filterEndStr
) {
  const msInDay = 1000 * 60 * 60 * 24
  const checkIn = new Date(checkInStr)
  const checkOut = new Date(checkOutStr)
  const filterStart = new Date(filterStartStr)
  const filterEnd = new Date(filterEndStr)

  // 1) полный выход за границы
  if (checkIn < filterStart && checkOut > filterEnd) {
    const rawDays = (filterEnd - filterStart) / msInDay
    const days = Math.ceil(rawDays)
    return {
      type: "fully_outside",
      rawDays,
      days
    }
  }

  // 2) «Обрезаем» по границам
  const effArr =
    checkIn < filterStart ? new Date(filterStart) : new Date(checkIn)
  const effDep = checkOut > filterEnd ? new Date(filterEnd) : new Date(checkOut)

  // 3) ранний заезд по effectiveArrival
  const arrH = effArr.getHours() + effArr.getMinutes() / 60
  let arrivalPartial = 0
  if (arrH < 6) {
    arrivalPartial = 1.0
  } else if (arrH < 14) {
    arrivalPartial = 0.5
  }

  // 4) поздний выезд по effectiveDeparture
  const depH = effDep.getHours() + effDep.getMinutes() / 60
  let departurePartial = 0
  if (depH > 18) {
    departurePartial = 1.0
  } else if (depH > 12) {
    departurePartial = 0.5
  }

  // 5) полный день(дни) по «14:00→12:00»
  const startFull = new Date(effArr)
  startFull.setHours(14, 0, 0, 0)
  if (effArr > startFull) startFull.setDate(startFull.getDate() + 1)

  const endFull = new Date(effDep)
  endFull.setHours(12, 0, 0, 0)
  if (effDep < endFull) endFull.setDate(endFull.getDate() - 1)

  const rawFullMs = endFull - startFull
  const rawFullDays = rawFullMs > 0 ? rawFullMs / msInDay : 0
  const fullDays = Math.floor(rawFullDays)

  // 6) итог
  const totalDays = arrivalPartial + fullDays + departurePartial

  return {
    type: "partial",
    checkIn: checkIn.toISOString(),
    checkOut: checkOut.toISOString(),
    effectiveArrival: effArr.toISOString(),
    effectiveDeparture: effDep.toISOString(),
    arrivalPartial,
    rawFullDays,
    fullDays,
    departurePartial,
    totalDays
  }
}

function calculateEffectiveCostDaysWithPartial(
  arrivalStr,
  departureStr,
  reportStart,
  reportEnd
) {
  let reportStartDay = +reportStart.split("T")[0].split("-")[2]
  let reportStartHour = +reportStart.split("T")[1].split(":")[0]
  let reportStartMinute = +reportStart.split("T")[1].split(":")[1]

  let reportEndDay = +reportEnd.split("T")[0].split("-")[2]
  let reportEndHour = +reportEnd.split("T")[1].split(":")[0]
  let reportEndMinute = +reportEnd.split("T")[1].split(":")[1]

  let arrivalDay = +arrivalStr.split("T")[0].split("-")[2]
  let arrivalHour = +arrivalStr.split("T")[1].split(":")[0]
  let arrivalMinute = +arrivalStr.split("T")[1].split(":")[1]

  let departureDay = +departureStr.split("T")[0].split("-")[2]
  let departureHour = +departureStr.split("T")[1].split(":")[0]
  let departureMinute = +departureStr.split("T")[1].split(":")[1]

  let countDays = 0
  let standartArrivalTime = 14
  let standartDepartureTime = 12

  if (
    reportStartDay == arrivalDay &&
    reportStartHour == arrivalHour &&
    reportStartMinute == arrivalMinute &&
    reportEndDay == departureDay &&
    reportEndHour == departureHour &&
    reportEndMinute == departureMinute
  ) {
    countDays = departureDay - arrivalDay + 1
  } else {
    if (
      reportStartDay == arrivalDay &&
      reportStartHour == arrivalHour &&
      reportStartMinute == arrivalMinute &&
      (reportEndDay != departureDay ||
        reportEndHour != departureHour ||
        reportEndMinute != departureMinute)
    ) {
      let innerDays = departureDay - arrivalDay

      if (innerDays > 0) {
        if (departureHour >= 18) {
          if (departureHour == 18 && departureMinute == 0) {
            innerDays = innerDays + 1
          } else {
            innerDays = innerDays + 1
          }
        } else if (departureHour >= 12) {
          if (departureHour == 12 && departureMinute == 0) {
            innerDays = innerDays + 0
          } else {
            innerDays = innerDays + 0.5
          }
        }

        countDays = innerDays
      } else {
        // if (departureHour - standartArrivalTime < 0) {
        //   countDays = 0.5
        // } else {
        //   countDays = 1
        // }

        if (departureHour >= 18) {
          if (departureHour == 18 && departureMinute == 0) {
            innerDays = 1
          } else {
            innerDays = 1
          }
        } else if (departureHour >= 12) {
          if (departureHour == 12 && departureMinute == 0) {
            innerDays = 0.5
          } else {
            innerDays = 0.5
          }
        } else {
          innerDays = 0.5
        }
        countDays = innerDays
      }
    }

    if (
      reportEndDay == departureDay &&
      reportEndHour == departureHour &&
      reportEndMinute == departureMinute &&
      (reportStartDay != arrivalDay ||
        reportStartHour != arrivalHour ||
        reportStartMinute != arrivalMinute)
    ) {
      let innerDays = departureDay - arrivalDay

      if (arrivalHour <= 6) {
        if (arrivalHour == 6 && arrivalMinute >= 0) {
          innerDays = innerDays + 0.5
        } else {
          innerDays = innerDays + 1
        }
      } else if (arrivalHour <= 14) {
        if (arrivalHour == 14 && arrivalMinute >= 0) {
          innerDays = innerDays + 0
        } else {
          innerDays = innerDays + 0.5
        }
      }

      countDays = innerDays + 1
    }
    if (
      (reportStartDay != arrivalDay ||
        reportStartHour != arrivalHour ||
        reportStartMinute != arrivalMinute) &&
      (reportEndDay != departureDay ||
        reportEndHour != departureHour ||
        reportEndMinute != departureMinute)
    ) {
      let innerDays = departureDay - arrivalDay

      if (innerDays > 0) {
        if (departureHour >= 18) {
          if (departureHour == 18 && departureMinute == 0) {
            innerDays = innerDays + 1
          } else {
            innerDays = innerDays + 1
          }
        } else if (departureHour >= 12) {
          if (departureHour == 12 && departureMinute == 0) {
            innerDays = innerDays + 0
          } else {
            innerDays = innerDays + 0.5
          }
        }

        if (arrivalHour <= 6) {
          if (arrivalHour == 6 && arrivalMinute >= 0) {
            innerDays = innerDays + 0.5
          } else {
            innerDays = innerDays + 1
          }
        } else if (arrivalHour <= 14) {
          if (arrivalHour == 14 && arrivalMinute >= 0) {
            innerDays = innerDays + 0
          } else {
            innerDays = innerDays + 0.5
          }
        }

        countDays = innerDays
      } else {
        // if (departureHour >= 18) {
        //     if (departureHour == 18 && departureMinute == 0) {
        //         innerDays = innerDays + 0.5
        //     } else {
        //         innerDays = innerDays + 1
        //     }
        // }
        // else
        //     if (departureHour >= 12) {
        //         if (departureHour == 12 && departureMinute == 0) {
        //             innerDays = innerDays + 0
        //         } else {
        //             innerDays = innerDays + 0.5
        //         }
        //     }

        if (departureHour < standartArrivalTime) {
          innerDays = innerDays - 0.5
        }

        if (arrivalHour <= 6) {
          if (arrivalHour == 6 && arrivalMinute >= 0) {
            innerDays = innerDays + 0.5
          } else {
            innerDays = innerDays + 1
          }
        } else if (arrivalHour <= 14) {
          if (arrivalHour == 14 && arrivalMinute >= 0) {
            innerDays = innerDays + 0
          } else {
            innerDays = innerDays + 0.5
          }
        }

        countDays = innerDays + 1
      }
    }
  }

  return countDays
}

// Функции для подсчёта дней ---------------- ↑↑↑↑

// ------------------ helper parsing/даты ------------------
const parseDDMMYYYY_HHMMSS = (str) => {
  if (!str) return null
  const [datePart, timePart] = str.split(" ")
  const [dd, mm, yyyy] = datePart.split(".").map(Number)
  const [hh = 0, min = 0, ss = 0] = (timePart || "00:00:00")
    .split(":")
    .map(Number)
  return new Date(yyyy, mm - 1, dd, hh, min, ss)
}

const startOfServiceDay = (dt, serviceDayHour = 12) => {
  const d = new Date(dt)
  d.setHours(serviceDayHour, 0, 0, 0)
  return d
}
const addDays = (dt, n) => {
  const d = new Date(dt)
  d.setDate(d.getDate() + n)
  return d
}

/**
 * Возвращает список "ночей" (сервисных дней) от start (inclusive) до end (exclusive).
 * Каждая "ночь" — момент начала сервисного дня (например, 12:00).
 */
const listServiceNights = (start, end, serviceDayHour = 12) => {
  const nights = []
  let cur = startOfServiceDay(start, serviceDayHour)
  if (start < cur) cur = addDays(cur, -1)
  const last = startOfServiceDay(end, serviceDayHour)
  while (cur < last) {
    nights.push(new Date(cur))
    cur = addDays(cur, 1)
  }
  return nights
}

// ------------------ основная функция с режимами ------------------
/**
 * distributeNightsAndRoommates
 * reportRows — массив объектов с необходимыми полями (id, personName, roomId, arrival, departure, totalDays, totalLivingCost, totalMealCost)
 * options:
 *  - serviceDayHour (default 12)
 *  - mode: "owner" | "shared_equal" | "shared_proportional" (default "owner")
 *  - filterStart/filterEnd: Date (опционально)
 *  - getPricePerDay(row) — optional callback
 *
 * Возвращает новый массив строк с полями ownedDays (может быть дробным), roommateNames, roommateName, totalLivingCost, totalDebt, nightBreakdown (debug)
 */
function distributeNightsAndRoommates(reportRows, options = {}) {
  const rows = reportRows.map((r) => ({ ...r })) // shallow clone
  const {
    serviceDayHour = 12,
    mode = "owner",
    filterStart = null,
    filterEnd = null,
    getPricePerDay = null
  } = options

  rows.forEach((r) => {
    r.__arrivalDate =
      typeof r.arrival === "string"
        ? parseDDMMYYYY_HHMMSS(r.arrival)
        : new Date(r.arrival)
    r.__departureDate =
      typeof r.departure === "string"
        ? parseDDMMYYYY_HHMMSS(r.departure)
        : new Date(r.departure)
    // clamp NaN
    if (!(r.__arrivalDate instanceof Date) || isNaN(r.__arrivalDate))
      r.__arrivalDate = new Date(0)
    if (!(r.__departureDate instanceof Date) || isNaN(r.__departureDate))
      r.__departureDate = new Date(0)
  })

  let globalStart = filterStart
  let globalEnd = filterEnd
  if (!globalStart) {
    globalStart =
      rows.reduce(
        (m, r) =>
          r.__arrivalDate && (!m || r.__arrivalDate < m) ? r.__arrivalDate : m,
        null
      ) || new Date()
  }
  if (!globalEnd) {
    globalEnd =
      rows.reduce(
        (m, r) =>
          r.__departureDate && (!m || r.__departureDate > m)
            ? r.__departureDate
            : m,
        null
      ) || new Date()
  }

  // group by roomId
  const groups = {}
  rows.forEach((r, idx) => {
    const roomKey =
      r.roomId || `${r.roomName || "room"}_${r.hotelName || ""}_${idx}`
    if (!groups[roomKey]) groups[roomKey] = []
    groups[roomKey].push(r)
  })

  // accumulators
  const ownedDaysMap = {} // id -> float
  const roommatesMap = {} // id -> Set(name)
  const nightDebugMap = {} // roomKey -> array of nights with coverage info (for debug)

  Object.entries(groups).forEach(([roomKey, group]) => {
    // compute effective intervals clipped to globalStart/globalEnd
    group.forEach((r) => {
      r.__effArr =
        r.__arrivalDate < globalStart
          ? new Date(globalStart)
          : new Date(r.__arrivalDate)
      r.__effDep =
        r.__departureDate > globalEnd
          ? new Date(globalEnd)
          : new Date(r.__departureDate)
    })

    // sort by effective arrival so owner mode is deterministic
    group.sort((a, b) => a.__effArr - b.__effArr)

    // compute overall min/max
    let minArr =
      group.reduce((m, r) => (!m || r.__effArr < m ? r.__effArr : m), null) ||
      globalStart
    let maxDep =
      group.reduce((m, r) => (!m || r.__effDep > m ? r.__effDep : m), null) ||
      globalEnd
    if (minArr < globalStart) minArr = globalStart
    if (maxDep > globalEnd) maxDep = globalEnd

    const nights = listServiceNights(minArr, maxDep, serviceDayHour)
    nightDebugMap[roomKey] = []

    nights.forEach((nightStart) => {
      const nightEnd = addDays(nightStart, 1)
      // find who covers this night (has overlap with [nightStart, nightEnd))
      const covering = group.filter(
        (r) => r.__effArr < nightEnd && r.__effDep > nightStart
      )
      if (covering.length === 0) return

      // record roommates among covering
      covering.forEach((r) => {
        if (!roommatesMap[r.id]) roommatesMap[r.id] = new Set()
        covering.forEach((other) => {
          if (other.id !== r.id && other.personName)
            roommatesMap[r.id].add(other.personName)
        })
      })

      if (mode === "owner") {
        // owner: give full 1.0 night to earliest arrival
        covering.sort((a, b) => a.__effArr - b.__effArr)
        const owner = covering[0]
        ownedDaysMap[owner.id] = (ownedDaysMap[owner.id] || 0) + 1
        nightDebugMap[roomKey].push({
          nightStart: nightStart.toISOString(),
          nightEnd: nightEnd.toISOString(),
          mode: "owner",
          allocated: [{ id: owner.id, name: owner.personName, share: 1 }]
        })
      } else if (mode === "shared_equal") {
        const share = 1 / covering.length
        covering.forEach((r) => {
          ownedDaysMap[r.id] = (ownedDaysMap[r.id] || 0) + share
        })
        nightDebugMap[roomKey].push({
          nightStart: nightStart.toISOString(),
          nightEnd: nightEnd.toISOString(),
          mode: "shared_equal",
          allocated: covering.map((r) => ({
            id: r.id,
            name: r.personName,
            share
          }))
        })
      } else if (mode === "shared_proportional") {
        // compute actual overlap seconds for each covering inside [nightStart, nightEnd)
        const overlaps = covering.map((r) => {
          const s = r.__effArr > nightStart ? r.__effArr : nightStart
          const e = r.__effDep < nightEnd ? r.__effDep : nightEnd
          const overlapMs = Math.max(0, e - s)
          return { r, overlapMs }
        })
        const totalMs = overlaps.reduce((sum, o) => sum + o.overlapMs, 0) || 1
        overlaps.forEach((o) => {
          const share = o.overlapMs / totalMs
          ownedDaysMap[o.r.id] = (ownedDaysMap[o.r.id] || 0) + share
        })
        nightDebugMap[roomKey].push({
          nightStart: nightStart.toISOString(),
          nightEnd: nightEnd.toISOString(),
          mode: "shared_proportional",
          allocated: overlaps.map((o) => ({
            id: o.r.id,
            name: o.r.personName,
            share: o.overlapMs / totalMs
          }))
        })
      }
    })
  })

  // finalize rows: compute pricePerDay and recalc totals, and attach roommates
  const result = rows.map((r) => {
    const owned = ownedDaysMap[r.id] || 0
    const roommatesSet = roommatesMap[r.id] || new Set()
    const roommatesArr = Array.from(roommatesSet)
    const roommateNames = roommatesArr.join(", ")
    const roommateName = roommatesArr.length > 0 ? roommatesArr[0] : ""

    let pricePerDay = 0
    if (typeof getPricePerDay === "function") {
      pricePerDay = Number(getPricePerDay(r)) || 0
    } else {
      const denom =
        Number(r.totalDays) && Number(r.totalDays) !== 0
          ? Number(r.totalDays)
          : 1
      pricePerDay = (Number(r.totalLivingCost) || 0) / denom
    }

    // round to 2 decimals for money; you can round to integer if needed
    const newLiving = Math.round(owned * pricePerDay * 100) / 100

    return {
      ...r,
      ownedDays: Math.round(owned * 100) / 100,
      roommateNames,
      roommateName,
      totalLivingCost: newLiving,
      totalDebt:
        Math.round((newLiving + (Number(r.totalMealCost) || 0)) * 100) / 100
      // debug
      // nightBreakdown: nightDebugMap[...] // if needed, could attach per room
    }
  })

  return { rows: result, debug: { nightDebugMap } }
}

export default reportResolver

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
      airlineAdminMiddleware(context)

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
            filter && filter.airlineId ||
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
      airlineAdminMiddleware(context)
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
        adminMiddleware(context)
      }
      if (report.separator === "airline") {
        airlineAdminMiddleware(context)
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

/* ================================= */
/* Функции для формирования фильтров */
/* ================================= */

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

const calculateTotalDays = (start, end) => {
  if (!start || !end) return 0
  const differenceInMilliseconds = new Date(end) - new Date(start)
  return Math.ceil(differenceInMilliseconds / (1000 * 60 * 60 * 24))
}

const calculateEffectiveCostDaysWithPartial = (
  arrival,
  departure,
  filterStart,
  filterEnd
) => {
  const effectiveArrival = arrival < filterStart ? filterStart : arrival
  const effectiveDeparture = departure > filterEnd ? filterEnd : departure

  if (effectiveDeparture <= effectiveArrival) return 0

  const arrivalMidnight = new Date(
    effectiveArrival.getFullYear(),
    effectiveArrival.getMonth(),
    effectiveArrival.getDate()
  )
  const departureMidnight = new Date(
    effectiveDeparture.getFullYear(),
    effectiveDeparture.getMonth(),
    effectiveDeparture.getDate()
  )

  const dayDifference =
    (departureMidnight - arrivalMidnight) / (1000 * 60 * 60 * 24)

  const arrivalHours =
    arrival < filterStart
      ? 14
      : effectiveArrival.getHours() + effectiveArrival.getMinutes() / 60

  let arrivalFactor = 0

  if (arrivalHours > 0 && arrivalHours < 6) {
    arrivalFactor = 1
    // arrivalFactor = 1.5
  } else if (arrivalHours >= 6 && arrivalHours < 14) {
    arrivalFactor = 0.5
    // arrivalFactor = 1
  } else if (arrivalHours >= 14 && arrivalHours < 24) {
    arrivalFactor = 0
    // arrivalFactor = 0.5
  }

  const departureHours =
    departure > filterEnd
      ? 12
      : effectiveDeparture.getHours() + effectiveDeparture.getMinutes() / 60

  let departureFactor = 0

  if (departureHours > 0 && departureHours <= 12) {
    departureFactor = 0
    // departureFactor = 0.5
  } else if (departureHours > 12 && departureHours <= 18) {
    departureFactor = 0.5
    // departureFactor = 1
  } else if (departureHours > 18 && departureHours < 24) {
    departureFactor = 1
    // departureFactor = 1.5
  }

  if (dayDifference === 0) {
    // return Math.max(arrivalFactor, departureFactor)
    return arrivalFactor + (dayDifference + 0.5) + departureFactor
  } else if (dayDifference === 1) {
    return arrivalFactor + dayDifference + departureFactor
  } else {
    return arrivalFactor + (dayDifference + 1) + departureFactor
  }
  // return arrivalFactor + (dayDifference - 1) + departureFactor
  // return arrivalFactor + (dayDifference + 1) + departureFactor
  // return arrivalFactor + dayDifference + departureFactor
}

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
    const hotelA = a.hotel?.name || ""
    const hotelB = b.hotel?.name || ""
    const hotelCmp = hotelA.localeCompare(hotelB, "ru")
    if (hotelCmp !== 0) return hotelCmp

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
      rawIn,
      rawOut,
      filterStart,
      filterEnd
    )

    const totalLivingCost = calculateLivingCost(
      request,
      reportType,
      effectiveDays
    )

    const mealPlan = request.mealPlan || {}

    const isNoMealCategory = ["apartment", "studio"].includes(
      request.roomCategory
    )

    let breakfastCount = isNoMealCategory ? 0 : mealPlan.breakfast || 0
    let lunchCount = isNoMealCategory ? 0 : mealPlan.lunch || 0
    let dinnerCount = isNoMealCategory ? 0 : mealPlan.dinner || 0

    if (fullDays > 0 && effectiveDays < fullDays) {
      const ratio = effectiveDays / fullDays
      breakfastCount = Math.round(breakfastCount * ratio)
      lunchCount = Math.round(lunchCount * ratio)
      dinnerCount = Math.round(dinnerCount * ratio)
    }

    let mealPrices
    if (reportType === "airline") {
      mealPrices = getAirlineMealPrice(request)
    }
    if (reportType === "hotel") {
      mealPrices = request.hotel?.mealPrice
    }

    const breakfastCost = breakfastCount * (mealPrices.breakfast || 0)
    const lunchCost = lunchCount * (mealPrices.lunch || 0)
    const dinnerCost = dinnerCount * (mealPrices.dinner || 0)
    const totalMealCost = breakfastCost + lunchCost + dinnerCost

    return {
      index: index + 1,
      id: request.id,
      hotelName: request.hotel?.name || "Не указано",
      arrival: formatLocalDate(effectiveArrival),
      departure: formatLocalDate(effectiveDeparture),
      totalDays: calculateEffectiveCostDaysWithPartial(
        rawIn,
        rawOut,
        filterStart,
        filterEnd
      ),
      category: categoryMapping[request.roomCategory] || request.roomCategory,
      personName: request.person?.name || "Не указано",
      personPosition: request.person?.position?.name || "Не указано",
      roomName: hotelChess.room?.name || "",
      breakfastCount,
      lunchCount,
      dinnerCount,
      totalMealCost,
      totalLivingCost,
      totalDebt: totalLivingCost + totalMealCost
    }
  })
}

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

export default reportResolver

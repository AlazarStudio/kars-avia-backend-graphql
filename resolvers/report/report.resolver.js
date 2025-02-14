import {
  // generatePDF, // если понадобится PDF
  generateExcelHotel,
  generateExcelAvia
} from "../../exports/exporter.js"
import { prisma } from "../../prisma.js"
import path from "path"
import fs from "fs"
import {
  adminMiddleware,
  airlineAdminMiddleware,
  hotelAdminMiddleware
} from "../../middlewares/authMiddleware.js"
import { pubsub, REPORT_CREATED } from "../../exports/pubsub.js"

const reportResolver = {
  Query: {
    // Отчёт для авиакомпаний
    getAirlineReport: async (_, { filter }, context) => {
      const { user } = context
      airlineAdminMiddleware(context)

      if (filter.hotelId) {
        throw new Error("Cannot fetch hotel reports in getAirlineReport")
      }

      const reports = await prisma.savedReport.findMany({
        where: {
          ...applyFilters(filter),
          airlineId: { not: null },
          ...(filter.airlineId
            ? { airlineId: filter.airlineId }
            : user.role === "SUPERADMIN" || user.role === "DISPATCHERADMIN"
            ? {}
            : { airlineId: user.airlineId })
        },
        include: { airline: true },
        orderBy: { createdAt: "desc" }
      })

      // Убираем возможные дубликаты
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
            filter.airlineId ||
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

    // Отчёт для отелей
    getHotelReport: async (_, { filter }, context) => {
      const { user } = context
      hotelAdminMiddleware(context)

      const reports = await prisma.savedReport.findMany({
        where: {
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
    // Создание отчёта для авиакомпании
    createAirlineReport: async (_, { input }, context) => {
      const { user } = context
      airlineAdminMiddleware(context)
      const { filter, format } = input

      if (!user) {
        throw new Error("Access denied")
      }

      // Границы фильтра
      const filterStart = new Date(filter.startDate)
      const filterEnd = new Date(filter.endDate)
      const startDateStr = filterStart.toISOString().slice(0, 10)
      const endDateStr = filterEnd.toISOString().slice(0, 10)

      // Получаем заявки для формирования отчёта
      const requests = await prisma.request.findMany({
        where: {
          ...applyCreateFilters(filter),
          status: {
            in: ["done", "transferred", "extended", "archiving", "archived"]
          }
        },
        include: { person: true, hotelChess: true, hotel: true, airline: true },
        orderBy: { arrival: "asc" }
      })

      const airline = await prisma.airline.findUnique({
        where: { id: filter.airlineId },
        select: { name: true }
      })
      if (!airline) {
        throw new Error("Airline not found")
      }
      const name = airline.name
      const reportData = aggregateReports(
        requests,
        "airline",
        filterStart,
        filterEnd
      )

      const reportName = `airline_report-${name}_${startDateStr}-${endDateStr}_${Date.now()}.${format}`
      const reportPath = path.resolve(`./reports/${reportName}`)
      fs.mkdirSync(path.dirname(reportPath), { recursive: true })

      if (format === "pdf") {
        // await generatePDF(reportData, reportPath);
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
          user.role === "AIRLINEADMIN" ? user.airlineId : filter.airlineId
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

    // Создание отчёта для отеля
    createHotelReport: async (_, { input }, context) => {
      const { user } = context
      hotelAdminMiddleware(context)
      const { filter, format } = input

      if (!user) {
        throw new Error("Access denied")
      }

      const filterStart = new Date(filter.startDate)
      const filterEnd = new Date(filter.endDate)
      const startDateStr = filterStart.toISOString().slice(0, 10)
      const endDateStr = filterEnd.toISOString().slice(0, 10)

      // Выборка данных отеля с учетом новых полей (mealPrice и prices)
      const hotel = await prisma.hotel.findUnique({
        where: { id: filter.hotelId },
        select: {
          name: true,
          mealPrice: true,
          prices: true
        }
      })
      if (!hotel) {
        throw new Error("Hotel not found")
      }

      // Получаем заявки для данного отеля
      const requests = await prisma.request.findMany({
        where: {
          hotelId: filter.hotelId,
          status: {
            in: ["done", "transferred", "extended", "archiving", "archived"]
          }
        },
        include: {
          person: true,
          hotelChess: true,
          hotel: true
        },
        orderBy: { arrival: "asc" }
      })

      // Обогащаем заявки данными mealPlan (если хранится в JSON)
      const requestsWithMealPlan = await Promise.all(
        requests.map(async (request) => {
          const mp = await prisma.request.findUnique({
            where: { id: request.id },
            select: { mealPlan: true }
          })
          return { ...request, mealPlan: mp?.mealPlan || {} }
        })
      )

      const reportData = aggregateReports(
        requestsWithMealPlan,
        "hotel",
        filterStart,
        filterEnd
      )

      const reportName = `hotel_report-${
        hotel.name
      }_${startDateStr}-${endDateStr}_${Date.now()}.${format}`
      const reportPath = path.resolve(`./reports/${reportName}`)
      fs.mkdirSync(path.dirname(reportPath), { recursive: true })

      if (format === "xlsx") {
        await generateExcelHotel(reportData, reportPath)
      } else {
        throw new Error("Unsupported report format")
      }

      const reportRecord = {
        name: reportName,
        url: `/reports/${reportName}`,
        startDate: new Date(filter.startDate),
        endDate: new Date(filter.endDate),
        createdAt: new Date(),
        hotelId: user.role === "HOTELADMIN" ? user.hotelId : filter.hotelId
      }

      if (!reportRecord.hotelId) {
        throw new Error("Hotel ID is required for this report")
      }

      const savedReport = await prisma.savedReport.create({
        data: reportRecord
      })
      pubsub.publish(REPORT_CREATED, { reportCreated: savedReport })
      return savedReport
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
  const { startDate, endDate, archived, personId, hotelId, airlineId } = filter
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

  return where
}

const applyFilters = (filter) => {
  const { startDate, endDate, archived, personId, hotelId, airlineId } = filter
  const where = {}

  if (startDate) where.createdAt = { gte: new Date(startDate) }
  if (endDate) where.createdAt = { lte: new Date(endDate) }
  if (archived !== undefined) where.archived = archived
  if (personId) where.personId = personId
  if (hotelId) where.hotelId = hotelId
  if (airlineId) where.airlineId = airlineId

  return where
}

/* ================================= */
/* Функции для расчёта количества дней */
/* ================================= */

const calculateTotalDays = (start, end) => {
  if (!start || !end) return 0
  const differenceInMilliseconds = new Date(end) - new Date(start)
  return Math.ceil(differenceInMilliseconds / (1000 * 60 * 60 * 24))
}

const calculateOverlapDays = (stayStart, stayEnd, filterStart, filterEnd) => {
  const start = Math.max(stayStart.getTime(), filterStart.getTime())
  const end = Math.min(stayEnd.getTime(), filterEnd.getTime())
  if (end <= start) return 0
  return Math.ceil((end - start) / (1000 * 60 * 60 * 24))
}

const calculateEffectiveCostDaysWithPartial = (
  arrival,
  departure,
  filterStart,
  filterEnd
) => {
  const effectiveArrival = arrival > filterStart ? arrival : filterStart
  const effectiveDeparture = departure < filterEnd ? departure : filterEnd
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
  const dayDifference = Math.round(
    (departureMidnight - arrivalMidnight) / (1000 * 60 * 60 * 24)
  )

  let arrivalFactor = 1
  const arrivalHours =
    effectiveArrival.getHours() + effectiveArrival.getMinutes() / 60
  if (arrivalHours >= 6 && arrivalHours < 14) {
    arrivalFactor = 0.5
  }

  let departureFactor = 1
  const departureHours =
    effectiveDeparture.getHours() + effectiveDeparture.getMinutes() / 60
  if (departureHours >= 12 && departureHours < 18) {
    departureFactor = 0.5
  }

  if (dayDifference === 0) {
    return Math.max(arrivalFactor, departureFactor)
  } else {
    return arrivalFactor + (dayDifference - 1) + departureFactor
  }
}

const aggregateReports = (requests, reportType, filterStart, filterEnd) => {
  return requests.map((request) => {
    const hotelChess = request.hotelChess?.[0] || {}
    const room = hotelChess.room || "Не указано"
    const startDate = hotelChess.start ? new Date(hotelChess.start) : null
    const endDate = hotelChess.end ? new Date(hotelChess.end) : null

    const fullDays =
      startDate && endDate ? calculateTotalDays(startDate, endDate) : 0
    const effectiveDays =
      startDate && endDate
        ? calculateEffectiveCostDaysWithPartial(
            startDate,
            endDate,
            filterStart,
            filterEnd
          )
        : 0

    // Вычисляем дневную стоимость проживания
    let dailyPrice = 0
    if (reportType === "airline") {
      const categoryPrices = {
        onePlace: request.airline?.prices?.priceOneCategory || 0,
        twoPlace: request.airline?.prices?.priceTwoCategory || 0,
        threePlace: request.airline?.prices?.priceThreeCategory || 0,
        fourPlace: request.airline?.prices?.priceFourCategory || 0,
        fivePlace: request.airline?.prices?.priceFiveCategory || 0,
        sixPlace: request.airline?.prices?.priceSixCategory || 0,
        sevenPlace: request.airline?.prices?.priceSevenCategory || 0,
        eightPlace: request.airline?.prices?.priceEightCategory || 0,
        ninePlace: request.airline?.prices?.priceNineCategory || 0,
        tenPlace: request.airline?.prices?.priceTenCategory || 0
      }
      dailyPrice = categoryPrices[request.roomCategory] || 0
    } else if (reportType === "hotel") {
      const categoryPrices = {
        onePlace: request.hotel?.prices?.priceOneCategory || 0,
        twoPlace: request.hotel?.prices?.priceTwoCategory || 0,
        threePlace: request.hotel?.prices?.priceThreeCategory || 0,
        fourPlace: request.hotel?.prices?.priceFourCategory || 0,
        fivePlace: request.hotel?.prices?.priceFiveCategory || 0,
        sixPlace: request.hotel?.prices?.priceSixCategory || 0,
        sevenPlace: request.hotel?.prices?.priceSevenCategory || 0,
        eightPlace: request.hotel?.prices?.priceEightCategory || 0,
        ninePlace: request.hotel?.prices?.priceNineCategory || 0,
        tenPlace: request.hotel?.prices?.priceTenCategory || 0
      }
      dailyPrice = categoryPrices[request.roomCategory] || 0
    }

    // Расчёт питания
    const mealPlan = request.mealPlan || {}
    let breakfastCount = mealPlan.breakfast || 0
    let lunchCount = mealPlan.lunch || 0
    let dinnerCount = mealPlan.dinner || 0

    if (fullDays > 0 && effectiveDays < fullDays) {
      const ratio = effectiveDays / fullDays
      breakfastCount = Math.round(breakfastCount * ratio)
      lunchCount = Math.round(lunchCount * ratio)
      dinnerCount = Math.round(dinnerCount * ratio)
    }

    const mealPrices =
      request.airline?.mealPrice || request.hotel?.mealPrice || {}
    const breakfastCost = breakfastCount * (mealPrices.breakfast || 0)
    const lunchCost = lunchCount * (mealPrices.lunch || 0)
    const dinnerCost = dinnerCount * (mealPrices.dinner || 0)
    const totalMealCost = breakfastCost + lunchCost + dinnerCost
    const totalLivingCost = calculateLivingCost(
      request,
      reportType,
      effectiveDays
    )

    return {
      date: startDate ? startDate.toISOString().slice(0, 10) : "Не указано",
      roomName: room,
      category: request.roomCategory || "Не указано",
      isOccupied: "Занято",
      totalDays: effectiveDays,
      breakfastCount,
      lunchCount,
      dinnerCount,
      dailyPrice,
      totalMealCost: totalMealCost || 0,
      totalLivingCost: totalLivingCost || 0,
      totalDebt: (totalLivingCost || 0) + (totalMealCost || 0)
    }
  })
}

const calculateLivingCost = (request, type, days) => {
  const roomCategory = request.roomCategory
  const priceMapping = {
    airline: {
      onePlace: request.airline?.prices?.priceOneCategory || 0,
      twoPlace: request.airline?.prices?.priceTwoCategory || 0,
      threePlace: request.airline?.prices?.priceThreeCategory || 0,
      fourPlace: request.airline?.prices?.priceFourCategory || 0,
      fivePlace: request.airline?.prices?.priceFiveCategory || 0,
      sixPlace: request.airline?.prices?.priceSixCategory || 0,
      sevenPlace: request.airline?.prices?.priceSevenCategory || 0,
      eightPlace: request.airline?.prices?.priceEightCategory || 0,
      ninePlace: request.airline?.prices?.priceNineCategory || 0,
      tenPlace: request.airline?.prices?.priceTenCategory || 0
    },
    hotel: {
      onePlace: request.hotel?.prices?.priceOneCategory || 0,
      twoPlace: request.hotel?.prices?.priceTwoCategory || 0,
      threePlace: request.hotel?.prices?.priceThreeCategory || 0,
      fourPlace: request.hotel?.prices?.priceFourCategory || 0,
      fivePlace: request.hotel?.prices?.priceFiveCategory || 0,
      sixPlace: request.hotel?.prices?.priceSixCategory || 0,
      sevenPlace: request.hotel?.prices?.priceSevenCategory || 0,
      eightPlace: request.hotel?.prices?.priceEightCategory || 0,
      ninePlace: request.hotel?.prices?.priceNineCategory || 0,
      tenPlace: request.hotel?.prices?.priceTenCategory || 0
    }
  }

  const pricePerDay = priceMapping[type]?.[roomCategory] || 0
  return days > 0 ? days * pricePerDay : 0
}

export default reportResolver

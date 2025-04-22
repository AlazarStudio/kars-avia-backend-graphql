// Импорт необходимых модулей и утилит
import { prisma } from "../../prisma.js"
import {
  // generatePDF,
  generateExcelHotel,
  generateExcelAvia
} from "../../exports/exporter.js"
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

      if (filter.hotelId) {
        throw new Error("Cannot fetch hotel reports in getAirlineReport")
      }

      const separator = user.airlineId ? "airline" : "dispatcher"

      const reports = await prisma.savedReport.findMany({
        where: {
          separator,
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

      let reportData
      if (filter.passengersReport) {
        const reserves = await prisma.reserve.findMany({
          where: {
            ...applyCreateFilters(filter),
            archive: { not: true }
          },
          include: {
            airline: true,
            airport: true,
            hotel: true,
            mealPlan: true,
            hotelChess: {
              include: {
                room: true
              }
            },
            passengers: true
          },
          orderBy: { createdAt: "desc" }
        })
        reportData = aggregatePassengerReports(reserves, filterStart, filterEnd)
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
            }
          },
          include: {
            person: true,
            hotelChess: {
              include: {
                room: true
              }
            },
            hotel: true,
            airline: true,
            mealPlan: true
          },
          orderBy: { arrival: "asc" }
        })
        reportData = aggregateRequestReports(
          requests,
          "airline",
          filterStart,
          filterEnd
        )
      }

      // console.log("\n reportData: " + JSON.stringify(reportData))

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

    // --------------------------------------------------------------------------------------------------------------------

    createHotelReport: async (_, { input }, context) => {
      const { user } = context
      hotelAdminMiddleware(context)
      const { filter, format } = input

      const separator = user.hotelId ? "hotel" : "dispatcher"

      if (!user) {
        throw new Error("Access denied")
      }

      const filterStart = new Date(filter.startDate)
      const filterEnd = new Date(filter.endDate)
      const startDateStr = filterStart.toISOString().slice(0, 10)
      const endDateStr = filterEnd.toISOString().slice(0, 10)

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

      const requests = await prisma.request.findMany({
        where: {
          // hotelId: filter.hotelId,
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
          }
        },
        include: {
          person: true,
          hotelChess: {
            include: {
              room: true
            }
          },
          hotel: true,
          airline: true,
          mealPlan: true
        },
        orderBy: { arrival: "asc" }
      })

      // const requestsWithMealPlan = await Promise.all(
      //   requests.map(async (request) => {
      //     const mp = await prisma.request.findUnique({
      //       where: { id: request.id },
      //       select: { mealPlan: true }
      //     })
      //     return { ...request, mealPlan: mp?.mealPlan || {} }
      //   })
      // )

      const reportData = aggregateRequestReports(
        requests,
        "hotel",
        filterStart,
        filterEnd
      )

      // console.log("\n reportData: " + JSON.stringify(reportData))

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
        hotelId: user.role === "HOTELADMIN" ? user.hotelId : filter.hotelId,
        separator: separator
      }

      if (!reportRecord.hotelId) {
        throw new Error("Hotel ID is required for this report")
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
      isNot: null,
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

  if (startDate) where.createdAt = { gte: new Date(startDate) }
  if (endDate) where.createdAt = { lte: new Date(endDate) }
  if (archived !== undefined) where.archived = archived
  if (personId) where.personId = personId
  if (hotelId) where.hotelId = hotelId
  if (airlineId) where.airlineId = airlineId
  if (positionId) where.positionId = positionId

  // if (position) {
  //   where.person = {
  //     isNot: null,
  //     position: position
  //   }
  // }

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
  if (!airportId) return 0
  const airlinePrices = request.airline?.prices || []
  for (const contract of airlinePrices) {
    if (contract.airports && contract.airports.length > 0) {
      // Ищем среди привязанных аэропортов тот, чей airport.id совпадает с id заявки
      const match = contract.airports.find(
        (item) => item.airport && item.airport.id === airportId
      )
      if (match) {
        // В зависимости от категории возвращаем соответствующее поле цены
        switch (category) {
          case "studio":
            return contract.prices?.priceStudio || 0
          case "apartment":
            return contract.prices?.priceApartment || 0
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

/* =================================== */
/* Функции для расчёта количества дней */
/* =================================== */

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

    let dailyPrice = 0
    if (reportType === "airline") {
      const categoryPrices = {
        studio: request.airline?.prices?.priceStudio || 0,
        apartment: request.airline?.prices?.priceApartment || 0,
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
        studio: request.hotelChess?.room?.price || 0,
        apartment: request.hotelChess?.room?.price || 0,
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

const aggregateRequestReports = (
  requests,
  reportType,
  filterStart,
  filterEnd
) => {
  return requests.map((request, index) => {
    const hotelChess = request.hotelChess?.[0] || {}
    const checkIn = hotelChess.start
      ? new Date(hotelChess.start)
      : new Date(request.arrival)
    const checkOut = hotelChess.end
      ? new Date(hotelChess.end)
      : new Date(request.departure)

    const formatLocalDate = (date) => {
      const dd = String(date.getDate()).padStart(2, "0")
      const mm = String(date.getMonth() + 1).padStart(2, "0")
      const yyyy = date.getFullYear()
      const hh = String(date.getHours()).padStart(2, "0")
      const min = String(date.getMinutes()).padStart(2, "0")
      const ss = String(date.getSeconds()).padStart(2, "0")
      return `${dd}.${mm}.${yyyy} ${hh}:${min}:${ss}`
    }

    const categoryMapping = {
      studio: "Студия",
      apartment: "Квартира",
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

    const arrivalFormatted = formatLocalDate(checkIn)
    const departureFormatted = formatLocalDate(checkOut)

    const fullDays =
      checkIn && checkOut ? calculateTotalDays(checkIn, checkOut) : 0
    const effectiveDays =
      checkIn && checkOut
        ? calculateEffectiveCostDaysWithPartial(
            checkIn,
            checkOut,
            filterStart,
            filterEnd
          )
        : 0

    const totalLivingCost = calculateLivingCost(
      request,
      reportType,
      effectiveDays
    )

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

    const personName = request.person ? request.person.name : "Не указано"
    const personPosition = request.person.position
      ? request.person.position.name
      : "Не указано"

    const roomName = hotelChess.room?.name
    return {
      index: index + 1,
      arrival: arrivalFormatted,
      departure: departureFormatted,
      totalDays: effectiveDays,
      category:
        categoryMapping[request.roomCategory] ||
        request.roomCategory ||
        "Не указано",
      personName,
      personPosition,
      roomName,
      // Для питания отдельные колонки
      breakfastCount,
      lunchCount,
      dinnerCount,
      totalMealCost,
      totalLivingCost,
      totalDebt: totalLivingCost + totalMealCost
    }
  })
}

const aggregatePassengerReports = (reserves, filterStart, filterEnd) => {
  return reserves.map((reserve) => {
    const arrivalDate = new Date(reserve.arrival)
    const departureDate = new Date(reserve.departure)
    const effectiveDays = calculateEffectiveCostDaysWithPartial(
      arrivalDate,
      departureDate,
      filterStart,
      filterEnd
    )
    const fullDays = calculateTotalDays(arrivalDate, departureDate)

    const hotelData = reserve.hotel && reserve.hotel[0]
    let dailyPrice = 0
    if (hotelData && hotelData.prices) {
      dailyPrice = hotelData.prices.priceOneCategory || 0
    }
    const totalLivingCost = effectiveDays * dailyPrice

    const mealPlan = reserve.mealPlan || {}
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
      reserve.airline?.mealPrice || (hotelData ? hotelData.mealPrice : {}) || {}
    const breakfastCost = breakfastCount * (mealPrices.breakfast || 0)
    const lunchCost = lunchCount * (mealPrices.lunch || 0)
    const dinnerCost = dinnerCount * (mealPrices.dinner || 0)
    const totalMealCost = breakfastCost + lunchCost + dinnerCost

    return {
      reserveId: reserve.id,
      reserveNumber: reserve.reserveNumber,
      date: arrivalDate.toISOString().slice(0, 10),
      hotelName: hotelData ? hotelData.name : "Не указано",
      totalDays: effectiveDays,
      breakfastCount,
      lunchCount,
      dinnerCount,
      dailyPrice,
      totalLivingCost,
      totalMealCost,
      totalDebt: totalLivingCost + totalMealCost
    }
  })
}

// const calculateLivingCost = (request, type, days) => {
//   const roomCategory = request.roomCategory
//   const priceMapping = {
//     airline: {
//       studio: request.airline?.prices?.priceStudio || 0,
//       apartment: request.airline?.prices?.priceApartment || 0,
//       onePlace: request.airline?.prices?.priceOneCategory || 0,
//       twoPlace: request.airline?.prices?.priceTwoCategory || 0,
//       threePlace: request.airline?.prices?.priceThreeCategory || 0,
//       fourPlace: request.airline?.prices?.priceFourCategory || 0,
//       fivePlace: request.airline?.prices?.priceFiveCategory || 0,
//       sixPlace: request.airline?.prices?.priceSixCategory || 0,
//       sevenPlace: request.airline?.prices?.priceSevenCategory || 0,
//       eightPlace: request.airline?.prices?.priceEightCategory || 0,
//       ninePlace: request.airline?.prices?.priceNineCategory || 0,
//       tenPlace: request.airline?.prices?.priceTenCategory || 0
//     },
//     hotel: {
//       studio: request.hotelChess[0].room?.price || 0,
//       apartment: request.hotelChess[0].room?.price || 0,
//       onePlace: request.hotel?.prices?.priceOneCategory || 0,
//       twoPlace: request.hotel?.prices?.priceTwoCategory || 0,
//       threePlace: request.hotel?.prices?.priceThreeCategory || 0,
//       fourPlace: request.hotel?.prices?.priceFourCategory || 0,
//       fivePlace: request.hotel?.prices?.priceFiveCategory || 0,
//       sixPlace: request.hotel?.prices?.priceSixCategory || 0,
//       sevenPlace: request.hotel?.prices?.priceSevenCategory || 0,
//       eightPlace: request.hotel?.prices?.priceEightCategory || 0,
//       ninePlace: request.hotel?.prices?.priceNineCategory || 0,
//       tenPlace: request.hotel?.prices?.priceTenCategory || 0
//     }
//   }

//   const pricePerDay = priceMapping[type]?.[roomCategory] || 0
//   return days > 0 ? days * pricePerDay : 0
// }

const calculateLivingCost = (request, type, days) => {
  const roomCategory = request.roomCategory
  let pricePerDay = 0

  if (type === "airline") {
    // Для авиакомпании ищем цену по тарифным договорам, основываясь на аэропорте заявки
    pricePerDay = getAirlinePriceForCategory(request, roomCategory)
  } else if (type === "hotel") {
    // Логика для отеля остается прежней (при необходимости её можно тоже изменить)
    const hotelPriceMapping = {
      studio: request.hotelChess[0]?.room?.price || 0,
      apartment: request.hotelChess[0]?.room?.price || 0,
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
    pricePerDay = hotelPriceMapping[roomCategory] || 0
  }

  return days > 0 ? days * pricePerDay : 0
}

export default reportResolver

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

      // Границы фильтра (с учётом времени)
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
      // Передаём границы фильтра в aggregateReports
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

      // Сохраняем запись отчёта
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

      // Границы фильтра
      const filterStart = new Date(filter.startDate)
      const filterEnd = new Date(filter.endDate)
      const startDateStr = filterStart.toISOString().slice(0, 10)
      const endDateStr = filterEnd.toISOString().slice(0, 10)

      // Получаем данные отеля
      const hotel = await prisma.hotel.findUnique({
        where: { id: filter.hotelId },
        select: {
          name: true,
          MealPrice: true,
          priceOneCategory: true,
          priceTwoCategory: true,
          priceThreeCategory: true,
          priceFourCategory: true,
          priceFiveCategory: true,
          priceSixCategory: true,
          priceSevenCategory: true,
          priceEightCategory: true,
          priceNineCategory: true,
          priceTenCategory: true
        }
      })
      if (!hotel) {
        throw new Error("Hotel not found")
      }

      // Получаем заявки для отеля
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

      // Добавляем mealPlan (так как это JSON)
      const requestsWithMealPlan = await Promise.all(
        requests.map(async (request) => {
          const mealPlan = await prisma.request.findUnique({
            where: { id: request.id },
            select: { mealPlan: true }
          })
          return { ...request, mealPlan: mealPlan?.mealPlan || {} }
        })
      )

      const reportData = requestsWithMealPlan.map((request) => {
        const room = request.roomNumber || "Не указано"
        const category = request.roomCategory || "Не указано"
        const arrival = new Date(request.arrival)
        const departure = new Date(request.departure)

        // Вычисляем эффективное количество дней с учетом сокращённых дней
        const effectiveDays = calculateEffectiveCostDaysWithPartial(
          arrival,
          departure,
          filterStart,
          filterEnd
        )

        // Определяем стоимость проживания по категории
        const categoryPrices = {
          onePlace: request.hotel.priceOneCategory || 0,
          twoPlace: request.hotel.priceTwoCategory || 0,
          threePlace: request.hotel.priceThreeCategory || 0,
          fourPlace: request.hotel.priceFourCategory || 0,
          fivePlace: request.hotel.priceFiveCategory || 0,
          sixPlace: request.hotel.priceSixCategory || 0,
          sevenPlace: request.hotel.priceSevenCategory || 0,
          eightPlace: request.hotel.priceEightCategory || 0,
          ninePlace: request.hotel.priceNineCategory || 0,
          tenPlace: request.hotel.priceTenCategory || 0
        }

        const dailyPrice = categoryPrices[category] || 0
        const totalLivingCost = dailyPrice * effectiveDays

        // Расчёт питания (аналогично предыдущему примеру)
        const mealPlanData = request.mealPlan || {}
        const mealPrices = request.hotel.MealPrice || {}
        let totalMealCost = 0
        let breakfastCount = 0
        let lunchCount = 0
        let dinnerCount = 0

        let overlappingDailyMeals = []
        if (mealPlanData.dailyMeals && Array.isArray(mealPlanData.dailyMeals)) {
          const offsetDays =
            arrival < filterStart
              ? Math.ceil((filterStart - arrival) / (1000 * 60 * 60 * 24))
              : 0
          overlappingDailyMeals = mealPlanData.dailyMeals.slice(
            offsetDays,
            offsetDays + effectiveDays
          )
        }

        overlappingDailyMeals.forEach((meal) => {
          breakfastCount += meal.breakfast || 0
          lunchCount += meal.lunch || 0
          dinnerCount += meal.dinner || 0
          totalMealCost += (meal.breakfast || 0) * (mealPrices.breakfast || 0)
          totalMealCost += (meal.lunch || 0) * (mealPrices.lunch || 0)
          totalMealCost += (meal.dinner || 0) * (mealPrices.dinner || 0)
        })

        return {
          date: arrival.toISOString().slice(0, 10),
          roomName: room,
          category: category,
          isOccupied: "Занято",
          totalDays: effectiveDays,
          breakfastCount,
          lunchCount,
          dinnerCount,
          dailyPrice,
          totalMealCost,
          totalLivingCost,
          totalDebt: totalLivingCost + totalMealCost
        }
      })

      // Добавляем записи для свободных (не занятых) комнат
      const rooms = await prisma.room.findMany({
        where: { hotelId: filter.hotelId, reserve: false }
      })

      rooms.forEach((room) => {
        const alreadyOccupied = reportData.some((r) => r.roomName === room.name)
        if (!alreadyOccupied) {
          const categoryPrices = {
            onePlace: hotel.priceOneCategory || 0,
            twoPlace: hotel.priceTwoCategory || 0,
            threePlace: hotel.priceThreeCategory || 0,
            fourPlace: hotel.priceFourCategory || 0,
            fivePlace: hotel.priceFiveCategory || 0,
            sixPlace: hotel.priceSixCategory || 0,
            sevenPlace: hotel.priceSevenCategory || 0,
            eightPlace: hotel.priceEightCategory || 0,
            ninePlace: hotel.priceNineCategory || 0,
            tenPlace: hotel.priceTenCategory || 0
          }

          const category = room.category || "Не указано"
          const dailyPrice = categoryPrices[category] || 0

          reportData.push({
            date: "Не указано",
            roomName: room.name,
            category: category,
            isOccupied: "Свободно",
            totalDays: 0,
            breakfastCount: 0,
            lunchCount: 0,
            dinnerCount: 0,
            dailyPrice: dailyPrice / 2,
            totalMealCost: 0,
            totalLivingCost: dailyPrice / 2,
            totalDebt: dailyPrice / 2
          })
        }
      })

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

/* ================================ */
/* Функции для формирования фильтров */
/* ================================ */
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

/* ========================================= */
/* Функции для расчёта количества дней */
/* ========================================= */

// Рассчитывает количество календарных дней (без учета сокращений)
const calculateTotalDays = (start, end) => {
  if (!start || !end) return 0
  const differenceInMilliseconds = new Date(end) - new Date(start)
  return Math.ceil(differenceInMilliseconds / (1000 * 60 * 60 * 24))
}

// Рассчитывает число полных дней пересечения двух периодов (без учета сокращённых дней)
const calculateOverlapDays = (stayStart, stayEnd, filterStart, filterEnd) => {
  const start = Math.max(stayStart.getTime(), filterStart.getTime())
  const end = Math.min(stayEnd.getTime(), filterEnd.getTime())
  if (end <= start) return 0
  return Math.ceil((end - start) / (1000 * 60 * 60 * 24))
}

/*
  Новая функция для расчёта "эффективного" количества дней проживания с учётом
  сокращённых дней (ранний заезд и поздний выезд).  
  Алгоритм:
  1. Вычисляем эффективное время заезда: max(реальное прибытие, начало фильтра).
  2. Вычисляем эффективное время выезда: min(реальный выезд, конец фильтра).
  3. Если эффективный заезд и выезд в один день, то стоимость дня определяется как max(коэффициент заезда, коэффициент выезда)
     (то есть, если один из них "сокращённый" – считается 0.5, но минимум оплачивается один день).
  4. Если дней несколько, то:
     – Первый день: коэффициент определяется по времени заезда (если между 06:00 и 14:00 – 0.5, иначе 1).
     – Последний день: коэффициент определяется по времени выезда (если между 12:00 и 18:00 – 0.5, иначе 1).
     – Между ними – полные дни.
*/
const calculateEffectiveCostDaysWithPartial = (
  arrival,
  departure,
  filterStart,
  filterEnd
) => {
  const effectiveArrival = arrival > filterStart ? arrival : filterStart
  const effectiveDeparture = departure < filterEnd ? departure : filterEnd
  if (effectiveDeparture <= effectiveArrival) return 0

  // Определяем "полуночь" для вычисления календарных дней
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
  // Если время заезда попадает в интервал 06:00-14:00, то первый день оплачивается как 0.5
  if (arrivalHours >= 6 && arrivalHours < 14) {
    arrivalFactor = 0.5
  }

  let departureFactor = 1
  const departureHours =
    effectiveDeparture.getHours() + effectiveDeparture.getMinutes() / 60
  // Если время выезда попадает в интервал 12:00-18:00, то последний день оплачивается как 0.5
  if (departureHours >= 12 && departureHours < 18) {
    departureFactor = 0.5
  }

  if (dayDifference === 0) {
    // Если заезд и выезд в один день – берем максимальный коэффициент
    return Math.max(arrivalFactor, departureFactor)
  } else {
    // Если дней несколько, то: первый день + (между ними целых дней) + последний день
    return arrivalFactor + (dayDifference - 1) + departureFactor
  }
}

/*
  Функция агрегирования для отчётов авиакомпаний.
  Здесь рассчитывается effectiveDays с учетом сокращённых дней.
*/
const aggregateReports = (requests, reportType, filterStart, filterEnd) => {
  return requests.map((request) => {
    const hotelChess = request.hotelChess?.[0] || {}
    const room = hotelChess.room || "Не указано"
    const startDate = hotelChess.start ? new Date(hotelChess.start) : null
    const endDate = hotelChess.end ? new Date(hotelChess.end) : null

    const fullDays =
      startDate && endDate ? calculateTotalDays(startDate, endDate) : 0
    // Здесь effectiveDays рассчитывается с учетом сокращённых дней (ранний заезд/поздний выезд)
    const effectiveDays =
      startDate && endDate
        ? calculateEffectiveCostDaysWithPartial(
            startDate,
            endDate,
            filterStart,
            filterEnd
          )
        : 0

    // Если питание задано итоговыми суммами – пропорциональное масштабирование
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
      request.airline?.MealPrice || request.hotel?.MealPrice || {}
    const breakfastCost = breakfastCount * (mealPrices.breakfast || 0)
    const lunchCost = lunchCount * (mealPrices.lunch || 0)
    const dinnerCost = dinnerCount * (mealPrices.dinner || 0)
    const totalMealCost = breakfastCost + lunchCost + dinnerCost

    // Используем effectiveDays для расчёта проживания
    const totalLivingCost = calculateLivingCost(
      request,
      reportType,
      effectiveDays
    )

    return {
      room,
      personName: request.person?.name || "Не указано",
      arrival: startDate ? startDate.toLocaleString("ru-RU") : "Не указано",
      departure: endDate ? endDate.toLocaleString("ru-RU") : "Не указано",
      totalDays: effectiveDays,
      breakfastCount,
      lunchCount,
      dinnerCount,
      breakfastCost,
      lunchCost,
      dinnerCost,
      totalMealCost: totalMealCost || 0,
      totalLivingCost: totalLivingCost || 0,
      totalDebt: (totalLivingCost || 0) + (totalMealCost || 0)
    }
  })
}

/*
  Функция расчёта стоимости проживания по количеству дней.
  Теперь в качестве параметра передаётся effectiveDays (может быть дробным).
*/
const calculateLivingCost = (request, type, days) => {
  const roomCategory = request.roomCategory
  const priceMapping = {
    airline: {
      onePlace: request.airline?.priceOneCategory || 0,
      twoPlace: request.airline?.priceTwoCategory || 0,
      threePlace: request.airline?.priceThreeCategory || 0,
      fourPlace: request.airline?.priceFourCategory || 0,
      fivePlace: request.airline?.priceFiveCategory || 0,
      sixPlace: request.airline?.priceSixCategory || 0,
      sevenPlace: request.airline?.priceSevenCategory || 0,
      eightPlace: request.airline?.priceEightCategory || 0,
      ninePlace: request.airline?.priceNineCategory || 0,
      tenPlace: request.airline?.priceTenCategory || 0
    },
    hotel: {
      onePlace: request.hotel?.priceOneCategory || 0,
      twoPlace: request.hotel?.priceTwoCategory || 0,
      threePlace: request.hotel?.priceThreeCategory || 0,
      fourPlace: request.hotel?.priceFourCategory || 0,
      fivePlace: request.hotel?.priceFiveCategory || 0,
      sixPlace: request.hotel?.priceSixCategory || 0,
      sevenPlace: request.hotel?.priceSevenCategory || 0,
      eightPlace: request.hotel?.priceEightCategory || 0,
      ninePlace: request.hotel?.priceNineCategory || 0,
      tenPlace: request.hotel?.priceTenCategory || 0
    }
  }

  const pricePerDay = priceMapping[type]?.[roomCategory] || 0
  return days > 0 ? days * pricePerDay : 0
}

export default reportResolver

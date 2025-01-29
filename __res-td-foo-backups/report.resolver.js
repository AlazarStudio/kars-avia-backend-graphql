import {
  generatePDF,
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
import { report } from "process"
import { console } from "inspector"

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
            ? { airlineId: filter.airlineId } // Если передан airlineId, используем его
            : user.role === "SUPERADMIN" || user.role === "DISPATCHERADMIN"
            ? {} // Для администраторов - полный доступ
            : { airlineId: user.airlineId }) // Для остальных - фильтрация по airlineId пользователя
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
            ? { hotelId: filter.hotelId } // Если передан hotelId, используем его
            : user.role === "SUPERADMIN" || user.role === "DISPATCHERADMIN"
            ? {} // Для администраторов - полный доступ
            : { hotelId: user.hotelId }) // Для остальных - фильтрация по hotelId пользователя
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
    // Мутация для создания нового отчёта для авиакомпании
    createAirlineReport: async (_, { input }, context) => {
      const { user } = context
      airlineAdminMiddleware(context)
      const { filter, format } = input

      if (!user) {
        throw new Error("Access denied")
      }

      const startDate = new Date(filter.startDate).toISOString().slice(0, 10) // Преобразуем в YYYY-MM-DD
      const endDate = new Date(filter.endDate).toISOString().slice(0, 10) // Преобразуем в YYYY-MM-DD

      // Получаем запросы для формирования отчёта
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
      const reportData = aggregateReports(requests, "airline")

      const reportName = `airline_report-${name}_${startDate}-${endDate}_${Date.now()}.${format}`
      const reportPath = path.resolve(`./reports/${reportName}`)
      fs.mkdirSync(path.dirname(reportPath), { recursive: true })

      // Генерация отчёта
      if (format === "pdf") {
        await generatePDF(reportData, reportPath)
      } else if (format === "xlsx") {
        await generateExcelAvia(reportData, reportPath)
      } else {
        throw new Error("Unsupported report format")
      }

      // Создание записи отчёта
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

    // Мутация для создания нового отчёта для отелей
    createHotelReport: async (_, { input }, context) => {
      const { user } = context
      hotelAdminMiddleware(context)
      const { filter, format } = input

      if (!user) {
        throw new Error("Access denied")
      }

      const startDate = new Date(filter.startDate).toISOString().slice(0, 10) // Преобразуем в YYYY-MM-DD
      const endDate = new Date(filter.endDate).toISOString().slice(0, 10) // Преобразуем в YYYY-MM-DD

      // Получаем данные отеля
      const hotel = await prisma.hotel.findUnique({
        where: { id: filter.hotelId },
        select: {
          name: true,
          priceOneCategory: true,
          priceTwoCategory: true,
          priceThreeCategory: true,
          priceFourCategory: true,
          priceFiveCategory: true,
          priceSixCategory: true,
          priceSevenCategory: true,
          priceEightCategory: true,
          priceNineCategory: true,
          priceTenCategory: true,
          hotelChesses: {
            select: {
              room: true,
              start: true,
              end: true
            }
          }
        }
      })

      if (!hotel) {
        throw new Error("Hotel not found")
      }

      // Получаем список комнат отеля
      const rooms = await prisma.room.findMany({
        where: {
          hotelId: filter.hotelId,
          reserve: false // Исключаем комнаты, у которых reserve = true
        }
      })

      // Создаём развёрнутый отчёт по каждому дню
      const reportData = []

      rooms.forEach((room) => {
        const roomChesses = hotel.hotelChesses.filter(
          (chess) => chess.room === room.name
        )

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

        const dailyPrice = categoryPrices[room.category] || 0

        // Генерация данных по каждому дню
        let currentDate = new Date(startDate)
        const endDateObj = new Date(endDate)

        while (currentDate <= endDateObj) {
          const currentDateString = currentDate.toISOString().slice(0, 10)

          // Проверяем, занята ли комната в текущий день
          const isOccupied = roomChesses.some((chess) => {
            const chessStart = new Date(chess.start).toISOString().slice(0, 10)
            const chessEnd = new Date(chess.end).toISOString().slice(0, 10)
            return (
              chessStart <= currentDateString && chessEnd >= currentDateString
            )
          })

          const cost = isOccupied ? dailyPrice : dailyPrice / 2

          reportData.push({
            date: currentDateString,
            roomName: room.name,
            category: room.category,
            isOccupied,
            dailyPrice: cost
          })

          currentDate.setDate(currentDate.getDate() + 1) // Переход к следующему дню
        }
      })

      // Генерация имени и пути отчёта
      const reportName = `hotel_report-${
        hotel.name
      }_${startDate}-${endDate}_${Date.now()}.${format}`
      const reportPath = path.resolve(`./reports/${reportName}`)
      fs.mkdirSync(path.dirname(reportPath), { recursive: true })

      // Генерация отчёта в зависимости от формата
      if (format === "pdf") {
        await generatePDF(reportData, reportPath)
      } else if (format === "xlsx") {
        await generateExcelHotel(reportData, reportPath)
      } else {
        throw new Error("Unsupported report format")
      }

      // Сохраняем запись отчёта в базе данных
      const reportRecord = {
        name: reportName,
        url: `/reports/${reportName}`,
        startDate: new Date(filter.startDate),
        endDate: new Date(filter.endDate),
        createdAt: new Date(),
        hotelId: user.role === "HOTELADMIN" ? user.hotelId : filter.hotelId
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

const applyCreateFilters = (filter) => {
  const { startDate, endDate, archived, personId, hotelId, airlineId } = filter
  const where = {}

  if (startDate) where.arrival = { gte: new Date(startDate) } // 199
  if (endDate) where.departure = { lte: new Date(endDate) } // 200
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

// Агрегация данных
const aggregateReports = (requests, reportType) => {
  return requests.map((request) => {
    const hotelChess = request.hotelChess?.[0] || {} // Берем первый объект из массива
    const room = hotelChess.room || "Не указано"
    const startDate = hotelChess.start ? new Date(hotelChess.start) : null
    const endDate = hotelChess.end ? new Date(hotelChess.end) : null

    const arrival = startDate ? startDate.toLocaleString("ru-RU") : "Не указано"
    const departure = endDate ? endDate.toLocaleString("ru-RU") : "Не указано"

    const totalDays =
      startDate && endDate ? calculateTotalDays(startDate, endDate) : 0

    const mealPlan = request.mealPlan || {}
    const mealPrices =
      request.airline?.MealPrice || request.hotel?.MealPrice || {}

    const breakfastCount = mealPlan.breakfast || 0
    const lunchCount = mealPlan.lunch || 0
    const dinnerCount = mealPlan.dinner || 0

    const breakfastCost = breakfastCount * (mealPrices.breakfast || 0)
    const lunchCost = lunchCount * (mealPrices.lunch || 0)
    const dinnerCost = dinnerCount * (mealPrices.dinner || 0)

    const totalMealCost = breakfastCost + lunchCost + dinnerCost
    const totalLivingCost = calculateLivingCost(request, reportType)

    return {
      room,
      personName: request.person?.name || "Не указано",
      arrival,
      departure,
      totalDays,
      breakfastCount,
      lunchCount,
      dinnerCount,
      breakfastCost,
      lunchCost,
      dinnerCost,
      totalMealCost,
      totalLivingCost,
      totalDebt: totalLivingCost + totalMealCost
    }
  })
}

const calculateTotalDays = (start, end) => {
  if (!start || !end) return 0
  const differenceInMilliseconds = new Date(end) - new Date(start)
  return Math.ceil(differenceInMilliseconds / (1000 * 60 * 60 * 24))
}

const calculateLivingCost = (request, type) => {
  const startDate = request.arrival
  const endDate = request.departure
  const roomCategory = request.roomCategory

  // Маппинг цен по категориям для каждого типа
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

  // Получаем цену за день
  const pricePerDay = priceMapping[type]?.[roomCategory] || 0

  // Проверяем наличие данных
  if (!startDate || !endDate || pricePerDay === 0) {
    return 0 // Если данных нет, возвращаем 0
  }

  // Вычисляем разницу в днях
  const differenceInMilliseconds = new Date(endDate) - new Date(startDate)
  const days = Math.ceil(differenceInMilliseconds / (1000 * 60 * 60 * 24)) // Округляем вверх до целого числа

  // Возвращаем итоговую стоимость проживания
  return days > 0 ? days * pricePerDay : 0 // Убеждаемся, что дни положительные
}

const calculateDaysInRange = (startDate, endDate) => {
  const start = new Date(startDate)
  const end = new Date(endDate)
  const differenceInMilliseconds = end - start
  return Math.ceil(differenceInMilliseconds / (1000 * 60 * 60 * 24)) + 1 // Включая последний день
}

// Расчёт стоимости питания
const calculateMealCost = (request, type) => {
  const mealPlan = request.mealPlan || {}
  let mealPrices = {}

  if (type === "airline") {
    mealPrices = request.airline?.MealPrice || {}
  } else if (type === "hotel") {
    mealPrices = request.hotel?.MealPrice || {}
  }

  const breakfastCost = (mealPlan.breakfast || 0) * (mealPrices.breakfast || 0)
  const lunchCost = (mealPlan.lunch || 0) * (mealPrices.lunch || 0)
  const dinnerCost = (mealPlan.dinner || 0) * (mealPrices.dinner || 0)

  return breakfastCost + lunchCost + dinnerCost
}

export default reportResolver

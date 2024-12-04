import { generateExcel, generatePDF } from "../../exports/exporter.js"
import { prisma } from "../../prisma.js"
import path from "path"
import fs from "fs"

const reportResolver = {
  Query: {
    // Отчёт для авиакомпаний
    getAirlineReport: async (_, { filter }) => {
      const requests = await prisma.request.findMany({
        where: applyFilters(filter),
        include: { person: true, hotelChess: true, hotel: true, airline: true }
      })
      // console.log("Результат запросов: ", JSON.stringify(requests, null, 2))
      return aggregateReports(requests, "airline")
    },
    // Отчёт для отелей
    getHotelReport: async (_, { filter }) => {
      const requests = await prisma.request.findMany({
        where: applyFilters(filter),
        include: { person: true, hotelChess: true, hotel: true, airline: true }
      })
      // console.log("Результат запросов: ", JSON.stringify(requests, null, 2))
      return aggregateReports(requests, "hotel")
    }
  },
  Mutation: {
    // Мутация для создания нового отчёта
    createReport: async (_, { input }) => {
      const { filter, type, format } = input

      // Получаем данные отчёта
      const requests = await prisma.request.findMany({
        where: applyFilters(filter),
        include: { person: true, hotelChess: true, hotel: true, airline: true }
      })

      const reportData = aggregateReports(requests, type)

      // Генерируем отчёт
      const reportName = `${type}_report_${Date.now()}.${format}`
      const reportPath = path.resolve(`./reports/${reportName}`)
      fs.mkdirSync(path.dirname(reportPath), { recursive: true })

      if (format === "pdf") {
        await generatePDF(reportData, reportPath)
      } else if (format === "xlsx") {
        await generateExcel(reportData, reportPath)
      } else {
        throw new Error("Unsupported report format")
      }

      // Сохраняем информацию о файле в базе данных
      const savedReport = await prisma.savedReport.create({
        data: {
          name: reportName,
          url: `/reports/${reportName}`, // Путь для загрузки
          createdAt: new Date()
        }
      })

      return {
        id: savedReport.id,
        name: savedReport.name,
        url: savedReport.url,
        createdAt: savedReport.createdAt
      }
    }
  }
}

const applyFilters = (filter) => {
  const { startDate, endDate, archived, personId, hotelId, airlineId } = filter
  const where = {}

  if (startDate) where.createdAt = { gte: new Date(startDate) }
  if (endDate) where.createdAt = { lte: new Date(endDate) }
  if (archived !== undefined) where.archive = archived
  if (personId) where.personId = personId
  if (hotelId) where.hotelId = hotelId
  if (airlineId) where.airlineId = airlineId

  return where
}

// Агрегация данных
const aggregateReports = (requests, reportType) => {
  return requests.map((request) => {
    const room = request.hotelChess?.room || "Не указано"
    const totalLivingCost = calculateLivingCost(request, reportType)
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

    return {
      room,
      personName: request.person?.name || "Не указано",
      arrival: request.hotelChess?.start
        ? new Date(request.hotelChess.start).toLocaleString()
        : "Не указано",
      departure: request.hotelChess?.end
        ? new Date(request.hotelChess.end).toLocaleString()
        : "Не указано",
      totalDays: calculateTotalDays(
        request.hotelChess?.start,
        request.hotelChess?.end
      ),
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


// Расчёт стоимости проживания
const calculateLivingCost = (request, type) => {
  const startDate = request.hotelChess?.start
  const endDate = request.hotelChess?.end
  let pricePerDay
  if (type === "airline") {
    pricePerDay = request.airline?.priceOneCategory || 0
  } else if (type === "hotel") {
    pricePerDay = request.hotel?.priceOneCategory || 0
  }
  if (!startDate || !endDate || pricePerDay === 0) {
    return 0 // Если данных нет, возвращаем 0
  }
  // Разница в миллисекундах между началом и концом
  const differenceInMilliseconds = new Date(endDate) - new Date(startDate)
  // Количество дней (целое значение)
  const days = Math.ceil(differenceInMilliseconds / (1000 * 60 * 60 * 24)) // Округляем в большую сторону
  return days > 0 ? days * pricePerDay : 0 // Убедимся, что дни положительные
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

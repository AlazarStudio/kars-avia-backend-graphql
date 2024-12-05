import { generateExcel, generatePDF } from "../../exports/exporter.js"
import { prisma } from "../../prisma.js"
import path from "path"
import fs from "fs"
import {
  adminMiddleware,
  airlineAdminMiddleware,
  hotelAdminMiddleware
} from "../../middlewares/authMiddleware.js"
import { report } from "process"

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
        include: { airline: true } // Включаем связь с авиакомпанией
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
            airline: report.airline // Возвращаем связанную авиакомпанию
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
        include: { hotel: true } // Включаем связь с отелем
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
            hotel: report.hotel // Возвращаем связанный отель
          }))
        }
      ]
    }
  },
  Mutation: {
    // Мутация для создания нового отчёта
    createReport: async (_, { input }, context) => {
      const { user } = context
      const { filter, type, format } = input

      if (!user) {
        throw new Error("Access denied")
      }

      // Получаем запросы для формирования отчёта
      const requests = await prisma.request.findMany({
        where: applyFilters(filter),
        include: { person: true, hotelChess: true, hotel: true, airline: true }
      })

      const reportData = aggregateReports(requests, type)
      const reportName = `${type}_report_${Date.now()}.${format}`
      const reportPath = path.resolve(`./reports/${reportName}`)
      fs.mkdirSync(path.dirname(reportPath), { recursive: true })

      // Генерация отчёта
      if (format === "pdf") {
        await generatePDF(reportData, reportPath)
      } else if (format === "xlsx") {
        await generateExcel(reportData, reportPath)
      } else {
        throw new Error("Unsupported report format")
      }

      // Создание записи отчёта
      const reportRecord = {
        name: reportName,
        url: `/reports/${reportName}`,
        startDate: new Date(filter.startDate), // Добавляем startDate
        endDate: new Date(filter.endDate), // Добавляем endDate
        createdAt: new Date()
      }

      // Логика для разных ролей
      if (user.role === "AIRLINEADMIN") {
        reportRecord.airlineId = user.airlineId
      } else if (user.role === "HOTELADMIN") {
        reportRecord.hotelId = user.hotelId
      } else if (
        user.role === "SUPERADMIN" ||
        user.role === "DISPATCHERADMIN"
      ) {
        // Если SUPERADMIN или DISPATCHERADMIN, добавляем данные из фильтра
        if (type === "airline" && filter.airlineId) {
          reportRecord.airlineId = filter.airlineId
        } else if (type === "hotel" && filter.hotelId) {
          reportRecord.hotelId = filter.hotelId
        } else {
          throw new Error(
            "For SUPERADMIN/DISPATCHERADMIN, either airlineId or hotelId must be provided in the filter based on the report type."
          )
        }
      }

      // Сохранение отчёта
      const savedReport = await prisma.savedReport.create({
        data: reportRecord
      })

      return savedReport
    }
  }
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

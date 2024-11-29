import { prisma } from "../../prisma.js"

const reportResolver = {
  Query: {
    // Отчёт для диспетчера
    getDispatcherReport: async (_, { filter }) => {
      const requests = await prisma.request.findMany({
        where: applyFilters(filter),
        include: { person: true, hotelChess: true, hotel: true, airline: true }
      })
      console.log("Результат запросов: ", JSON.stringify(requests, null, 2))
      return aggregateReports(requests, "dispatcher")
    },

    // Отчёт для авиакомпаний
    getAirlineReport: async (_, { filter }) => {
      const requests = await prisma.request.findMany({
        where: applyFilters(filter),
        include: { person: true, hotelChess: true, hotel: true, airline: true }
      })
      console.log("Результат запросов: ", JSON.stringify(requests, null, 2))
      return aggregateReports(requests, "airline")
    },

    // Отчёт для отелей
    getHotelReport: async (_, { filter }) => {
      const requests = await prisma.request.findMany({
        where: applyFilters(filter),
        include: { person: true, hotelChess: true, hotel: true, airline: true }
      })
      console.log("Результат запросов: ", JSON.stringify(requests, null, 2))
      return aggregateReports(requests, "hotel")
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
    const totalLivingCost = calculateLivingCost(request)
    const totalMealCost = calculateMealCost(request)
    const totalDispatcherFee = calculateDispatcherFee(request)

    if (reportType === "dispatcher") {
      return {
        airlineName: request.airline?.name || "Не указано",
        hotelName: request.hotel?.name || "Не указано",
        personName: request.person?.name || "Не указано",
        totalLivingCost,
        totalMealCost,
        totalDispatcherFee,
        balance: totalDispatcherFee - (totalLivingCost + totalMealCost)
      }
    } else if (reportType === "airline") {
      return {
        airlineName: request.airline?.name || "Не указано",
        personName: request.person?.name || "Не указано",
        totalDispatcherFee,
        debtToDispatcher: totalDispatcherFee
      }
    } else if (reportType === "hotel") {
      return {
        hotelName: request.hotel?.name || "Не указано",
        personName: request.person?.name || "Не указано",
        totalLivingCost,
        totalMealCost,
        totalDebt: totalLivingCost + totalMealCost
      }
    }
  })
}

// Расчёт стоимости проживания
const calculateLivingCost = (request) => {
  const startDate = request.hotelChess?.start
  const endDate = request.hotelChess?.end
  const pricePerDay = request.airline?.priceOneCategory || 0

  if (!startDate || !endDate || pricePerDay === 0) {
    return 0 // Если данных нет, возвращаем 0
  }

  const days = (new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24)

  return days > 0 ? days * pricePerDay : 0 // Убедимся, что дни положительные
}

// Расчёт стоимости питания
const calculateMealCost = (request) => {
  const mealPlan = request.mealPlan || {}
  const mealPrices = request.hotel?.MealPrice || {}

  const breakfastCost = (mealPlan.breakfast || 0) * (mealPrices.breakfast || 0)
  const lunchCost = (mealPlan.lunch || 0) * (mealPrices.lunch || 0)
  const dinnerCost = (mealPlan.dinner || 0) * (mealPrices.dinner || 0)

  return breakfastCost + lunchCost + dinnerCost
}

// Расчёт диспетчерских сборов
const calculateDispatcherFee = (request) => {
  const startDate = request.hotelChess?.start
  const endDate = request.hotelChess?.end
  const pricePerDay = request.hotel?.priceOneCategory || 0

  if (!startDate || !endDate || pricePerDay === 0) {
    return 0 // Если данных нет, возвращаем 0
  }

  const days = (new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24)

  return days > 0 ? days * pricePerDay : 0 // Убедимся, что дни положительные
  
  // return request.airline?.priceOneCategory || 0 // Если данных нет, возвращаем 0
}

// Пример функции фильтрации по отелю и авиакомпании
const filterByHotelAndAirline = (requests, hotelId, airlineId) => {
  return requests.filter(
    (request) =>
      (!hotelId || request.hotelId === hotelId) &&
      (!airlineId || request.airlineId === airlineId)
  )
}

export default reportResolver

import { prisma } from "../../prisma.js"

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
    const totalLivingCost = calculateLivingCost(request, reportType)
    const totalMealCost = calculateMealCost(request, reportType)
    if (reportType === "airline") {
      return {
        airlineName: request.airline?.name || "Не указано",
        personName: request.person?.name || "Не указано",
        totalLivingCost,
        totalMealCost,
        totalDebt: totalLivingCost + totalMealCost
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
const calculateLivingCost = (request, type) => {
  const startDate = request.hotelChess?.start;
  const endDate = request.hotelChess?.end;

  let pricePerDay;
  if (type === "airline") {
    pricePerDay = request.airline?.priceOneCategory || 0;
  } else if (type === "hotel") {
    pricePerDay = request.hotel?.priceOneCategory || 0;
  }

  if (!startDate || !endDate || pricePerDay === 0) {
    return 0; // Если данных нет, возвращаем 0
  }

  // Разница в миллисекундах между началом и концом
  const differenceInMilliseconds = new Date(endDate) - new Date(startDate);

  // Количество дней (целое значение)
  const days = Math.ceil(differenceInMilliseconds / (1000 * 60 * 60 * 24)); // Округляем в большую сторону

  return days > 0 ? days * pricePerDay : 0; // Убедимся, что дни положительные
};


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

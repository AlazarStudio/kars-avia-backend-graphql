import { prisma } from "../prisma.js"

// Применение фильтров
const applyFilters = (filter) => {
  const { startDate, endDate, archived, personId } = filter
  const where = {}

  if (startDate) where.createdAt = { gte: new Date(startDate) }
  if (endDate) where.createdAt = { lte: new Date(endDate) }
  if (archived !== undefined) where.archive = archived
  if (personId) where.personId = personId

  return where
}

// Расчёт стоимости проживания
const calculateLivingCost = (request) => {
  const days =
    (new Date(request.departure) - new Date(request.arrival)) /
    (1000 * 60 * 60 * 24)
  return days * request.hotel.priceOneCategory // Пример
}

// Расчёт стоимости питания
const calculateMealCost = (request) => {
  const meals = request.mealPlan || { breakfast: 0, lunch: 0, dinner: 0 }
  return meals.breakfast + meals.lunch + meals.dinner
}

// Расчёт диспетчерских сборов
const calculateDispatcherFee = (request) => {
  return request.airline.priceOneCategory || 0 // Пример
}

export {
  applyFilters,
  calculateLivingCost,
  calculateMealCost,
  calculateDispatcherFee
}

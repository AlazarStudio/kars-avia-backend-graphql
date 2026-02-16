import { prisma } from "../../prisma.js"

const updateDailyMeals = async (requestId, dailyMealsUpdates, newEndDate) => {
  const request = await prisma.request.findUnique({
    where: { id: requestId },
    select: { mealPlan: true }
  })

  if (!request || !request.mealPlan) {
    throw new Error("Meal plan not found for this request.")
  }

  const {
    dailyMeals,
    breakfast,
    lunch,
    dinner,
    included,
    breakfastEnabled,
    lunchEnabled,
    dinnerEnabled
  } = request.mealPlan

  // Удаление дней после новой конечной даты (только если newEndDate передан)
  let filteredDailyMeals = dailyMeals || []
  if (newEndDate) {
    filteredDailyMeals = filteredDailyMeals.filter(
      (day) => new Date(day.date) <= newEndDate
    )
  }

  // Обновление или добавление данных на определенные даты
  const updatedDailyMeals = filteredDailyMeals.map((day) => {
    const updateForDay = dailyMealsUpdates.find(
      (update) => update.date === day.date
    )

    if (updateForDay) {
      return {
        ...day,
        breakfast: updateForDay.breakfast ?? day.breakfast,
        lunch: updateForDay.lunch ?? day.lunch,
        dinner: updateForDay.dinner ?? day.dinner
      }
    }
    return day
  })

  dailyMealsUpdates.forEach((update) => {
    if (!updatedDailyMeals.find((day) => day.date === update.date)) {
      updatedDailyMeals.push(update)
    }
  })

  const newBreakfastTotal = updatedDailyMeals.reduce(
    (sum, day) => sum + (day.breakfast || 0),
    0
  )
  const newLunchTotal = updatedDailyMeals.reduce(
    (sum, day) => sum + (day.lunch || 0),
    0
  )
  const newDinnerTotal = updatedDailyMeals.reduce(
    (sum, day) => sum + (day.dinner || 0),
    0
  )

  const updatedMealPlan = {
    included: included ?? true,
    breakfastEnabled: breakfastEnabled ?? false,
    breakfast: newBreakfastTotal,
    lunchEnabled: lunchEnabled ?? false,
    lunch: newLunchTotal,
    dinnerEnabled: dinnerEnabled ?? false,
    dinner: newDinnerTotal,
    dailyMeals: updatedDailyMeals
  }

  await prisma.request.update({
    where: { id: requestId },
    data: { mealPlan: updatedMealPlan }
  })

  return updatedMealPlan
}

export default updateDailyMeals

const calculateMeal = (arrivalTime, departureTime, mealTimes) => {
  const mealPlan = {
    totalBreakfast: 0,
    totalLunch: 0,
    totalDinner: 0,
    dailyMeals: [] // Обязательно массив!
  }

  // Приводим время заезда и выезда к типу Date
  const arrivalDate = new Date(arrivalTime)
  const departureDate = new Date(departureTime)

  // Начинаем с начала дня заезда (00:00:00 UTC)
  let currentDate = new Date(
    Date.UTC(
      arrivalDate.getUTCFullYear(),
      arrivalDate.getUTCMonth(),
      arrivalDate.getUTCDate()
    )
  )

  // Определяем конечную дату как начало дня выезда
  const endDate = new Date(
    Date.UTC(
      departureDate.getUTCFullYear(),
      departureDate.getUTCMonth(),
      departureDate.getUTCDate()
    )
  )

  while (currentDate <= endDate) {
    // Формируем дату в виде "YYYY-MM-DDT00:00:00.000Z"
    const dateString = currentDate.toISOString()
    const dailyMeal = { date: dateString, breakfast: 0, lunch: 0, dinner: 0 }

    // Рассчитываем завтрак
    const [breakfastStartHour, breakfastStartMinute] = mealTimes.breakfast.start
      .split(":")
      .map(Number)
    const [breakfastEndHour, breakfastEndMinute] = mealTimes.breakfast.end
      .split(":")
      .map(Number)
    const breakfastStart = new Date(currentDate)
    breakfastStart.setUTCHours(breakfastStartHour, breakfastStartMinute, 0, 0)
    const breakfastEnd = new Date(currentDate)
    breakfastEnd.setUTCHours(breakfastEndHour, breakfastEndMinute, 0, 0)
    if (arrivalDate <= breakfastEnd && departureDate >= breakfastStart) {
      dailyMeal.breakfast = 1
    }

    // Рассчитываем обед
    const [lunchStartHour, lunchStartMinute] = mealTimes.lunch.start
      .split(":")
      .map(Number)
    const [lunchEndHour, lunchEndMinute] = mealTimes.lunch.end
      .split(":")
      .map(Number)
    const lunchStart = new Date(currentDate)
    lunchStart.setUTCHours(lunchStartHour, lunchStartMinute, 0, 0)
    const lunchEnd = new Date(currentDate)
    lunchEnd.setUTCHours(lunchEndHour, lunchEndMinute, 0, 0)
    if (arrivalDate <= lunchEnd && departureDate >= lunchStart) {
      dailyMeal.lunch = 1
    }

    // Рассчитываем ужин
    const [dinnerStartHour, dinnerStartMinute] = mealTimes.dinner.start
      .split(":")
      .map(Number)
    const [dinnerEndHour, dinnerEndMinute] = mealTimes.dinner.end
      .split(":")
      .map(Number)
    const dinnerStart = new Date(currentDate)
    dinnerStart.setUTCHours(dinnerStartHour, dinnerStartMinute, 0, 0)
    const dinnerEnd = new Date(currentDate)
    dinnerEnd.setUTCHours(dinnerEndHour, dinnerEndMinute, 0, 0)
    if (arrivalDate <= dinnerEnd && departureDate >= dinnerStart) {
      dailyMeal.dinner = 1
    }

    mealPlan.totalBreakfast += dailyMeal.breakfast
    mealPlan.totalLunch += dailyMeal.lunch
    mealPlan.totalDinner += dailyMeal.dinner
    mealPlan.dailyMeals.push(dailyMeal)

    // Переходим к следующему дню
    currentDate.setUTCDate(currentDate.getUTCDate() + 1)
  }

  return mealPlan
}

export default calculateMeal

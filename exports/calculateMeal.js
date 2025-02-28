const calculateMeal = (arrivalTime, departureTime, mealTimes, enabledMeals) => {
  const mealPlan = {
    totalBreakfast: 0,
    totalLunch: 0,
    totalDinner: 0,
    dailyMeals: [] // Обязательно массив!
  }

  const arrivalDate = new Date(arrivalTime)
  const departureDate = new Date(departureTime)
  let currentDate = new Date(
    Date.UTC(
      arrivalDate.getUTCFullYear(),
      arrivalDate.getUTCMonth(),
      arrivalDate.getUTCDate()
    )
  )
  const endDate = new Date(
    Date.UTC(
      departureDate.getUTCFullYear(),
      departureDate.getUTCMonth(),
      departureDate.getUTCDate()
    )
  )

  while (currentDate <= endDate) {
    const dateString = currentDate.toISOString()
    const dailyMeal = { date: dateString, breakfast: 0, lunch: 0, dinner: 0 }

    // Рассчитываем завтрак, только если включён
    if (enabledMeals.breakfast) {
      const [bStartHour, bStartMin] = mealTimes.breakfast.start
        .split(":")
        .map(Number)
      const [bEndHour, bEndMin] = mealTimes.breakfast.end.split(":").map(Number)
      const breakfastStart = new Date(currentDate)
      breakfastStart.setUTCHours(bStartHour, bStartMin, 0, 0)
      const breakfastEnd = new Date(currentDate)
      breakfastEnd.setUTCHours(bEndHour, bEndMin, 0, 0)
      if (arrivalDate <= breakfastEnd && departureDate >= breakfastStart) {
        dailyMeal.breakfast = 1
      }
    }

    // Рассчитываем обед, только если включён
    if (enabledMeals.lunch) {
      const [lStartHour, lStartMin] = mealTimes.lunch.start
        .split(":")
        .map(Number)
      const [lEndHour, lEndMin] = mealTimes.lunch.end.split(":").map(Number)
      const lunchStart = new Date(currentDate)
      lunchStart.setUTCHours(lStartHour, lStartMin, 0, 0)
      const lunchEnd = new Date(currentDate)
      lunchEnd.setUTCHours(lEndHour, lEndMin, 0, 0)
      if (arrivalDate <= lunchEnd && departureDate >= lunchStart) {
        dailyMeal.lunch = 1
      }
    }

    // Рассчитываем ужин, только если включён
    if (enabledMeals.dinner) {
      const [dStartHour, dStartMin] = mealTimes.dinner.start
        .split(":")
        .map(Number)
      const [dEndHour, dEndMin] = mealTimes.dinner.end.split(":").map(Number)
      const dinnerStart = new Date(currentDate)
      dinnerStart.setUTCHours(dStartHour, dStartMin, 0, 0)
      const dinnerEnd = new Date(currentDate)
      dinnerEnd.setUTCHours(dEndHour, dEndMin, 0, 0)
      if (arrivalDate <= dinnerEnd && departureDate >= dinnerStart) {
        dailyMeal.dinner = 1
      }
    }

    mealPlan.totalBreakfast += dailyMeal.breakfast
    mealPlan.totalLunch += dailyMeal.lunch
    mealPlan.totalDinner += dailyMeal.dinner
    mealPlan.dailyMeals.push(dailyMeal)
    currentDate.setUTCDate(currentDate.getUTCDate() + 1)
  }
  return mealPlan
}

export default calculateMeal

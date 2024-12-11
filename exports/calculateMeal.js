
const calculateMeal = (arrivalTime, departureTime, mealTimes) => {
  const mealPlan = {
    totalBreakfast: 0,
    totalLunch: 0,
    totalDinner: 0,
    dailyMeals: []
  }

  // Преобразуем время в объекты Date
  const arrivalDate = new Date(arrivalTime)
  const departureDate = new Date(departureTime)

  // Копируем дату прибытия для начала цикла
  const currentDate = new Date(arrivalDate)

  while (currentDate <= departureDate) {
    const dateString = currentDate.toISOString().split("T")[0]
    const dailyMeal = { date: dateString, breakfast: 0, lunch: 0, dinner: 0 }

    // Разбор времени завтрака
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

    // Проверка попадания времени завтрака
    if (arrivalDate <= breakfastEnd && departureDate >= breakfastStart) {
      dailyMeal.breakfast = 1
    }

    // Разбор времени обеда
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

    // Проверка попадания времени обеда
    if (arrivalDate <= lunchEnd && departureDate >= lunchStart) {
      dailyMeal.lunch = 1
    }

    // Разбор времени ужина
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

    // Проверка попадания времени ужина
    if (arrivalDate <= dinnerEnd && departureDate >= dinnerStart) {
      dailyMeal.dinner = 1
    }

    // Обновляем общее количество приемов пищи
    mealPlan.totalBreakfast += dailyMeal.breakfast
    mealPlan.totalLunch += dailyMeal.lunch
    mealPlan.totalDinner += dailyMeal.dinner

    // Добавляем информацию о текущем дне
    mealPlan.dailyMeals.push(dailyMeal)

    // Переход к следующему дню
    currentDate.setUTCDate(currentDate.getUTCDate() + 1)

    // console.log(
    //   "breakfastStart - ", breakfastStart,
    //   "breakfastEnd - ", breakfastEnd,
    //   "lunchStart - ", lunchStart,
    //   "lunchEnd - ", lunchEnd,
    //   "dinnerStart - ", dinnerStart,
    //   "dinnerEnd - ", dinnerEnd,
    // )
  }

  return mealPlan
}

export default calculateMeal

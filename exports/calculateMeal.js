const calculateMeal = (arrivalTime, departureTime, mealTimes) => {
  const mealPlan = {
    totalBreakfast: 0,
    totalLunch: 0,
    totalDinner: 0,
    dailyMeals: []
  }

  // Преобразуем время в объекты Date
  const arrivalDate = new Date(arrivalTime * 1000) // Из секунд в миллисекунды
  const departureDate = new Date(departureTime * 1000) // Из секунд в миллисекунды

  // Копируем дату прибытия для начала цикла
  const currentDate = new Date(arrivalDate)

  while (currentDate <= departureDate) {
    const dateString = currentDate.toISOString().split("T")[0]
    const dailyMeal = { date: dateString, breakfast: 0, lunch: 0, dinner: 0 }

    // Проверяем завтрак
    const breakfastStart = new Date(currentDate)
    breakfastStart.setHours(
      parseInt(mealTimes.breakfast.start.split(":")[0]),
      parseInt(mealTimes.breakfast.start.split(":")[1])
    )
    const breakfastEnd = new Date(currentDate)
    breakfastEnd.setHours(
      parseInt(mealTimes.breakfast.end.split(":")[0]),
      parseInt(mealTimes.breakfast.end.split(":")[1])
    )

    if (
      (arrivalDate <= breakfastEnd && currentDate > arrivalDate) ||
      (currentDate.getTime() === arrivalDate.getTime() &&
        arrivalDate <= breakfastEnd)
    ) {
      dailyMeal.breakfast = 1 // Можно получить завтрак
    }

    // Проверяем обед
    const lunchStart = new Date(currentDate)
    lunchStart.setHours(
      parseInt(mealTimes.lunch.start.split(":")[0]),
      parseInt(mealTimes.lunch.start.split(":")[1])
    )
    const lunchEnd = new Date(currentDate)
    lunchEnd.setHours(
      parseInt(mealTimes.lunch.end.split(":")[0]),
      parseInt(mealTimes.lunch.end.split(":")[1])
    )

    if (
      (arrivalDate <= lunchEnd && currentDate > arrivalDate) ||
      (currentDate.getTime() === arrivalDate.getTime() &&
        arrivalDate <= lunchEnd)
    ) {
      dailyMeal.lunch = 1 // Можно получить обед
    }

    // Проверяем ужин
    const dinnerStart = new Date(currentDate)
    dinnerStart.setHours(
      parseInt(mealTimes.dinner.start.split(":")[0]),
      parseInt(mealTimes.dinner.start.split(":")[1])
    )
    const dinnerEnd = new Date(currentDate)
    dinnerEnd.setHours(
      parseInt(mealTimes.dinner.end.split(":")[0]),
      parseInt(mealTimes.dinner.end.split(":")[1])
    )

    if (
      (arrivalDate <= dinnerEnd && currentDate > arrivalDate) ||
      (currentDate.getTime() === arrivalDate.getTime() &&
        arrivalDate <= dinnerEnd)
    ) {
      dailyMeal.dinner = 1 // Можно получить ужин
    }

    // Обновляем общее количество
    mealPlan.totalBreakfast += dailyMeal.breakfast
    mealPlan.totalLunch += dailyMeal.lunch
    mealPlan.totalDinner += dailyMeal.dinner

    // Добавляем информацию о дневных приемах пищи
    mealPlan.dailyMeals.push(dailyMeal)

    // Переходим к следующему дню
    currentDate.setDate(currentDate.getDate() + 1)
  }

  // Уменьшаем количество ужинов, если последний день совпадает с выездом
  const lastMealDay = mealPlan.dailyMeals[mealPlan.dailyMeals.length - 1]
  if (
    lastMealDay &&
    lastMealDay.date === departureDate.toISOString().split("T")[0]
  ) {
    lastMealDay.dinner = 0 // Ужин не включается в день выезда
    mealPlan.totalDinner -= 1 // Убираем ужин из общего количества
  }

  return mealPlan
}

export default calculateMeal

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
      mealTimes.breakfast.start.split(":")[0], // Извлекаем часы
      mealTimes.breakfast.start.split(":")[1] // Извлекаем минуты
    )
    const breakfastEnd = new Date(currentDate)
    breakfastEnd.setHours(
      mealTimes.breakfast.end.split(":")[0], // Извлекаем часы
      mealTimes.breakfast.end.split(":")[1] // Извлекаем минуты
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
      mealTimes.lunch.start.split(":")[0], // Извлекаем часы
      mealTimes.lunch.start.split(":")[1] // Извлекаем минуты
    )
    const lunchEnd = new Date(currentDate)
    lunchEnd.setHours(
      mealTimes.lunch.end.split(":")[0], // Извлекаем часы
      mealTimes.lunch.end.split(":")[1] // Извлекаем минуты
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
      mealTimes.dinner.start.split(":")[0], // Извлекаем часы
      mealTimes.dinner.start.split(":")[1] // Извлекаем минуты
    )
    const dinnerEnd = new Date(currentDate)
    dinnerEnd.setHours(
      mealTimes.dinner.end.split(":")[0], // Извлекаем часы
      mealTimes.dinner.end.split(":")[1] // Извлекаем минуты
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
  return mealPlan
}

export default calculateMeal

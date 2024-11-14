const calculateMeal = (arrivalTime, departureTime, mealTimes) => {
  const mealPlan = {
    totalBreakfast: 0,
    totalLunch: 0,
    totalDinner: 0,
    dailyMeals: []
  };

  // Преобразуем время в объекты Date (в миллисекунды)
  const arrivalDate = new Date(arrivalTime * 1000); // Преобразование в миллисекунды
  const departureDate = new Date(departureTime * 1000); // Преобразование в миллисекунды
  console.log("Arrival Date:", arrivalDate); // Проверка даты прибытия
  console.log("Departure Date:", departureDate); // Проверка даты отъезда

  // Копируем дату прибытия для начала цикла
  const currentDate = new Date(arrivalDate);
  while (currentDate <= departureDate) {
    const dateString = currentDate.toISOString().split("T")[0];
    const dailyMeal = { date: dateString, breakfast: 0, lunch: 0, dinner: 0 };

    // Проверка завтрака
    const breakfastStart = new Date(currentDate);
    breakfastStart.setHours(mealTimes.breakfast.start.hours, mealTimes.breakfast.start.minutes);
    const breakfastEnd = new Date(currentDate);
    breakfastEnd.setHours(mealTimes.breakfast.end.hours, mealTimes.breakfast.end.minutes);
    
    console.log("Breakfast Start:", breakfastStart, "Breakfast End:", breakfastEnd); // Логируем время завтрака

    if ((arrivalDate <= breakfastEnd && currentDate >= breakfastStart) || (arrivalDate <= breakfastEnd && departureDate >= breakfastStart)) {
      dailyMeal.breakfast = 1; // Можно получить завтрак
    }

    // Проверка обеда
    const lunchStart = new Date(currentDate);
    lunchStart.setHours(mealTimes.lunch.start.hours, mealTimes.lunch.start.minutes);
    const lunchEnd = new Date(currentDate);
    lunchEnd.setHours(mealTimes.lunch.end.hours, mealTimes.lunch.end.minutes);
    
    console.log("Lunch Start:", lunchStart, "Lunch End:", lunchEnd); // Логируем время обеда

    if ((arrivalDate <= lunchEnd && currentDate >= lunchStart) || (arrivalDate <= lunchEnd && departureDate >= lunchStart)) {
      dailyMeal.lunch = 1; // Можно получить обед
    }

    // Проверка ужина
    const dinnerStart = new Date(currentDate);
    dinnerStart.setHours(mealTimes.dinner.start.hours, mealTimes.dinner.start.minutes);
    const dinnerEnd = new Date(currentDate);
    dinnerEnd.setHours(mealTimes.dinner.end.hours, mealTimes.dinner.end.minutes);
    
    console.log("Dinner Start:", dinnerStart, "Dinner End:", dinnerEnd); // Логируем время ужина

    if ((arrivalDate <= dinnerEnd && currentDate >= dinnerStart) || (arrivalDate <= dinnerEnd && departureDate >= dinnerStart)) {
      dailyMeal.dinner = 1; // Можно получить ужин
    }

    // Обновляем общее количество приемов пищи
    mealPlan.totalBreakfast += dailyMeal.breakfast;
    mealPlan.totalLunch += dailyMeal.lunch;
    mealPlan.totalDinner += dailyMeal.dinner;
    
    // Добавляем информацию о текущем дне
    mealPlan.dailyMeals.push(dailyMeal);

    // Переход к следующему дню
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return mealPlan;
};


const arrivalTime = 1731323952;
const departureTime = 1731500411; 
const mealTimes = {
  breakfast: { start: { hours: 7, minutes: 0 }, end: { hours: 9, minutes: 0 } },
  lunch: { start: { hours: 12, minutes: 0 }, end: { hours: 16, minutes: 0 } },
  dinner: { start: { hours: 18, minutes: 0 }, end: { hours: 20, minutes: 0 } }
};

const result = calculateMeal(arrivalTime, departureTime, mealTimes);
console.log(result);

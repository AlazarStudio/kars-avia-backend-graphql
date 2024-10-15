const calculateMeal = (arrivalTime, departureTime, mealTimes) => {
    const mealPlan = { totalBreakfast: 0, totalLunch: 0, totalDinner: 0, dailyMeals: [] };
  
    // Преобразуем время в объекты Date
    const arrivalDate = new Date(arrivalTime);
    const departureDate = new Date(departureTime);
    
    // Убедимся, что даты не выходят за пределы
    const currentDate = new Date(arrivalDate);
  
    while (currentDate <= departureDate) {
      const dateString = currentDate.toISOString().split('T')[0];
      const dailyMeal = { date: dateString, breakfast: 0, lunch: 0, dinner: 0 };
  
      // Проверяем завтрак
      const breakfastStart = new Date(currentDate);
      breakfastStart.setHours(mealTimes.breakfast.start.hours, mealTimes.breakfast.start.minutes);
      const breakfastEnd = new Date(currentDate);
      breakfastEnd.setHours(mealTimes.breakfast.end.hours, mealTimes.breakfast.end.minutes);
  
      if (arrivalDate < breakfastEnd && departureDate >= breakfastStart) {
        dailyMeal.breakfast = 1; // Можно получить завтрак
      } else if (arrivalDate >= breakfastEnd) {
        dailyMeal.breakfast = 0; // Завтрак пропущен
      }
  
      // Проверяем обед
      const lunchStart = new Date(currentDate);
      lunchStart.setHours(mealTimes.lunch.start.hours, mealTimes.lunch.start.minutes);
      const lunchEnd = new Date(currentDate);
      lunchEnd.setHours(mealTimes.lunch.end.hours, mealTimes.lunch.end.minutes);
  
      if (arrivalDate < lunchEnd && departureDate >= lunchStart) {
        dailyMeal.lunch = 1; // Можно получить обед
      }
  
      // Проверяем ужин
      const dinnerStart = new Date(currentDate);
      dinnerStart.setHours(mealTimes.dinner.start.hours, mealTimes.dinner.start.minutes);
      const dinnerEnd = new Date(currentDate);
      dinnerEnd.setHours(mealTimes.dinner.end.hours, mealTimes.dinner.end.minutes);
  
      if (arrivalDate < dinnerEnd && departureDate >= dinnerStart) {
        dailyMeal.dinner = 1; // Можно получить ужин
      }
  
      // Обновляем общее количество
      mealPlan.totalBreakfast += dailyMeal.breakfast;
      mealPlan.totalLunch += dailyMeal.lunch;
      mealPlan.totalDinner += dailyMeal.dinner;
  
      // Добавляем информацию о дневных приемах пищи
      mealPlan.dailyMeals.push(dailyMeal);
  
      // Переходим к следующему дню
      currentDate.setDate(currentDate.getDate() + 1);
    }
  
    return mealPlan;
  };
  
  export default calculateMeal;
  
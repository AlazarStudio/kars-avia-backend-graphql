const calculateMeal = (arrivalTime, departureTime, mealTimes) => {
  const mealPlan = {
    totalBreakfast: 0,
    totalLunch: 0,
    totalDinner: 0,
    dailyMeals: []
  };

  const arrivalDate = new Date(arrivalTime);
  const departureDate = new Date(departureTime);

  const currentDate = new Date(arrivalDate);

  while (currentDate <= departureDate) {
    const dateString = currentDate.toISOString().split("T")[0];
    const dailyMeal = { date: dateString, breakfast: 0, lunch: 0, dinner: 0 };

    const breakfastStart = new Date(currentDate);
    breakfastStart.setHours(...mealTimes.breakfast.start.split(":"));
    const lunchStart = new Date(currentDate);
    lunchStart.setHours(...mealTimes.lunch.start.split(":"));
    const dinnerStart = new Date(currentDate);
    dinnerStart.setHours(...mealTimes.dinner.start.split(":"));

    // Проверка для завтрака
    if (
      (currentDate < departureDate || departureTime >= breakfastStart) &&
      arrivalTime <= breakfastStart
    ) {
      dailyMeal.breakfast = 1;
    }

    // Проверка для обеда
    if (
      (currentDate < departureDate || departureTime >= lunchStart) &&
      arrivalTime <= lunchStart
    ) {
      dailyMeal.lunch = 1;
    }

    // Проверка для ужина
    if (
      (currentDate < departureDate || departureTime >= dinnerStart) &&
      arrivalTime <= dinnerStart
    ) {
      dailyMeal.dinner = 1;
    }

    mealPlan.totalBreakfast += dailyMeal.breakfast;
    mealPlan.totalLunch += dailyMeal.lunch;
    mealPlan.totalDinner += dailyMeal.dinner;

    mealPlan.dailyMeals.push(dailyMeal);
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return mealPlan;
};

export default calculateMeal

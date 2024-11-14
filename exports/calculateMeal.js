// const calculateMeal = (arrivalTime, departureTime, mealTimes) => {
//   const mealPlan = {
//     totalBreakfast: 0,
//     totalLunch: 0,
//     totalDinner: 0,
//     dailyMeals: []
//   };
  
//   const arrivalDate = new Date(arrivalTime);
//   const departureDate = new Date(departureTime);
  
//   const differenceInMs = departureDate - arrivalDate;
//   const differenceInDays = Math.ceil(differenceInMs / (1000 * 60 * 60 * 24)) + 1;

//   for (let i = 0; i < differenceInDays; i++) {
//     const currentDate = new Date(arrivalDate);
//     currentDate.setDate(arrivalDate.getDate() + i);
//     const currentDateStr = currentDate.toISOString().split("T")[0];

//     // Инициализируем счётчики на каждый день
//     let breakfast = 0;
//     let lunch = 0;
//     let dinner = 0;

//     // Проверяем, попадает ли текущая дата на день прибытия или отъезда
//     const isArrivalDay = i === 0;
//     const isDepartureDay = i === differenceInDays - 1;

//     // Функция для проверки, попадает ли время прибытия/отъезда в интервал
//     const isWithinMealTime = (time, start, end) => {
//       const [startHour, startMinute] = start.split(":").map(Number);
//       const [endHour, endMinute] = end.split(":").map(Number);
//       const mealStart = new Date(currentDateStr);
//       mealStart.setHours(startHour, startMinute);

//       const mealEnd = new Date(currentDateStr);
//       mealEnd.setHours(endHour, endMinute);

//       return new Date(time) >= mealStart && new Date(time) <= mealEnd;
//     };

//     // Проверяем на завтрак
//     if (
//       (!isArrivalDay || isWithinMealTime(arrivalTime, mealTimes.breakfast.start, mealTimes.breakfast.end)) &&
//       (!isDepartureDay || isWithinMealTime(departureTime, mealTimes.breakfast.start, mealTimes.breakfast.end))
//     ) {
//       breakfast++;
//       mealPlan.totalBreakfast++;
//     }

//     // Проверяем на обед
//     if (
//       (!isArrivalDay || isWithinMealTime(arrivalTime, mealTimes.lunch.start, mealTimes.lunch.end)) &&
//       (!isDepartureDay || isWithinMealTime(departureTime, mealTimes.lunch.start, mealTimes.lunch.end))
//     ) {
//       lunch++;
//       mealPlan.totalLunch++;
//     }

//     // Проверяем на ужин
//     if (
//       (!isArrivalDay || isWithinMealTime(arrivalTime, mealTimes.dinner.start, mealTimes.dinner.end)) &&
//       (!isDepartureDay || isWithinMealTime(departureTime, mealTimes.dinner.start, mealTimes.dinner.end))
//     ) {
//       dinner++;
//       mealPlan.totalDinner++;
//     }

//     // Добавляем данные о каждом приёме пищи в dailyMeals
//     mealPlan.dailyMeals.push({
//       date: currentDateStr,
//       breakfast,
//       lunch,
//       dinner
//     });
//   }

//   console.log(mealPlan);
//   return mealPlan;
// };

// export default calculateMeal;
const calculateMeal = (arrivalTime, departureTime, mealTimes) => { 
  const mealPlan = {
    totalBreakfast: 0,
    totalLunch: 0,
    totalDinner: 0,
    dailyMeals: []
  };

  console.log("Meal Times:", mealTimes);
  console.log("Arrival Time:", arrivalTime);
  console.log("Departure Time:", departureTime);

  // Преобразуем время в объекты Date
  const arrivalDate = new Date(arrivalTime);
  const departureDate = new Date(departureTime);
  departureDate.setHours(23, 59, 59); // Устанавливаем конец дня для включения последнего дня

  console.log("Parsed Arrival Date:", arrivalDate);
  console.log("Parsed Departure Date:", departureDate);

  // Копируем дату прибытия для начала цикла
  const currentDate = new Date(arrivalDate);
  while (currentDate <= departureDate) {
    const dateString = currentDate.toISOString().split("T")[0];
    const dailyMeal = { date: dateString, breakfast: 0, lunch: 0, dinner: 0 };

    // Разбор времени завтрака
    const [breakfastStartHour, breakfastStartMinute] = mealTimes.breakfast.start.split(':').map(Number);
    const [breakfastEndHour, breakfastEndMinute] = mealTimes.breakfast.end.split(':').map(Number);

    const breakfastStart = new Date(currentDate);
    breakfastStart.setHours(breakfastStartHour, breakfastStartMinute);
    const breakfastEnd = new Date(currentDate);
    breakfastEnd.setHours(breakfastEndHour, breakfastEndMinute);

    console.log("Breakfast Start:", breakfastStart, "Breakfast End:", breakfastEnd);

    if ((arrivalDate <= breakfastEnd && currentDate >= breakfastStart) || (arrivalDate <= breakfastEnd && departureDate >= breakfastStart)) {
      dailyMeal.breakfast = 1;
    }

    // Разбор времени обеда
    const [lunchStartHour, lunchStartMinute] = mealTimes.lunch.start.split(':').map(Number);
    const [lunchEndHour, lunchEndMinute] = mealTimes.lunch.end.split(':').map(Number);

    const lunchStart = new Date(currentDate);
    lunchStart.setHours(lunchStartHour, lunchStartMinute);
    const lunchEnd = new Date(currentDate);
    lunchEnd.setHours(lunchEndHour, lunchEndMinute);

    console.log("Lunch Start:", lunchStart, "Lunch End:", lunchEnd);

    if ((arrivalDate <= lunchEnd && currentDate >= lunchStart) || (arrivalDate <= lunchEnd && departureDate >= lunchStart)) {
      dailyMeal.lunch = 1;
    }

    // Разбор времени ужина
    const [dinnerStartHour, dinnerStartMinute] = mealTimes.dinner.start.split(':').map(Number);
    const [dinnerEndHour, dinnerEndMinute] = mealTimes.dinner.end.split(':').map(Number);

    const dinnerStart = new Date(currentDate);
    dinnerStart.setHours(dinnerStartHour, dinnerStartMinute);
    const dinnerEnd = new Date(currentDate);
    dinnerEnd.setHours(dinnerEndHour, dinnerEndMinute);

    console.log("Dinner Start:", dinnerStart, "Dinner End:", dinnerEnd);

    if ((arrivalDate <= dinnerEnd && currentDate >= dinnerStart) || (arrivalDate <= dinnerEnd && departureDate >= dinnerStart)) {
      dailyMeal.dinner = 1;
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

export default calculateMeal;

    extendRequestDates: async (_, { input }, context) => {
      const { requestId, newEnd, newEndTime } = input;

      const request = await prisma.request.findUnique({
        where: { id: requestId },
        include: { hotelChess: true, hotel: true }
      });

      if (!request) {
        throw new Error("Request not found");
      }

      if (!request.hotelChess) {
        throw new Error("Request has not been placed in a hotel");
      }

      const updatedHotelChess = await prisma.hotelChess.update({
        where: { id: request.hotelChess.id },
        data: {
          end: newEnd,
          endTime: newEndTime
        }
      });

      const existingMealPlan = request.mealPlan || {
        included: true,
        breakfast: 0,
        lunch: 0,
        dinner: 0,
        dailyMeals: []
      };

      const arrivalDateTime = `${updatedHotelChess.start} ${updatedHotelChess.startTime}`;
      const departureDateTime = `${newEnd} ${newEndTime}`;

      const hotel = request.hotel;
      const mealTimes = {
        breakfast: hotel.breakfast,
        lunch: hotel.lunch,
        dinner: hotel.dinner
      };

      const newMealPlan = calculateMeal(
        new Date(arrivalDateTime).getTime() / 1000,
        new Date(departureDateTime).getTime() / 1000,
        mealTimes
      );

      const filteredDailyMeals = newMealPlan.dailyMeals.filter(
        (newDay) =>
          !existingMealPlan.dailyMeals.some(
            (existingDay) => existingDay.date === newDay.date
          )
      );

      const updatedMealPlan = await updateDailyMeals(requestId, filteredDailyMeals);

      const updatedRequest = await prisma.request.update({
        where: { id: requestId },
        data: {
          departure: {
            date: newEnd,
            time: newEndTime
          },
          mealPlan: updatedMealPlan
        },
        include: {
          arrival: true,
          departure: true,
          hotelChess: true
        }
      });

      pubsub.publish(REQUEST_UPDATED, { requestUpdated: updatedRequest });

      return updatedRequest;
    },

    extendRequestDates: async (_, { input }, context) => {
      const { requestId, newEnd, newEndTime } = input

      const request = await prisma.request.findUnique({
        where: { id: requestId },
        include: { hotelChess: true, hotel: true }
      })

      if (!request) {
        throw new Error("Request not found")
      }

      if (!request.hotelChess) {
        throw new Error("Request has not been placed in a hotel")
      }

      const updatedHotelChess = await prisma.hotelChess.update({
        where: { id: request.hotelChess.id },
        data: {
          end: newEnd,
          endTime: newEndTime
        }
      })

      const existingMealPlan = request.mealPlan || {
        included: true,
        breakfast: 0,
        lunch: 0,
        dinner: 0,
        dailyMeals: []
      }

      const arrivalDateTime = `${updatedHotelChess.start} ${updatedHotelChess.startTime}`
      const departureDateTime = `${newEnd} ${newEndTime}`

      const hotel = request.hotel
      const mealTimes = {
        breakfast: hotel.breakfast,
        lunch: hotel.lunch,
        dinner: hotel.dinner
      }

      const newMealPlan = calculateMeal(
        new Date(arrivalDateTime).getTime() / 1000,
        new Date(departureDateTime).getTime() / 1000,
        mealTimes
      )

      const newEndDate = new Date(newEnd)

      // Фильтруем существующие dailyMeals, чтобы оставить только даты до нового конца
      const adjustedDailyMeals = existingMealPlan.dailyMeals.filter(
        (day) => new Date(day.date) <= newEndDate
      )

      // Добавляем новые дни, только если их нет в отфильтрованных dailyMeals
      newMealPlan.dailyMeals.forEach((newDay) => {
        if (
          !adjustedDailyMeals.some(
            (existingDay) => existingDay.date === newDay.date
          )
        ) {
          adjustedDailyMeals.push(newDay)
        }
      })

      const updatedMealPlan = await updateDailyMeals(
        requestId,
        adjustedDailyMeals,
        newEndDate
      )

      const updatedRequest = await prisma.request.update({
        where: { id: requestId },
        data: {
          departure: {
            date: newEnd,
            time: newEndTime
          },
          mealPlan: updatedMealPlan
        },
        include: {
          arrival: true,
          departure: true,
          hotelChess: true
        }
      })

      pubsub.publish(REQUEST_UPDATED, { requestUpdated: updatedRequest })

      return updatedRequest
    }
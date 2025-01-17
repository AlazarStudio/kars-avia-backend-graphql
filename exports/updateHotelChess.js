import { prisma } from "../prisma.js"
import logAction from "./logaction.js"
import calculateMeal from "./calculateMeal.js"

const updateHotelChess = async (prisma, pubsub, context, hotelChess, id) => {
  const { user } = context
  if (hotelChess.id) {
    // Обновляем данные о существующем hotelChess
    const previousHotelChessData = await prisma.hotelChess.findUnique({
      where: { id: hotelChess.id }
    })
    await prisma.hotelChess.update({
      where: { id: hotelChess.id },
      data: {
        public: hotelChess.public,
        room: hotelChess.room,
        place: hotelChess.place,
        start: hotelChess.start,
        end: hotelChess.end,
        clientId: hotelChess.clientId,
        requestId: hotelChess.requestId
      }
    })

    // Обновляем статус и связь с отелем в заявке
    const updatedRequest = await prisma.request.update({
      where: { id: hotelChess.requestId },
      data: {
        status: "done",
        hotel: { connect: { id: id } },
        hotelChess: { connect: { id: hotelChess.id } }
      }
    })

    await logAction({
      context,
      action: "update_hotel_chess",
      description: ``,
      oldData: previousHotelChessData,
      newData: hotelChess,
      hotelId: hotelChess.hotelId,
      requestId: hotelChess.requestId
    })

    pubsub.publish("REQUEST_UPDATED", {
      requestUpdated: updatedRequest
    })

    return updatedRequest
  } else {
    // Создание новой записи hotelChess
    await prisma.hotelChess.create({
      data: {
        hotel: { connect: { id: id } },
        public: hotelChess.public,
        room: hotelChess.room,
        place: hotelChess.place,
        start: hotelChess.start,
        end: hotelChess.end,
        client: { connect: { id: hotelChess.clientId } },
        request: { connect: { id: hotelChess.requestId } }
      }
    })

    // Получение данных для расчета питания
    const arrival = `${hotelChess.start}`
    const departure = `${hotelChess.end}`
    const hotel = await prisma.hotel.findUnique({
      where: { id },
      select: { breakfast: true, lunch: true, dinner: true }
    })

    const mealTimes = {
      breakfast: hotel.breakfast,
      lunch: hotel.lunch,
      dinner: hotel.dinner
    }

    const mealPlan = calculateMeal(
      new Date(arrival).getTime() / 1000,
      new Date(departure).getTime() / 1000,
      mealTimes
    )

    const updatedRequest = await prisma.request.update({
      where: { id: hotelChess.requestId },
      data: {
        status: "done",
        hotel: { connect: { id } },
        mealPlan: {
          included: true,
          breakfast: mealPlan.totalBreakfast,
          lunch: mealPlan.totalLunch,
          dinner: mealPlan.totalDinner,
          dailyMeals: mealPlan.dailyMeals
        }
      }
    })

    await logAction({
      context,
      action: "update_hotel_chess",
      description: {},
      oldData: null,
      newData: hotelChess,
      hotelId: hotelChess.hotelId,
      requestId: hotelChess.requestId
    })

    pubsub.publish("REQUEST_UPDATED", {
      requestUpdated: updatedRequest
    })

    return updatedRequest
  }
}

export default updateHotelChess

import { prisma } from "../../prisma.js"
import GraphQLUpload from "graphql-upload/GraphQLUpload.mjs"
import uploadImage from "../../exports/uploadImage.js"
import logAction from "../../exports/logaction.js"
import {
  superAdminMiddleware,
  adminMiddleware,
  hotelAdminMiddleware,
  hotelModerMiddleware,
  hotelMiddleware
} from "../../middlewares/authMiddleware.js"
import { pubsub, REQUEST_UPDATED } from "../../exports/pubsub.js"
import calculateMeal from "../../exports/calculateMeal.js"

const categoryToPlaces = {
  onePlace: 1,
  twoPlace: 2
};

const calculatePlaces = (category) => categoryToPlaces[category] || 1;

const hotelResolver = {
  Upload: GraphQLUpload,
  Query: {
    hotels: async (_, {}, context) => {
      return await prisma.hotel.findMany({
        include: {
          rooms: true,
          hotelChesses: true,
          MealPrice: {
            select: {
              breakfast: true,
              lunch: true,
              dinner: true
            }
          },
        }
      })
    },
    hotel: async (_, { id }, context) => {
      return await prisma.hotel.findUnique({
        where: { id },
        include: {
          rooms: true,
          hotelChesses: true,
          MealPrice: {
            select: {
              breakfast: true,
              lunch: true,
              dinner: true
            }
          },
        }
      })
    }
  },
  Mutation: {
    createHotel: async (_, { input, images }, context) => {
      adminMiddleware(context)
      let imagePaths = []
      if (images && images.length > 0) {
        for (const image of images) {
          imagePaths.push(await uploadImage(image))
        }
      }

      const defaultMealPrice = {
        breakfast: 600,
        lunch: 600,
        dinner: 600
      };

      const defaultMealTime = {
        breakfast: { start: "07:00", end: "10:00" },
        lunch: { start: "12:00", end: "16:00" },
        dinner: { start: "18:00", end: "20:00" }
      }

      const data = {
        ...input,
        MealPrice: input.MealPrice || defaultMealPrice,
        breakfast: input.breakfast || defaultMealTime.breakfast,  
        lunch: input.lunch || defaultMealTime.lunch,
        dinner: input.dinner || defaultMealTime.dinner,
        images: imagePaths
      }

      const createdHotel = await prisma.hotel.create({
        data,
        include: {
          rooms: true,
        }
      })
      // Логирование создания отеля
      await logAction({
        context,
        action: `create hotel`,
        description: {
          hotelName: createdHotel.name,
          hotelId: createdHotel.id,
          input: data
        },
        hotelId: createdHotel.id
      })
      return createdHotel
    },
    updateHotel: async (_, { id, input, images }, context) => {
      hotelAdminMiddleware(context)
      let imagePaths = []
      if (images && images.length > 0) {
        for (const image of images) {
          imagePaths.push(await uploadImage(image))
        }
      }
      const { rooms, hotelChesses, ...restInput } =
        input
      const updatedData = {
        rooms,
        hotelChesses,
        ...restInput
      }
      try {
        const previousHotelData = await prisma.hotel.findUnique({
          where: { id }
        })
        const updatedHotel = await prisma.hotel.update({
          where: { id },
          data: {
            ...restInput,
            ...(imagePaths.length > 0 && { images: { set: imagePaths } })
          }
        })
        await logAction({
          context,
          action: "update hotel",
          description: {},
          oldData: previousHotelData,
          newData: updatedData,
          hotelId: updatedHotel.id
        })
        // Needs refinement
        if (hotelChesses) {
          for (const hotelChess of hotelChesses) {
            if (hotelChess.id) {
              const previousHotelChessData = await prisma.hotelChess.findUnique(
                {
                  where: { id: hotelChess.id }
                }
              )
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
              const updatedRequest = await prisma.request.update({
                where: { id: hotelChess.requestId },
                data: {
                  status: "done",
                  hotel: {
                    connect: { id: id }
                  },
                  hotelChess: {
                    connect: { id: hotelChess.id }
                  }
                }
              })
              await logAction({
                context,
                action: "update hotel chess",
                description: {},
                oldData: previousHotelChessData,
                newData: hotelChess,
                hotelId: hotelChess.hotelId,
                requestId: hotelChess.requestId
              })
              pubsub.publish(REQUEST_UPDATED, {
                requestUpdated: updatedRequest
              })
            } else {
              await prisma.hotelChess.create({
                data: {
                  hotel: {
                    connect: { id: id }
                  },
                  public: hotelChess.public,
                  room: hotelChess.room,
                  place: hotelChess.place,
                  start: hotelChess.start,
                  end: hotelChess.end,
                  client: { connect: { id: hotelChess.clientId } },
                  request: {
                    connect: { id: hotelChess.requestId }
                  }
                }
              })
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
                new Date(arrival).getTime() / 1000, // В секундах
                new Date(departure).getTime() / 1000, // В секундах
                mealTimes
              )
              const updatedRequest = await prisma.request.update({
                where: { id: hotelChess.requestId },
                data: {
                  status: "done",
                  hotel: {
                    connect: { id }
                  },
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
              pubsub.publish(REQUEST_UPDATED, {
                requestUpdated: updatedRequest
              })
            }
          }
        }
        // Обработка комнат
        if (rooms) {
          for (const room of rooms) {
            const places = calculatePlaces(room.category); // используем отдельную функцию для расчёта мест
            if (room.id) {
              const previousRoomData = await prisma.room.findUnique({
                where: { id: room.id }
              });
              await prisma.room.update({
                where: { id: room.id },
                data: {
                  name: room.name,
                  category: room.category,
                  reserve: room.reserve,
                  active: room.active,
                  places: places
                }
              });
              await logAction({
                context,
                action: "update room",
                description: {},
                oldData: previousRoomData,
                newData: room,
                hotelId: room.hotelId
              });
            } else {
              await prisma.room.create({
                data: {
                  hotelId: id,
                  name: room.name,
                  category: room.category,
                  reserve: room.reserve,
                  active: room.active,
                  places: places
                }
              });
              await logAction({
                context,
                action: "create room",
                description: {},
                newData: room,
                hotelId: room.hotelId
              });
            }
          }
        }        
        // Получаем обновленный отель с вложенными данными
        const hotelWithRelations = await prisma.hotel.findUnique({
          where: { id },
          include: {
            rooms: true,
            hotelChesses: true
          }
        })
        return hotelWithRelations
      } catch (error) {
        throw new Error("Не удалось обновить отель", error)
      }
    },
    deleteHotel: async (_, { id }, context) => {
      superAdminMiddleware(context)
      const hotelToDelete = await prisma.hotel.findUnique({
        where: { id }
      })
      if (!hotelToDelete) {
        throw new Error("Отель не найден")
      }
      const deletedHotel = await prisma.hotel.delete({
        where: { id }
      })
      await logAction({
        context,
        action: "delete hotel",
        description: {},
        oldData: hotelToDelete,
        newData: hotelToDelete,
        hotelId: id
      })
      return deletedHotel
    },
    deleteRoom: async (_, { id }, context) => {
      hotelAdminMiddleware(context)
      const roomToDelete = await prisma.room.findUnique({
        where: { id }
      })
      if (!roomToDelete) {
        throw new Error("Комната не найдена")
      }
      const deletedRoom = await prisma.room.delete({
        where: { id }
      })
      await logAction({
        context,
        action: "delete room",
        description: {},
        oldData: roomToDelete,
        newData: roomToDelete,
        hotelId: roomToDelete.id
      })
      return deletedRoom
    }
  },
  Hotel: {
    rooms: async (parent) => {
      return await prisma.room.findMany({
        where: { hotelId: parent.id }
      })
    },
    hotelChesses: async (parent) => {
      return await prisma.hotelChess.findMany({
        where: { hotelId: parent.id },
        include: { client: true }
      })
    },
  },
  HotelChess: {
    client: async (parent) => {
      return await prisma.airlinePersonal.findUnique({
        where: { id: parent.clientId }
      })
    },
    request: async (parent) => {
      return await prisma.request.findUnique({
        where: { id: parent.requestId }
      })
    }
  }
}

export default hotelResolver

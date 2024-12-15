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
import {
  pubsub,
  REQUEST_UPDATED,
  HOTEL_CREATED,
  HOTEL_UPDATED
} from "../../exports/pubsub.js"
import calculateMeal from "../../exports/calculateMeal.js"
import { request } from "express"

const categoryToPlaces = {
  onePlace: 1,
  twoPlace: 2,
  threePlace: 3,
  fourPlace: 4
}

const calculatePlaces = (category) => categoryToPlaces[category] || 1

const hotelResolver = {
  Upload: GraphQLUpload,
  Query: {
    hotels: async (_, {}, context) => {
      return await prisma.hotel.findMany({
        include: {
          rooms: true,
          hotelChesses: true
          // MealPrice: {
          //   select: {
          //     breakfast: true,
          //     lunch: true,
          //     dinner: true
          //   }
          // },
        }
      })
    },
    hotel: async (_, { id }, context) => {
      return await prisma.hotel.findUnique({
        where: { id },
        include: {
          rooms: true,
          hotelChesses: true
          // MealPrice: {
          //   select: {
          //     breakfast: true,
          //     lunch: true,
          //     dinner: true
          //   }
          // },
        }
      })
    }
  },
  Mutation: {
    createHotel: async (_, { input, images }, context) => {
      const { user } = context
      adminMiddleware(context)
      let imagePaths = []
      if (images && images.length > 0) {
        for (const image of images) {
          imagePaths.push(await uploadImage(image))
        }
      }

      const defaultMealPrice = {
        breakfast: 0,
        lunch: 0,
        dinner: 0
      }

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
          rooms: true
        }
      })
      // Логирование создания отеля
      await logAction({
        context,
        action: `create_hotel`,
        description: `Пользователь ${user.name} создал отель ${createdHotel.name}`,
        hotelName: createdHotel.name,
        hotelId: createdHotel.id,
        input: data,
        hotelId: createdHotel.id
      })
      pubsub.publish(HOTEL_CREATED, { hotelCreated: createdHotel })
      return createdHotel
    },
    updateHotel: async (_, { id, input, images, roomImages }, context) => {
      const { user } = context
      hotelAdminMiddleware(context)
      let imagePaths = []
      if (images && images.length > 0) {
        for (const image of images) {
          imagePaths.push(await uploadImage(image))
        }
      }
      const { rooms, hotelChesses, ...restInput } = input
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
          action: "update_hotel",
          description: `Пользователь ${user.name} изменил данные в отеле ${updatedHotel.name}`,
          oldData: previousHotelData,
          newData: updatedData,
          hotelId: updatedHotel.id
        })
        // Needs refinement
        if (hotelChesses) {
          for (const hotelChess of hotelChesses) {
            // console.log(hotelChess.requestId)

            if (hotelChess.id) {
              const previousHotelChessData = await prisma.hotelChess.findUnique(
                {
                  where: { id: hotelChess.id }
                }
              )

              // Обновление существующей записи
              await prisma.hotelChess.update({
                where: { id: hotelChess.id },
                data: {
                  public: hotelChess.public,
                  room: hotelChess.room,
                  place: hotelChess.place,
                  start: hotelChess.start,
                  end: hotelChess.end,
                  clientId: hotelChess.clientId,
                  requestId: hotelChess.requestId,
                  reserveId: hotelChess.reserveId,
                  status: hotelChess.status
                }
              })

              if (hotelChess.requestId) {
                // Обработка для заявки типа "request"
                const room = await prisma.room.findFirst({
                  where: { hotelId: hotelChess.hotelId, name: hotelChess.room }
                })

                const updatedRequest = await prisma.request.update({
                  where: { id: hotelChess.requestId },
                  data: {
                    status: "transferred",
                    hotel: { connect: { id: id } },
                    hotelChess: { connect: { id: hotelChess.id } },
                    roomCategory: room.category,
                    roomNumber: room.name
                  }
                })

                await logAction({
                  context,
                  action: "update_hotel_chess",
                  description: `Заявка № ${updatedRequest.requestNumber} была перенесена в номер ${hotelChess.room} пользователем ${user.name}`,
                  oldData: previousHotelChessData,
                  newData: hotelChess,
                  hotelId: hotelChess.hotelId,
                  requestId: updatedRequest.id,
                })

                pubsub.publish(REQUEST_UPDATED, {
                  requestUpdated: updatedRequest
                })
              } else if (hotelChess.reserveId) {
                // Обработка для заявки типа "reserve"
                await prisma.reserve.update({
                  where: { id: hotelChess.reserveId },
                  data: {
                    // status: "transferred",
                    hotelChess: { connect: { id: hotelChess.id } }
                  }
                })

                await logAction({
                  context,
                  action: "update_hotel_chess",
                  description: `Заявка № ${hotelChess.reserveId} была перенесена в номер ${hotelChess.room} пользователем ${user.name}`,
                  oldData: previousHotelChessData,
                  newData: hotelChess,
                  hotelId: hotelChess.hotelId,
                  reserveId: hotelChess.reserveId
                })
              }
            } else {
              // Создание новой записи
              let reserveForPerson
              let newHotelChess // Объявляем переменную вне блоков if/else

              if (hotelChess.reserveId) {
                const reserve = await prisma.reserve.findUnique({
                  where: { id: hotelChess.reserveId },
                  select: { reserveForPerson: true }
                })

                reserveForPerson = reserve?.reserveForPerson

                if (reserveForPerson === true) {
                  newHotelChess = await prisma.hotelChess.create({
                    data: {
                      hotel: { connect: { id: id } },
                      public: hotelChess.public,
                      room: hotelChess.room,
                      place: hotelChess.place,
                      start: hotelChess.start,
                      end: hotelChess.end,
                      client: { connect: { id: hotelChess.clientId } },
                      reserve: { connect: { id: hotelChess.reserveId } },
                      status: hotelChess.status
                    }
                  })
                } else if (reserveForPerson === false) {
                  console.log(hotelChess)
                  try {
                    newHotelChess = await prisma.hotelChess.create({
                      data: {
                        hotel: { connect: { id: id } },
                        public: hotelChess.public,
                        room: hotelChess.room,
                        place: hotelChess.place,
                        start: hotelChess.start,
                        end: hotelChess.end,
                        passenger: { connect: { id: hotelChess.clientId } },
                        reserve: { connect: { id: hotelChess.reserveId } },
                        status: hotelChess.status
                      }
                    })
                  } catch (e) {
                    console.error("Error: ", e)
                    throw new Error(
                      "Ошибка при создании клиентского бронирования: " +
                        e.message +
                        "\n\n :" +
                        e.stack
                    )
                  }
                }
              } else {
                newHotelChess = await prisma.hotelChess.create({
                  data: {
                    hotel: { connect: { id: id } },
                    public: hotelChess.public,
                    room: hotelChess.room,
                    place: hotelChess.place,
                    start: hotelChess.start,
                    end: hotelChess.end,
                    client: { connect: { id: hotelChess.clientId } },
                    request: hotelChess.requestId
                      ? { connect: { id: hotelChess.requestId } }
                      : undefined,
                    status: hotelChess.status
                  }
                })
              }

              if (hotelChess.requestId) {
                // Обработка для новой заявки типа "request"
                const room = await prisma.room.findFirst({
                  where: { hotelId: hotelChess.hotelId, name: hotelChess.room }
                })
                const arrival = `${hotelChess.start}`
                const departure = `${hotelChess.end}`
                const hotel = await prisma.hotel.findUnique({
                  where: { id },
                  select: {
                    breakfast: true,
                    lunch: true,
                    dinner: true,
                    name: true
                  }
                })
                const mealTimes = {
                  breakfast: hotel.breakfast,
                  lunch: hotel.lunch,
                  dinner: hotel.dinner
                }
                const mealPlan = calculateMeal(arrival, departure, mealTimes)

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
                    },
                    roomCategory: room.category,
                    roomNumber: room.name
                  },
                  include: {
                    // airline: true,
                    // airport: true,
                    hotel: true,
                    person: true,
                    hotelChess: true
                    // logs: true
                  }
                })

                await logAction({
                  context,
                  action: "update_hotel_chess",
                  description: `${updatedRequest.person.name} был размещён в отеле ${hotel.name} в номер ${hotelChess.room} по заявке № ${updatedRequest.requestNumber} пользователем ${user.name}`,
                  oldData: null,
                  newData: newHotelChess,
                  hotelId: hotelChess.hotelId,
                  requestId: hotelChess.requestId,
                  reserveId: hotelChess.reserveId
                })

                pubsub.publish(REQUEST_UPDATED, {
                  requestUpdated: updatedRequest
                })
              } else if (hotelChess.reserveId) {
                // Обработка для новой заявки типа "reserve"
                await prisma.reserve.update({
                  where: { id: hotelChess.reserveId },
                  data: {
                    // status: "done",
                    hotelChess: { connect: { id: newHotelChess.id } }
                  }
                })

                await logAction({
                  context,
                  action: "update_hotel_chess",
                  description: `Бронь № ${hotelChess.reserveId} была создана пользователем ${user.name}`,
                  oldData: null,
                  newData: newHotelChess,
                  hotelId: hotelChess.hotelId
                })
              }
            }
          }
        }

        // Обработка комнат
        if (rooms) {
          for (const room of rooms) {
            const places = calculatePlaces(room.category) // используем отдельную функцию для расчёта мест
            if (room.id) {
              let imagePaths = []
              if (roomImages && roomImages.length > 0) {
                for (const image of roomImages) {
                  imagePaths.push(await uploadImage(image))
                }
              }
              const previousRoomData = await prisma.room.findUnique({
                where: { id: room.id }
              })
              const updatedData = {
                name: room.name,
                category: room.category,
                reserve: room.reserve,
                active: room.active,
                description: room.description,
                places: places
              }
              if (roomImages != null) {
                updatedData.images = imagePaths
              }
              await prisma.room.update({
                where: { id: room.id },
                data: {
                  ...updatedData
                }
              })
              await logAction({
                context,
                action: "update_room",
                description: `Пользователь ${user.name} изменил данные в комнате ${room.name}`,
                oldData: previousRoomData,
                newData: room,
                hotelId: room.hotelId
              })
            } else {
              let imagePaths = []
              if (roomImages && roomImages.length > 0) {
                for (const image of roomImages) {
                  imagePaths.push(await uploadImage(image))
                }
              }
              await prisma.room.create({
                data: {
                  hotelId: id,
                  name: room.name,
                  category: room.category,
                  reserve: room.reserve,
                  active: room.active,
                  description: room.description,
                  images: imagePaths,
                  places: places
                }
              })
              await logAction({
                context,
                action: "create_room",
                description: `Пользователь ${user.name} добавил комнату ${room.name}`,
                newData: room,
                hotelId: room.hotelId
              })
            }
          }
          await updateHotelRoomCounts(id)
        }
        // Получаем обновленный отель с вложенными данными
        const hotelWithRelations = await prisma.hotel.findUnique({
          where: { id },
          include: {
            rooms: true,
            hotelChesses: true
          }
        })
        pubsub.publish(HOTEL_UPDATED, { hotelUpdated: hotelWithRelations })
        return hotelWithRelations
      } catch (error) {
        console.error("Ошибка при обновлении отеля:", error)
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
      await updateHotelRoomCounts(roomToDelete.hotelId)
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
  Subscription: {
    hotelCreated: {
      subscribe: () => pubsub.asyncIterator([HOTEL_CREATED])
    },
    hotelUpdated: {
      subscribe: () => pubsub.asyncIterator([HOTEL_UPDATED])
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
    }
  },
  // HotelChess: {
  //   client: async (parent) => {
  //     return await prisma.airlinePersonal.findUnique({
  //       where: { id: parent.clientId }
  //     })
  //   },
  //   request: async (parent) => {
  //     return await prisma.request.findUnique({
  //       where: { id: parent.requestId }
  //     })
  //   },
  //   reserve: async (parent) => {
  //     return await prisma.request.findUnique({
  //       where: { id: parent.reserveId }
  //     })
  //   }
  // }
  HotelChess: {
    client: async (parent) => {
      if (!parent.clientId) {
        return null // Если clientId отсутствует, возвращаем null
      }
      return await prisma.airlinePersonal.findUnique({
        where: { id: parent.clientId }
      })
    },
    passenger: async (parent) => {
      if (!parent.passengerId) {
        return null // Если passengerId отсутствует, возвращаем null
      }
      return await prisma.passenger.findUnique({
        where: { id: parent.passengerId }
      })
    },
    request: async (parent) => {
      if (!parent.requestId || typeof parent.requestId !== "string") {
        return null // Если requestId отсутствует или некорректный, возвращаем null
      }
      return await prisma.request.findUnique({
        where: { id: parent.requestId }
      })
    },
    reserve: async (parent) => {
      if (!parent.reserveId || typeof parent.reserveId !== "string") {
        return null // Если reserveId отсутствует или некорректный, возвращаем null
      }
      return await prisma.reserve.findUnique({
        where: { id: parent.reserveId }
      })
    }
  }
}

const updateHotelRoomCounts = async (hotelId) => {
  // Подсчёт резервных комнат
  const provisionCount = await prisma.room.count({
    where: {
      hotelId, // Фильтр по отелю
      reserve: true // Только резервные комнаты
    }
  })

  // Подсчёт квотных комнат
  const quoteCount = await prisma.room.count({
    where: {
      hotelId, // Фильтр по отелю
      reserve: false // Только квотные комнаты
    }
  })

  // Обновляем данные отеля
  const updatedHotel = await prisma.hotel.update({
    where: { id: hotelId },
    data: {
      provision: provisionCount,
      quote: quoteCount
    }
  })

  console.log(
    `Обновлены данные для отеля ${hotelId}: provision = ${provisionCount}, quote = ${quoteCount}`
  )

  return updatedHotel
}

export default hotelResolver

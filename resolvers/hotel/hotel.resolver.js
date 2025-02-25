import { prisma } from "../../prisma.js"
import GraphQLUpload from "graphql-upload/GraphQLUpload.mjs"
import { uploadImage } from "../../exports/uploadImage.js"
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

const categoryToPlaces = {
  onePlace: 1,
  twoPlace: 2,
  threePlace: 3,
  fourPlace: 4,
  fivePlace: 5,
  sixPlace: 6,
  sevenPlace: 7,
  eightPlace: 8,
  ninePlace: 9,
  tenPlace: 10
}

const calculatePlaces = (category) => categoryToPlaces[category] || 1

const hotelResolver = {
  Upload: GraphQLUpload,

  Query: {
    hotels: async (_, { pagination }, context) => {
      const { skip, take, all } = pagination || {}
      const totalCount = await prisma.hotel.count({})

      const hotels = all
        ? await prisma.hotel.findMany({
            include: {
              rooms: true,
              hotelChesses: true
            },
            orderBy: { name: "asc" }
          })
        : await prisma.hotel.findMany({
            skip: skip ? skip * take : undefined,
            take: take || undefined,
            include: {
              rooms: true,
              hotelChesses: true
            },
            orderBy: { name: "asc" }
          })

      const totalPages = take && !all ? Math.ceil(totalCount / take) : 1

      return {
        hotels,
        totalCount,
        totalPages
      }
    },
    hotel: async (_, { id }, context) => {
      return await prisma.hotel.findUnique({
        where: { id },
        include: {
          rooms: true,
          hotelChesses: true,
          logs: true
        }
      })
    }
  },

  Mutation: {
    createHotel: async (_, { input, images }, context) => {
      const { user } = context
      adminMiddleware(context)

      const defaultMealPrice = {
        breakfast: 0,
        lunch: 0,
        dinner: 0
      }

      const defaultPrices = {
        priceOneCategory: 0,
        priceTwoCategory: 0,
        priceThreeCategory: 0,
        priceFourCategory: 0,
        priceFiveCategory: 0,
        priceSixCategory: 0,
        priceSevenCategory: 0,
        priceEightCategory: 0,
        priceNineCategory: 0,
        priceTenCategory: 0
      }

      const defaultMealTime = {
        breakfast: { start: "07:00", end: "10:00" },
        lunch: { start: "12:00", end: "16:00" },
        dinner: { start: "18:00", end: "20:00" }
      }

      // Обработка загрузки изображений
      let imagePaths = []
      if (images && images.length > 0) {
        for (const image of images) {
          imagePaths.push(await uploadImage(image))
        }
      }

      // Используем единообразные имена (mealPrice, breakfast, lunch, dinner)
      const data = {
        ...input,
        mealPrice: input.mealPrice || defaultMealPrice,
        prices: input.prices || defaultPrices,
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

      await logAction({
        context,
        action: "create_hotel",
        description: `Пользователь ${user.name} создал отель ${createdHotel.name}`,
        hotelName: createdHotel.name,
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
          description: `Пользователь <span style='color:#545873'>${user.name}</span> изменил данные в отеле <span style='color:#545873'>${updatedHotel.name}</span>`,
          oldData: previousHotelData,
          newData: updatedData,
          hotelId: updatedHotel.id
        })

        if (hotelChesses) {
          for (const hotelChess of hotelChesses) {
            let mealPlanData = null
            if (hotelChess.start && hotelChess.end) {
              const arrival = hotelChess.start.toString()
              const departure = hotelChess.end.toString()
              const hotelInfo = await prisma.hotel.findUnique({
                where: { id: hotelChess.hotelId || id },
                select: {
                  breakfast: true,
                  lunch: true,
                  dinner: true,
                  name: true
                }
              })
              if (hotelInfo) {
                const mealTimes = {
                  breakfast: hotelInfo.breakfast,
                  lunch: hotelInfo.lunch,
                  dinner: hotelInfo.dinner
                }
                const calculatedMealPlan = calculateMeal(
                  arrival,
                  departure,
                  mealTimes
                )
                mealPlanData = {
                  included: true,
                  breakfast: calculatedMealPlan.totalBreakfast,
                  lunch: calculatedMealPlan.totalLunch,
                  dinner: calculatedMealPlan.totalDinner,
                  dailyMeals: calculatedMealPlan.dailyMeals
                }
              }
            }

            if (hotelChess.id) {
              // Обновление существующей записи
              const previousHotelChessData = await prisma.hotelChess.findUnique(
                {
                  where: { id: hotelChess.id }
                }
              )
              let clientConnectData = undefined
              if (hotelChess.clientId) {
                const clientRecord = await prisma.airlinePersonal.findUnique({
                  where: { id: hotelChess.clientId }
                })
                if (clientRecord) {
                  clientConnectData = { connect: { id: hotelChess.clientId } }
                }
              }

              await prisma.hotelChess.update({
                where: { id: hotelChess.id },
                data: {
                  public: hotelChess.public,
                  room: { connect: { id: hotelChess.roomId } },
                  place: hotelChess.place,
                  start: hotelChess.start,
                  end: hotelChess.end,
                  client: clientConnectData,
                  passenger: hotelChess.passengerId
                    ? { connect: { id: hotelChess.passengerId } }
                    : undefined,
                  request: hotelChess.requestId
                    ? { connect: { id: hotelChess.requestId } }
                    : undefined,
                  reserve: hotelChess.reserveId
                    ? { connect: { id: hotelChess.reserveId } }
                    : undefined,
                  status: hotelChess.status
                  // mealPlan: mealPlanData
                }
              })

              if (hotelChess.requestId) {
                // Обработка для заявки (request)
                const room = await prisma.room.findUnique({
                  where: { hotelId: hotelChess.hotelId, id: hotelChess.roomId }
                })
                const updatedRequest = await prisma.request.update({
                  where: { id: hotelChess.requestId },
                  data: {
                    status: "transferred",
                    hotel: { connect: { id } },
                    hotelChess: { connect: { id: hotelChess.id } },
                    roomCategory: room?.category,
                    roomNumber: room?.name
                    // mealPlan: mealPlanData
                  }
                })
                await logAction({
                  context,
                  action: "update_hotel_chess",
                  description: `Заявка № <span style='color:#545873'>${updatedRequest.requestNumber}</span> была перенесена в номер <span style='color:#545873'>${room.name}</span> пользователем <span style='color:#545873'>${user.name}</span>`,
                  oldData: previousHotelChessData,
                  newData: hotelChess,
                  hotelId: hotelChess.hotelId,
                  requestId: updatedRequest.id
                })
                pubsub.publish(REQUEST_UPDATED, {
                  requestUpdated: updatedRequest
                })
              } else if (hotelChess.reserveId) {
                const room = await prisma.room.findUnique({
                  where: { hotelId: hotelChess.hotelId, id: hotelChess.roomId }
                })
                // Обработка для заявки типа "reserve"
                await prisma.reserve.update({
                  where: { id: hotelChess.reserveId },
                  data: {
                    hotelChess: { connect: { id: hotelChess.id } }
                    // mealPlan: mealPlanData
                  }
                })
                await logAction({
                  context,
                  action: "update_hotel_chess",
                  description: `Бронь № <span style='color:#545873'>${hotelChess.reserveId}</span> была перенесена в номер <span style='color:#545873'>${room.name}</span> пользователем <span style='color:#545873'>${user.name}</span>`,
                  oldData: previousHotelChessData,
                  newData: hotelChess,
                  hotelId: hotelChess.hotelId,
                  reserveId: hotelChess.reserveId
                })
              }
            } else {
              // Создание новой записи для HotelChess
              let newHotelChess
              if (hotelChess.reserveId) {
                try {
                  newHotelChess = await prisma.hotelChess.create({
                    data: {
                      hotel: { connect: { id } },
                      public: hotelChess.public,
                      room: { connect: { id: hotelChess.roomId } },
                      place: hotelChess.place,
                      start: hotelChess.start,
                      end: hotelChess.end,
                      passenger: { connect: { id: hotelChess.clientId } },
                      reserve: { connect: { id: hotelChess.reserveId } },
                      status: hotelChess.status,
                      mealPlan: mealPlanData
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
              } else {
                newHotelChess = await prisma.hotelChess.create({
                  data: {
                    hotel: { connect: { id } },
                    public: hotelChess.public,
                    room: { connect: { id: hotelChess.roomId } },
                    place: hotelChess.place,
                    start: hotelChess.start,
                    end: hotelChess.end,
                    client: { connect: { id: hotelChess.clientId } },
                    request: hotelChess.requestId
                      ? { connect: { id: hotelChess.requestId } }
                      : undefined,
                    status: hotelChess.status,
                    mealPlan: mealPlanData
                  }
                })
              }

              if (hotelChess.requestId) {
                // Обработка для новой заявки (request)
                const room = await prisma.room.findUnique({
                  where: { hotelId: hotelChess.hotelId, id: hotelChess.roomId }
                })
                const arrival = hotelChess.start.toString()
                const departure = hotelChess.end.toString()
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
                const calculatedMealPlan = calculateMeal(
                  arrival,
                  departure,
                  mealTimes
                )
                const updatedRequest = await prisma.request.update({
                  where: { id: hotelChess.requestId },
                  data: {
                    status: "done",
                    hotel: { connect: { id } },
                    mealPlan: {
                      included: true,
                      breakfast: calculatedMealPlan.totalBreakfast,
                      lunch: calculatedMealPlan.totalLunch,
                      dinner: calculatedMealPlan.totalDinner,
                      dailyMeals: calculatedMealPlan.dailyMeals.map((dm) => ({
                        date: new Date(dm.date),
                        breakfast: dm.breakfast,
                        lunch: dm.lunch,
                        dinner: dm.dinner
                      }))
                    },
                    roomCategory: room?.category,
                    roomNumber: room?.name
                  },
                  include: {
                    hotel: true,
                    person: true,
                    hotelChess: true
                  }
                })

                const oldChat = await prisma.chat.findFirst({
                  where: {
                    request: { id: updatedRequest.id },
                    separator: "hotel"
                  }
                })

                if (!oldChat) {
                  const newChat = await prisma.chat.create({
                    data: {
                      request: { connect: { id: updatedRequest.id } },
                      separator: "hotel"
                    }
                  })
                  await prisma.chatUser.create({
                    data: {
                      chat: { connect: { id: newChat.id } },
                      user: { connect: { id: user.id } }
                    }
                  })
                }

                await logAction({
                  context,
                  action: "update_hotel_chess",
                  description: `<span style='color:#545873'>${
                    updatedRequest.person.name
                  }</span> был размещён в отеле <span style='color:#545873'>${
                    hotel?.name 
                  }</span> в номер <span style='color:#545873'>${
                    room.name
                  }</span> по заявке <span style='color:#545873'>№ ${
                    updatedRequest.requestNumber
                  }</span> пользователем <span style='color:#545873'>${
                    user.name
                  }</span>`,
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
                    hotelChess: { connect: { id: newHotelChess.id } },
                    mealPlan: mealPlanData
                  }
                })
                await logAction({
                  context,
                  action: "update_hotel_chess",
                  description: `Бронь № <span style='color:#545873'>${hotelChess.reserveId}</span> была создана пользователем <span style='color:#545873'>${user.name}</span>`,
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
            const places = calculatePlaces(room.category)
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
              const updatedRoomData = {
                name: room.name,
                category: room.category,
                reserve: room.reserve,
                active: room.active,
                description: room.description,
                places: places,
                ...(roomImages && { images: imagePaths })
              }
              await prisma.room.update({
                where: { id: room.id },
                data: updatedRoomData
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
                hotelId: id
              })
            }
          }
          await updateHotelRoomCounts(id)
        }

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
        throw new Error("Не удалось обновить отель")
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
        action: "delete_hotel",
        description: {},
        oldData: hotelToDelete,
        newData: hotelToDelete,
        hotelId: id
      })
      if (deletedHotel.images && deletedHotel.images.length > 0) {
        for (const imagePath of deletedHotel.images) {
          await deleteImage(imagePath)
        }
      }
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
        action: "delete_room",
        description: {},
        oldData: roomToDelete,
        newData: roomToDelete,
        hotelId: roomToDelete.hotelId
      })
      if (deletedRoom.images && deletedRoom.images.length > 0) {
        for (const imagePath of deletedRoom.images) {
          await deleteImage(imagePath)
        }
      }
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

  HotelChess: {
    // client: async (parent) => {
    //   if (!parent.clientId) return null
    //   return await prisma.airlinePersonal.findUnique({
    //     where: { id: parent.clientId }
    //   })
    // },
    passenger: async (parent) => {
      if (!parent.passengerId) return null
      return await prisma.passenger.findUnique({
        where: { id: parent.passengerId }
      })
    },
    request: async (parent) => {
      if (!parent.requestId || typeof parent.requestId !== "string") return null
      return await prisma.request.findUnique({
        where: { id: parent.requestId }
      })
    },
    reserve: async (parent) => {
      if (!parent.reserveId || typeof parent.reserveId !== "string") return null
      return await prisma.reserve.findUnique({
        where: { id: parent.reserveId }
      })
    },
    room: async (parent) => {
      if (!parent.roomId) return null
      return await prisma.room.findUnique({ where: { id: parent.roomId } })
    }
  }
}

const updateHotelRoomCounts = async (hotelId) => {
  // Подсчёт резервных комнат
  const provisionCount = await prisma.room.count({
    where: {
      hotelId,
      reserve: true
    }
  })

  // Подсчёт квотных комнат
  const quoteCount = await prisma.room.count({
    where: {
      hotelId,
      reserve: false
    }
  })

  // Обновляем поля отеля
  const updatedHotel = await prisma.hotel.update({
    where: { id: hotelId },
    data: {
      provision: provisionCount,
      quote: quoteCount
    }
  })

  return updatedHotel
}

export default hotelResolver

import { prisma } from "../../prisma.js"
import isEqual from "lodash.isequal"
import logAction from "../../exports/logaction.js"
import {
  pubsub,
  RESERVE_CREATED,
  RESERVE_HOTEL,
  RESERVE_PERSONS,
  RESERVE_UPDATED
} from "../../exports/pubsub.js"
import calculateMeal from "../../exports/calculateMeal.js"
import updateDailyMeals from "../../exports/updateDailyMeals.js"
// Предполагается, что middleware для airlineAdmin уже подключён там, где необходимо:
import { airlineAdminMiddleware } from "../../middlewares/authMiddleware.js"

// ===================
// QUERY RESOLVERS
// ===================

const reserveResolver = {
  Query: {
    reserves: async (_, { pagination }, context) => {
      const { skip, take, status } = pagination
      // Фильтрация по статусу: если status отсутствует или содержит "all", не фильтруем по статусу
      const statusFilter =
        !status || status.length === 0 || status.includes("all")
          ? {}
          : { status: { in: status } }

      // Подсчет общего количества записей (архив можно исключать по необходимости)
      const totalCount = await prisma.reserve.count({
        where: {
          ...statusFilter
          // archive: { not: true },
        }
      })
      const totalPages = Math.ceil(totalCount / take)

      const reserves = await prisma.reserve.findMany({
        where: {
          ...statusFilter
          // archive: { not: true },
        },
        skip: skip * take,
        take: take,
        include: {
          airline: true,
          airport: true,
          // person: true,
          passengers: true,
          hotel: true,
          hotelChess: true,
          chat: true,
          logs: true
        },
        orderBy: { createdAt: "desc" }
      })
      return {
        totalCount,
        reserves,
        totalPages
      }
    },

    reserveArchive: async (_, { pagination }, context) => {
      airlineAdminMiddleware(context)
      const { skip, take, status } = pagination
      const statusFilter =
        status && status.includes("all") ? {} : { status: { in: status } }

      const totalCount = await prisma.reserve.count({
        where: {
          ...statusFilter,
          archive: true
        }
      })
      const totalPages = Math.ceil(totalCount / take)
      const reserves = await prisma.reserve.findMany({
        where: {
          ...statusFilter,
          archive: true
        },
        skip: skip * take,
        take: take,
        include: {
          airline: true,
          airport: true,
          // person: true,
          passengers: true,
          hotel: true,
          hotelChess: true,
          chat: true,
          logs: true
        },
        orderBy: { createdAt: "desc" }
      })
      return {
        totalCount,
        reserves,
        totalPages
      }
    },

    reserve: async (_, { id }, context) => {
      const reserve = await prisma.reserve.findUnique({
        where: { id },
        include: {
          airline: true,
          airport: true,
          // person: true,
          passengers: true,
          hotel: true,
          hotelChess: true,
          chat: true,
          logs: true
        }
      })
      if (!reserve) {
        throw new Error("Reserve not found")
      }
      const { user } = context
      // Если пользователь не является диспетчером и не привязан к отелю – просто возвращаем резерв
      if (!user.dispatcher && !user.hotelId) {
        return reserve
      }
      // Если заявка в статусе "created", обновляем статус на "opened"
      if (reserve.status === "created") {
        const updatedReserve = await prisma.reserve.update({
          where: { id },
          data: { status: "opened" }
        })
        const existingLog = await prisma.log.findFirst({
          where: {
            action: "open_reserve",
            reserveId: updatedReserve.id
          }
        })
        if (!existingLog) {
          try {
            await logAction({
              context,
              action: "open_reserve",
              description: `Reserve № ${updatedReserve.reserveNumber} opened by ${user.name}`,
              oldData: { status: "created" },
              newData: { status: "opened" },
              reserveId: updatedReserve.id
            })
          } catch (error) {
            console.error("Error logging reserve open:", error)
          }
        }
        pubsub.publish(RESERVE_UPDATED, { reserveUpdated: updatedReserve })
        return updatedReserve
      }
      return reserve
    },

    reservationHotels: async (_, { id }, context) => {
      return await prisma.reserveHotel.findMany({
        where: { reserveId: id },
        include: {
          reserve: true,
          hotel: true,
          // person: true,
          passengers: true,
          hotelChess: true
        }
      })
    },

    reservationHotel: async (_, { id }, context) => {
      return await prisma.reserveHotel.findUnique({
        where: { id },
        include: {
          reserve: true,
          hotel: true,
          // person: true,
          passengers: true,
          hotelChess: true
        }
      })
    },

    reservationPassengers: async (_, { reservationId }, context) => {
      return await prisma.passenger.findMany({
        where: { reserveId: reservationId },
        include: {
          // person: true,
          hotel: true
        }
      })
    }
  },

  Mutation: {
    // createReserve: async (_, { input }, context) => {
    //   const { user } = context
    //   const {
    //     airportId,
    //     arrival,
    //     departure,
    //     mealPlan,
    //     airlineId,
    //     senderId,
    //     status,
    //     passengerCount,
    //     persons,
    //     reserveForPerson
    //   } = input
    //   // Генерация номера резерва
    //   const reserveCount = await prisma.reserve.count()
    //   const airport = await prisma.airport.findUnique({
    //     where: { id: airportId }
    //   })
    //   if (!airport) {
    //     throw new Error("Airport not found")
    //   }
    //   const currentDate = new Date()
    //   const formattedDate = currentDate
    //     .toLocaleDateString("ru-RU")
    //     .replace(/\./g, ".")
    //   const reserveNumber = `${String(reserveCount + 1).padStart(4, "0")}-${
    //     airport.code
    //   }-${formattedDate}`
    //   // Создание резерва
    //   const newReserve = await prisma.reserve.create({
    //     data: {
    //       airport: { connect: { id: airportId } },
    //       arrival,
    //       departure,
    //       mealPlan,
    //       airline: { connect: { id: airlineId } },
    //       sender: { connect: { id: senderId } },
    //       status,
    //       reserveNumber,
    //       persons,
    //       passengerCount,
    //       reserveForPerson
    //     },
    //     include: {
    //       airline: true,
    //       airport: true,
    //       person: true,
    //       passengers: true,
    //       hotel: true,
    //       hotelChess: true,
    //       chat: true
    //     }
    //   })
    //   // Создание чата, связанного с резервацией
    //   const newChat = await prisma.chat.create({
    //     data: {
    //       reserve: { connect: { id: newReserve.id } },
    //       separator: "airline"
    //     }
    //   })
    //   await prisma.chatUser.create({
    //     data: {
    //       chat: { connect: { id: newChat.id } },
    //       user: { connect: { id: senderId } }
    //     }
    //   })
    //   await logAction({
    //     context,
    //     action: "create_reserve",
    //     description: `User ${user.name} created reserve № ${newReserve.reserveNumber} for airport ${newReserve.airport.name}`,
    //     reserveId: newReserve.id,
    //     airlineId: newReserve.airlineId
    //   })
    //   pubsub.publish(RESERVE_CREATED, { reserveCreated: newReserve })
    //   return newReserve
    // },

   
    // Создание резерва (remove person from input)
    createReserve: async (_, { input }, context) => {
      const { user } = context
      const {
        airportId,
        arrival,
        departure,
        mealPlan, // Можно оставить, если требуется, но лучше рассчитывать отдельно
        airlineId,
        senderId,
        status,
        // persons удалено,
        passengers,
        passengerCount,
        // reserveForPerson
      } = input

      // Генерация номера резерва
      const reserveCount = await prisma.reserve.count()
      const airport = await prisma.airport.findUnique({
        where: { id: airportId }
      })
      if (!airport) {
        throw new Error("Airport not found")
      }
      const currentDate = new Date()
      const formattedDate = currentDate
        .toLocaleDateString("ru-RU")
        .replace(/\./g, ".")
      const reserveNumber = `${String(reserveCount + 1).padStart(4, "0")}-${
        airport.code
      }-${formattedDate}`

      // Создание резерва без поля person
      const newReserve = await prisma.reserve.create({
        data: {
          airport: { connect: { id: airportId } },
          arrival,
          departure,
          mealPlan, // можно задать первоначальный план, либо рассчитывать позже
          airline: { connect: { id: airlineId } },
          sender: { connect: { id: senderId } },
          status,
          reserveNumber,
          // persons не передаем,
          passengers,
          passengerCount,
          // reserveForPerson
        },
        include: {
          airline: true,
          airport: true,
          // person не включаем,
          passengers: true,
          hotel: true,
          hotelChess: true,
          chat: true
        }
      })

      // Создание чата, связанного с резервацией
      const newChat = await prisma.chat.create({
        data: {
          reserve: { connect: { id: newReserve.id } },
          separator: "airline"
        }
      })
      await prisma.chatUser.create({
        data: {
          chat: { connect: { id: newChat.id } },
          user: { connect: { id: senderId } }
        }
      })

      await logAction({
        context,
        action: "create_reserve",
        description: `User ${user.name} created reserve № ${newReserve.reserveNumber} for airport ${newReserve.airport.name}`,
        reserveId: newReserve.id,
        airlineId: newReserve.airlineId
      })
      pubsub.publish(RESERVE_CREATED, { reserveCreated: newReserve })
      return newReserve
    },

    // Обновление резерва с автоматическим обновлением плана питания в hotelChess
    updateReserve: async (_, { id, input }, context) => {
      const { user } = context
      // Из входного объекта убираем поле persons (теперь его нет)
      const { arrival, departure, mealPlan, status } = input

      // Обновляем резерв
      const updatedReserve = await prisma.reserve.update({
        where: { id },
        data: {
          arrival,
          departure,
          mealPlan, // резерв может содержать план питания, но мы обновляем и hotelChess
          status
        },
        include: { hotelChess: true }
      })

      // Если у резерва уже есть связанные записи в hotelChess, обновляем для каждой план питания
      if (updatedReserve.hotelChess && updatedReserve.hotelChess.length > 0) {
        for (const hc of updatedReserve.hotelChess) {
          // Получаем настройки питания от отеля, к которому привязана hotelChess
          const hotelInfo = await prisma.hotel.findUnique({
            where: { id: hc.hotelId },
            select: { breakfast: true, lunch: true, dinner: true }
          })
          if (hotelInfo) {
            const calculatedMealPlan = calculateMeal(
              updatedReserve.arrival.toString(),
              updatedReserve.departure.toString(),
              {
                breakfast: hotelInfo.breakfast,
                lunch: hotelInfo.lunch,
                dinner: hotelInfo.dinner
              }
            )
            await prisma.hotelChess.update({
              where: { id: hc.id },
              data: {
                mealPlan: {
                  included: true,
                  breakfast: calculatedMealPlan.totalBreakfast,
                  lunch: calculatedMealPlan.totalLunch,
                  dinner: calculatedMealPlan.totalDinner,
                  dailyMeals: calculatedMealPlan.dailyMeals
                }
              }
            })
          }
        }
      }

      pubsub.publish(RESERVE_UPDATED, { reserveUpdated: updatedReserve })
      return updatedReserve
    },

    updateReserve: async (_, { id, input }, context) => {
      const { user } = context
      const { arrival, departure, mealPlan, status } = input
      const updatedReserve = await prisma.reserve.update({
        where: { id },
        data: {
          arrival,
          departure,
          mealPlan,
          status,
          // persons
        }
      })
      pubsub.publish(RESERVE_UPDATED, { reserveUpdated: updatedReserve })
      return updatedReserve
    },

    addHotelToReserve: async (
      _,
      { reservationId, hotelId, capacity },
      context
    ) => {
      const { user } = context
      try {
        const reserveHotel = await prisma.reserveHotel.create({
          data: {
            reserve: { connect: { id: reservationId } },
            hotel: { connect: { id: hotelId } },
            capacity
          },
          include: { hotel: true }
        })
        const oldChat = await prisma.chat.findFirst({
          where: {
            reserve: { id: reservationId },
            hotel: { id: hotelId },
            separator: "hotel"
          }
        })
        if (!oldChat) {
          const newChat = await prisma.chat.create({
            data: {
              reserve: { connect: { id: reservationId } },
              hotel: { connect: { id: hotelId } },
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
          action: "update_reserve",
          description: `Added hotel ${reserveHotel.hotel.name} to reserve № ${reserveHotel.reserve.reserveNumber}`,
          reserveId: reserveHotel.reservationId,
          hotelId: reserveHotel.hotelId
        })
        pubsub.publish(RESERVE_HOTEL, { reserveHotel })
        return reserveHotel
      } catch (error) {
        if (
          error.code === "P2002" &&
          error.meta?.target?.includes("reserveId_hotelId")
        ) {
          throw new Error("This reserve and hotel combination already exists.")
        }
        throw error
      }
    },

    addPassengerToReserve: async (
      _,
      { reservationId, input, hotelId, capacity },
      context
    ) => {
      const { user } = context
      const { name, number, gender, child, animal } = input
      const reserve = await prisma.reserve.findUnique({
        where: { id: reservationId }
      })
      if (!reserve) {
        throw new Error("Reservation not found")
      }
      // if (reserve.reserveForPerson !== false) {
      //   throw new Error("Reservation created for persons")
      // }
      let reserveHotel = await prisma.reserveHotel.findFirst({
        where: {
          reserveId: reservationId,
          hotelId: hotelId
        },
        include: { hotel: true }
      })
      if (!reserveHotel) {
        reserveHotel = await prisma.reserveHotel.create({
          data: {
            reserve: { connect: { id: reservationId } },
            hotel: { connect: { id: hotelId } },
            capacity: capacity || 1
          },
          include: { hotel: true }
        })
      }
      const newPassenger = await prisma.passenger.create({
        data: {
          name,
          number,
          gender,
          child: child || false,
          animal: animal || false,
          reserve: { connect: { id: reservationId } },
          reserveHotel: { connect: { id: reserveHotel.id } }
        }
      })
      await logAction({
        context,
        action: "update_reserve",
        description: `Added passenger ${newPassenger.name} to hotel ${reserveHotel.hotel.name} for reserve № ${reserve.reserveNumber}`,
        reserveId: reserveHotel.reservationId,
        hotelId: reserveHotel.hotelId
      })
      pubsub.publish(RESERVE_PERSONS, { reservePersons: reserveHotel })
      return newPassenger
    },

    deletePassengerFromReserve: async (_, { id }, context) => {
      const { user } = context
      const deletedPassenger = await prisma.passenger.delete({
        where: { id }
      })
      const reserveHotel = await prisma.reserveHotel.findUnique({
        where: { id: deletedPassenger.reserveHotelId }
      })
      pubsub.publish(RESERVE_PERSONS, { reservePersons: reserveHotel })
      return reserveHotel
    },

    // assignPersonToHotel: async (_, { input }, context) => {
    //   const { user } = context
    //   const { reservationId, personId, hotelId, capacity } = input
    //   const [reserve, person, hotel] = await Promise.all([
    //     prisma.reserve.findUnique({ where: { id: reservationId } }),
    //     prisma.airlinePersonal.findUnique({ where: { id: personId } }),
    //     prisma.hotel.findUnique({ where: { id: hotelId } })
    //   ])
    //   if (!reserve) {
    //     throw new Error("Reservation not found")
    //   }
    //   if (reserve.reserveForPerson !== true) {
    //     throw new Error("Reservation created for passengers")
    //   }
    //   if (!person) {
    //     throw new Error("Person not found")
    //   }
    //   if (!hotel) {
    //     throw new Error("Hotel not found")
    //   }
    //   let reserveHotel = await prisma.reserveHotel.findUnique({
    //     where: {
    //       reserveId_hotelId: {
    //         reserveId: reservationId,
    //         hotelId: hotelId
    //       }
    //     }
    //   })
    //   if (!reserveHotel) {
    //     reserveHotel = await prisma.reserveHotel.create({
    //       data: {
    //         reserve: { connect: { id: reservationId } },
    //         hotel: { connect: { id: hotelId } },
    //         capacity: capacity || 1
    //       }
    //     })
    //   }
    //   const reserveHotelPersonal = await prisma.reserveHotelPersonal.create({
    //     data: {
    //       reserveHotel: { connect: { id: reserveHotel.id } },
    //       airlinePersonal: { connect: { id: personId } }
    //     }
    //   })
    //   pubsub.publish(RESERVE_PERSONS, { reservePersons: reserveHotel })
    //   return person
    // },

    // dissociatePersonFromHotel: async (
    //   _,
    //   { reserveHotelId, airlinePersonalId },
    //   context
    // ) => {
    //   const { user } = context
    //   const reserveHotelPersonal = await prisma.reserveHotelPersonal.findUnique(
    //     {
    //       where: {
    //         reserveHotelId_airlinePersonalId: {
    //           reserveHotelId,
    //           airlinePersonalId
    //         }
    //       }
    //     }
    //   )
    //   if (!reserveHotelPersonal) return null
    //   const reserveHotel = await prisma.reserveHotel.findUnique({
    //     where: { id: reserveHotelPersonal.reserveHotelId }
    //   })
    //   if (!reserveHotel) return null
    //   await prisma.reserveHotelPersonal.delete({
    //     where: { id: reserveHotelPersonal.id }
    //   })
    //   pubsub.publish(RESERVE_PERSONS, { reservePersons: reserveHotel })
    //   return reserveHotel
    // },

    archivingReserve: async (_, input, context) => {
      const { user } = context
      const reserveId = input.id
      const reserve = await prisma.reserve.findUnique({
        where: { id: reserveId }
      })
      if (
        new Date(reserve.departure.date) < new Date(Date.now()) &&
        reserve.status !== "archived"
      ) {
        const archiveReserve = await prisma.reserve.update({
          where: { id: reserveId },
          data: { status: "archived", archive: true }
        })
        await logAction({
          context,
          action: "archive_reserve",
          description: `User ${user.name} archived reserve № ${archiveReserve.reserveNumber}`,
          oldData: reserve,
          newData: { status: "archived" },
          reserveId: reserve.id
        })
        pubsub.publish(RESERVE_UPDATED, { reserveUpdated: archiveReserve })
        return archiveReserve
      } else {
        throw new Error("Reserve is not expired or already archived")
      }
    }
  },

  Subscription: {
    reserveCreated: {
      subscribe: () => pubsub.asyncIterator([RESERVE_CREATED])
    },
    reserveUpdated: {
      subscribe: () => pubsub.asyncIterator([RESERVE_UPDATED])
    },
    reserveHotel: {
      subscribe: () => pubsub.asyncIterator([RESERVE_HOTEL])
    },
    reservePersons: {
      subscribe: () => pubsub.asyncIterator([RESERVE_PERSONS])
    }
  },

  Reserve: {
    hotel: async (parent) => {
      return await prisma.reserveHotel.findMany({
        where: { reserveId: parent.id }
      })
    },
    hotelChess: async (parent) => {
      return await prisma.hotelChess.findMany({
        where: { reserveId: parent.id }
      })
    },
    // person: async (parent) => {
    //   return await prisma.airlinePersonal.findMany({
    //     where: { id: parent.reservationId }
    //   })
    // },
    passengers: async (parent) => {
      return await prisma.passenger.findMany({
        where: { reserveId: parent.id }
      })
    }
  },

  ReserveHotel: {
    reserve: async (parent) => {
      return await prisma.reserve.findUnique({
        where: { id: parent.reserveId }
      })
    },
    hotel: async (parent) => {
      return await prisma.hotel.findUnique({
        where: { id: parent.hotelId }
      })
    },
    // person: async (parent) => {
    //   return await prisma.airlinePersonal.findMany({
    //     where: { reserveHotel: { some: { reserveHotelId: parent.id } } }
    //   })
    // },
    passengers: async (parent) => {
      return await prisma.passenger.findMany({
        where: { reserveHotelId: parent.id }
      })
    },
    hotelChess: async (parent) => {
      return await prisma.hotelChess.findMany({
        where: { hotelId: parent.hotelId, reserveId: parent.reserveId }
      })
    }
  },

  Passenger: {
    reserve: async (parent) => {
      return await prisma.reserve.findUnique({
        where: { id: parent.reserveId }
      })
    }
  },

  ReserveHotelPersonal: {
    // person: async (parent) => {
    //   return await prisma.airlinePersonal.findMany({
    //     where: {
    //       reserveHotel: {
    //         some: {
    //           reserveHotelId: parent.reserveHotelId
    //         }
    //       }
    //     }
    //   })
    // },
    passengers: async (parent) => {
      return await prisma.passenger.findMany({
        where: { reserveId: parent.reserveId }
      })
    },
    reserveHotel: async (parent) => {
      return await prisma.reserveHotel.findUnique({
        where: {
          reserveId_hotelId: {
            reserveId: parent.reserveId,
            hotelId: parent.hotelId
          }
        }
      })
    }
  }
}

export default reserveResolver

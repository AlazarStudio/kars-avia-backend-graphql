import { prisma } from "../../prisma.js"
import GraphQLUpload from "graphql-upload/GraphQLUpload.mjs"
import isEqual from "lodash.isequal"
import logAction from "../../exports/logaction.js"
import {
  MESSAGE_SENT,
  NOTIFICATION,
  pubsub,
  RESERVE_CREATED,
  RESERVE_HOTEL,
  RESERVE_PERSONS,
  RESERVE_UPDATED
} from "../../exports/pubsub.js"
import calculateMeal from "../../exports/calculateMeal.js"
import updateDailyMeals from "../../exports/updateDailyMeals.js"
import { airlineAdminMiddleware } from "../../middlewares/authMiddleware.js"
import { uploadFiles, deleteFiles } from "../../exports/uploadFiles.js"
import { formatDate } from "../../exports/dateTimeFormater.js"
import {
  generateReserveExcel,
  generateReservePdf
} from "../../exports/generateReservePas.js"
import path from "path"
import fs from "fs"

const reserveResolver = {
  Upload: GraphQLUpload,
  Query: {
    reserves: async (_, { pagination }, context) => {
      const { skip, take, status } = pagination
      const statusFilter =
        !status || status.length === 0 || status.includes("all")
          ? {}
          : { status: { in: status } }

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
    createReserve: async (_, { input, files }, context) => {
      const { user } = context
      const {
        airportId,
        arrival,
        departure,
        mealPlan,
        airlineId,
        senderId,
        status,
        passengers,
        passengerCount
      } = input

      // Генерация номера резерва
      // const reserveCount = await prisma.reserve.count()
      // const currentDate = new Date()
      // const formattedDate = currentDate
      //   .toLocaleDateString("ru-RU")
      //   .replace(/\./g, ".")
      // const reserveNumber = `${String(reserveCount + 1).padStart(4, "0")}-${
      //   airport.code
      // }-${formattedDate}`

      // const currentDate = new Date()
      // const month = String(currentDate.getMonth() + 1).padStart(2, "0")
      // const year = String(currentDate.getFullYear()).slice(-2)

      // const startOfMonth = new Date(
      //   currentDate.getFullYear(),
      //   currentDate.getMonth(),
      //   1
      // )
      // const endOfMonth = new Date(
      //   currentDate.getFullYear(),
      //   currentDate.getMonth() + 1,
      //   0,
      //   23,
      //   59,
      //   59
      // )
      // const reserveCount = await prisma.reserve.count({
      //   where: {
      //     createdAt: {
      //       gte: startOfMonth,
      //       lte: endOfMonth
      //     }
      //   }
      // })

      // const airport = await prisma.airport.findUnique({
      //   where: { id: airportId }
      // })
      // if (!airport) {
      //   throw new Error("Airport not found")
      // }

      // const sequenceNumber = String(reserveCount + 1).padStart(4, "0")
      // const reserveNumber = `${sequenceNumber}${airport.code}${month}${year}p`

      // Определяем текущий месяц и год
      const currentDate = new Date()
      const month = String(currentDate.getMonth() + 1).padStart(2, "0") // двузначный номер месяца
      const year = String(currentDate.getFullYear()).slice(-2)

      // Определяем границы месяца
      const startOfMonth = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth(),
        1
      )
      const endOfMonth = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth() + 1,
        0,
        23,
        59,
        59
      )

      // Ищем последнюю созданную заявку в этом месяце
      const lastreserve = await prisma.reserve.findFirst({
        where: { createdAt: { gte: startOfMonth, lte: endOfMonth } },
        orderBy: { createdAt: "desc" } // Последняя заявка
      })

      // Определяем номер
      let sequenceNumber
      if (lastreserve) {
        // Если заявки есть, увеличиваем номер
        const lastNumber = parseInt(lastreserve.reserveNumber.slice(0, 4), 10)
        sequenceNumber = String(lastNumber + 1).padStart(4, "0")
      } else {
        // Если заявок еще не было в этом месяце, начинаем с 0001
        sequenceNumber = "0001"
      }

      // Получаем код аэропорта
      const airport = await prisma.airport.findUnique({
        where: { id: airportId }
      })
      if (!airport) {
        throw new Error("Airport not found")
      }

      // Формируем номер заявки
      const reserveNumber = `${sequenceNumber}${airport.code}${month}${year}p`

      let filesPath = []
      if (files && files.length > 0) {
        for (const file of files) {
          const uploadedPath = await uploadFiles(file)
          filesPath.push(uploadedPath)
        }
      }

      const newReserve = await prisma.reserve.create({
        data: {
          airport: { connect: { id: airportId } },
          arrival,
          departure,
          mealPlan,
          airline: { connect: { id: airlineId } },
          sender: { connect: { id: senderId } },
          status,
          reserveNumber,
          passengers,
          passengerCount,
          files: filesPath
        },
        include: {
          airline: true,
          airport: true,
          passengers: true,
          hotel: true,
          hotelChess: true,
          chat: true
        }
      })

      const newChat = await prisma.chat.create({
        data: {
          reserve: { connect: { id: newReserve.id } },
          separator: "airline",
          airline: { connect: { id: airlineId } }
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
        description: `Пользователь ${user.name} создал заявку № ${newReserve.reserveNumber} в аэропорт ${newReserve.airport.name}`,
        reserveId: newReserve.id,
        airlineId: newReserve.airlineId
      })

      pubsub.publish(NOTIFICATION, {
        notification: {
          __typename: "ReserveCreatedNotification",
          ...newReserve
        }
      })
      pubsub.publish(RESERVE_CREATED, { reserveCreated: newReserve })
      return newReserve
    },

    updateReserve: async (_, { id, input, files }, context) => {
      const { user } = context
      const { arrival, departure, mealPlan, status } = input
      airlineAdminMiddleware(context)
      const currentTime = new Date()
      const adjustedTime = new Date(currentTime.getTime() + 3 * 60 * 60 * 1000)
      const formattedTime = adjustedTime.toISOString()

      const reserve = await prisma.reserve.findUnique({
        where: { id },
        include: {
          airline: true,
          airport: true,
          passengers: true,
          hotel: true,
          hotelChess: true,
          chat: true
        }
      })

      let filesPath = []
      if (files && files.length > 0) {
        for (const file of files) {
          const uploadedPath = await uploadFiles(file)
          filesPath.push(uploadedPath)
        }
      }

      if (filesPath.length > 0) {
        if (reserve.files && reserve.files.length > 0) {
          for (const filePath of reserve.files) {
            await deleteFiles(filePath)
          }
        }
        await prisma.reserve.update({
          where: { id },
          data: {
            files: filesPath
          }
        })
      }

      if (user.airlineId) {
        const extendRequest = {
          id,
          arrival,
          departure
        }
        const updatedStart = arrival ? arrival : reserve.arrival
        const updatedEnd = departure ? departure : reserve.departure
        const chat = await prisma.chat.findFirst({
          where: { reserveId: id, separator: "airline" }
        })
        const message = await prisma.message.create({
          data: {
            text: `Запрос на изменение дат заявки ${
              reserve.reserveNumber
            } с ${formatDate(reserve.arrival)} - ${formatDate(
              reserve.departure
            )} на ${formatDate(updatedStart)} - ${formatDate(updatedEnd)}`,
            sender: { connect: { id: user.id } },
            chat: { connect: { id: chat.id } },
            separator: "important",
            createdAt: formattedTime
          },
          include: {
            sender: true
          }
        })

        pubsub.publish(NOTIFICATION, {
          notification: {
            __typename: "ReserveUpdatedNotification",
            ...extendRequest
          }
        })
        pubsub.publish(`${MESSAGE_SENT}_${chat.id}`, { messageSent: message })
        // const message = `Запрос на продление заявки ${request.requestNumber} отправлен диспетчеру.`
        return extendRequest
      }

      // Обновляем резерв
      const updatedReserve = await prisma.reserve.update({
        where: { id },
        data: {
          arrival,
          departure,
          mealPlan,
          status,
          files: filesPath
        },
        include: { hotelChess: true }
      })

      if (updatedReserve.hotelChess && updatedReserve.hotelChess.length > 0) {
        for (const hc of updatedReserve.hotelChess) {
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
                start: updatedReserve.arrival,
                end: updatedReserve.departure,
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

    // updateReserve: async (_, { id, input }, context) => {
    //   const { user } = context
    //   const { arrival, departure, mealPlan, status } = input
    //   const updatedReserve = await prisma.reserve.update({
    //     where: { id },
    //     data: {
    //       arrival,
    //       departure,
    //       mealPlan,
    //       status
    //       // persons
    //     }
    //   })
    //   pubsub.publish(RESERVE_UPDATED, { reserveUpdated: updatedReserve })
    //   return updatedReserve
    // },

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
          console.log("newChat", newChat)
        }
        const updatedReserve = await prisma.reserve.findUnique({
          where: { id: reservationId },
          include: {
            chat: true
          }
        })
        await logAction({
          context,
          action: "update_reserve",
          description: `К заявке добавлен отель ${reserveHotel.hotel.name}`,
          reserveId: reserveHotel.reservationId,
          hotelId: reserveHotel.hotelId
        })
        pubsub.publish(RESERVE_UPDATED, { reserveUpdated: updatedReserve })
        pubsub.publish(RESERVE_HOTEL, { reserveHotel })
        return reserveHotel
      } catch (error) {
        console.error(error)
        // if (
        //   error.code === "P2002" &&
        //   error.meta?.target?.includes("reserveId_hotelId")
        // ) {
        //   throw new Error("This reserve and hotel combination already exists.")
        // }
        // throw error
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
      const updatedReserveHotel = await prisma.reserveHotel.findUnique({
        where: { id: reserveHotel.id },
        include: { passengers: true }
      })
      await logAction({
        context,
        action: "update_reserve",
        description: `Пассажир ${newPassenger.name} в отель ${reserveHotel.hotel.name} для резерва № ${reserve.reserveNumber}`,
        reserveId: reservationId,
        hotelId: hotelId
      })

      pubsub.publish(RESERVE_PERSONS, { reservePersons: updatedReserveHotel })
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

    generateReservePassengerFile: async (_, { reserveId, format }, context) => {
      // **Получаем данные о резерве из Prisma**
      const reserve = await prisma.reserve.findUnique({
        where: { id: reserveId },
        include: {
          hotel: {
            include: {
              hotel: {
                select: {
                  name: true,
                  information: {
                    select: { address: true }
                  }
                }
              },
              passengers: {
                select: {
                  name: true,
                  number: true,
                  gender: true
                }
              }
            }
          }
        }
      })

      // **Если данных нет, выбрасываем ошибку**
      if (!reserve || !reserve.hotel || reserve.hotel.length === 0) {
        throw new Error("Резерв с таким ID не найден или в нем нет отелей.")
      }

      const listName = `reserve_${reserveId}_${Date.now()}.${format}`
      const listPath = path.resolve(`./reserve/${listName}`)
      fs.mkdirSync(path.dirname(listPath), { recursive: true })

      if (format === "xlsx") {
        await generateReserveExcel(reserve, listPath)
      } else {
        throw new Error("Unsupported format")
      }

      return {
        name: listName,
        url: `/reserve/${listName}`
      }
    },

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

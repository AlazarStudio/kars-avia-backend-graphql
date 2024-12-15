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

const reserveResolver = {
  Query: {
    reserves: async (_, { pagination }, context) => {
      const { skip, take, status } = pagination
      // Проверка статуса на пустой массив или ["all"]
      const statusFilter =
        !status || status.length === 0 || status.includes("all")
          ? {}
          : { status: { in: status } }
      // Подсчет общего количества записей без архивных резервов
      const totalCount = await prisma.reserve.count({
        where: {
          ...statusFilter
          // archive: { not: true }, // Исключение архивных записей
        }
      })
      const totalPages = Math.ceil(totalCount / take)
      // Запрос для получения резервов с учетом фильтра
      const reserves = await prisma.reserve.findMany({
        where: {
          ...statusFilter
          // archive: { not: true }, // Исключение архивных записей
        },
        skip: skip * take,
        take: take,
        include: {
          airline: true,
          airport: true,
          person: true,
          passengers: true,
          hotel: true,
          hotelChess: true,
          chat: true
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
      airlineAdminMiddleware(context) // Проверка прав доступа
      const { skip, take, status } = pagination
      // Определяем фильтр статусов
      const statusFilter =
        status && status.includes("all") ? {} : { status: { in: status } }
      // Подсчет общего количества архивных записей с учетом фильтра
      const totalCount = await prisma.reserve.count({
        where: {
          ...statusFilter,
          archive: true
        }
      })
      // Расчет количества страниц
      const totalPages = Math.ceil(totalCount / take)
      // Получение архивных резервов с учетом фильтрации и пагинации
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
          person: true,
          passengers: true,
          hotel: true,
          chat: true
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
          person: true,
          passengers: true,
          hotel: true,
          hotelChess: true,
          chat: true
        }
      })
      if (!reserve) {
        throw new Error("Reserve not found")
      }
      const { user } = context
      if (!user.dispatcher && !user.hotelId) {
        return reserve
      }
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
              description: {
                reserveId: updatedReserve.id,
                description: `Reserve was opened by user ${user.id}`
              },
              oldData: { status: "created" },
              newData: { status: "opened" },
              reserveId: updatedReserve.id
            })
          } catch (error) {
            console.error(
              "Ошибка при логировании первого открытия заявки:",
              error
            )
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
          person: true,
          passengers: true
        }
      })
    },
    reservationHotel: async (_, { id }, context) => {
      return await prisma.reserveHotel.findUnique({
        where: { id: id },
        include: {
          reserve: true,
          hotel: true,
          person: true,
          passengers: true
        }
      })
    },
    reservationPassengers: async (_, { reservationId }, context) => {
      return await prisma.passenger.findMany({
        where: { reserveId: reservationId },
        include: {
          person: true,
          hotel: true
        }
      })
    }
  },
  Mutation: {
    createReserve: async (_, { input }, context) => {
      const {
        airportId,
        arrival,
        departure,
        mealPlan,
        airlineId,
        senderId,
        status,
        passengerCount,
        persons,
        reserveForPerson
      } = input
      // Генерация номера резерва (reserveNumber), как у вас было ранее
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
      // Создание резерва
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
          persons,
          passengerCount,
          reserveForPerson
        }
      })
      // Создание чата, связанного с заявкой
      const newChat = await prisma.chat.create({
        data: {
          reserve: { connect: { id: newReserve.id } }
        }
      })
      // Добавление участника в чат через ChatUser
      await prisma.chatUser.create({
        data: {
          chat: { connect: { id: newChat.id } },
          user: { connect: { id: senderId } }
        }
      })
      // Логирование действия и публикация события
      await logAction({
        context,
        action: "create_reserve",
        description: {
          reserveId: newReserve.id,
          reserveNumber: newReserve.reserveNumber
        },
        reserveId: newReserve.id,
        airlineId: newReserve.airlineId
      })
      pubsub.publish(RESERVE_CREATED, { reserveCreated: newReserve })
      return newReserve
    },
    updateReserve: async (_, { id, input }, context) => {
      console.log(context)
      const { arrival, departure, mealPlan, status, persons } = input

      const updatedReserve = await prisma.reserve.update({
        where: { id },
        data: {
          arrival,
          departure,
          mealPlan,
          status,
          persons
        }
      })

      // await logAction({
      //   userId: context.user.id,
      //   action: "update_reserve",
      //   description: {
      //     reserveId: updatedReserve.id,
      //     reserveNumber: updatedReserve.reserveNumber
      //   },
      //   reserveId: updatedReserve.id,
      //   airlineId: updatedReserve.airlineId
      // })

      pubsub.publish(RESERVE_UPDATED, { reserveUpdated: updatedReserve })
      return updatedReserve
    },
    addHotelToReserve: async (
      _,
      { reservationId, hotelId, capacity },
      context
    ) => {
      try {
        const reserveHotel = await prisma.reserveHotel.create({
          data: {
            reserve: { connect: { id: reservationId } },
            hotel: { connect: { id: hotelId } },
            capacity
          }
        })
        pubsub.publish(RESERVE_HOTEL, { reserveHotel: reserveHotel })
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
      const { name, number, gender, child, animal } = input
      // Проверка на существование заявки
      const reserve = await prisma.reserve.findUnique({
        where: { id: reservationId }
      })
      if (!reserve) {
        throw new Error("Reservation not found")
      }
      if (reserve.reserveForPerson !== false) {
        throw new Error("Reservation created for persons")
      }
      // Проверка на существование связи между заявкой и отелем в ReserveHotel
      let reserveHotel = await prisma.reserveHotel.findFirst({
        where: {
          reserveId: reservationId,
          hotelId: hotelId
        }
      })
      // Если связь не найдена, создаем её
      if (!reserveHotel) {
        reserveHotel = await prisma.reserveHotel.create({
          data: {
            reserve: { connect: { id: reservationId } },
            hotel: { connect: { id: hotelId } },
            capacity: capacity || 1 // Можно изменить на нужное значение вместимости, если оно должно быть по умолчанию
          }
        })
      }
      // Добавление пассажира к заявке с привязкой к отелю через ReserveHotel
      const newPassenger = await prisma.passenger.create({
        data: {
          name,
          number,
          gender,
          child: child || false,
          animal: animal || false,
          reserve: { connect: { id: reservationId } },
          ReserveHotel: { connect: { id: reserveHotel.id } }
        }
      })
      // Обновление информации о заявке
      pubsub.publish(RESERVE_PERSONS, { reservePersons: reserveHotel })
      return newPassenger
    },
    deletePassengerFromReserve: async (_, { id }, context) => {
      const deletedPassenger = await prisma.passenger.delete({
        where: { id }
      })
      const reserveHotel = await prisma.reserveHotel.findUnique({
        where: { id: deletedPassenger.reserveHotelId }
      })
      // Обновление информации о заявке
      pubsub.publish(RESERVE_PERSONS, { reservePersons: reserveHotel })
      return reserveHotel
    },
    assignPersonToHotel: async (_, { input }, context) => {
      const { reservationId, personId, hotelId, capacity } = input
      // Проверка на существование заявки, персонала и отеля
      const [reserve, person, hotel] = await Promise.all([
        prisma.reserve.findUnique({ where: { id: reservationId } }),
        prisma.airlinePersonal.findUnique({ where: { id: personId } }),
        prisma.hotel.findUnique({ where: { id: hotelId } })
      ])
      if (!reserve) {
        throw new Error("Reservation not found")
      }
      if (reserve.reserveForPerson !== true) {
        throw new Error("Reservation created for passengers")
      }
      if (!person) {
        throw new Error("Person not found")
      }
      if (!hotel) {
        throw new Error("Hotel not found")
      }
      // Проверка на существование связи между заявкой и отелем в ReserveHotel
      let reserveHotel = await prisma.reserveHotel.findUnique({
        where: {
          reserveId_hotelId: {
            reserveId: reservationId,
            hotelId: hotelId
          }
        }
      })
      // Если связь не найдена, создаем её
      if (!reserveHotel) {
        reserveHotel = await prisma.reserveHotel.create({
          data: {
            reserve: { connect: { id: reservationId } },
            hotel: { connect: { id: hotelId } },
            capacity: capacity || 1 // Установите нужное значение вместимости
          }
        })
      }
      // Используем промежуточную модель ReserveHotelPersonal для связи
      const reserveHotelPersonal = await prisma.reserveHotelPersonal.create({
        data: {
          reserveHotel: { connect: { id: reserveHotel.id } },
          airlinePersonal: { connect: { id: personId } }
        }
      })
      // Публикация обновлений заявки
      pubsub.publish(RESERVE_PERSONS, { reservePersons: reserveHotel })
      return person
    },
    dissociatePersonFromHotel: async (
      _,
      { reserveHotelId, airlinePersonalId },
      context
    ) => {
      const reserveHotelPersonal = await prisma.reserveHotelPersonal.findUnique(
        {
          where: {
            reserveHotelId_airlinePersonalId: {
              reserveHotelId,
              airlinePersonalId
            }
          }
        }
      )
      if (!reserveHotelPersonal) return null
      const reserveHotel = await prisma.reserveHotel.findUnique({
        where: { id: reserveHotelPersonal.reserveHotelId }
      })
      if (!reserveHotel) return null
      // Удаляем запись после проверки
      await prisma.reserveHotelPersonal.delete({
        where: {
          id: reserveHotelPersonal.id
        }
      })
      // Обновление подписки
      pubsub.publish(RESERVE_PERSONS, { reservePersons: reserveHotel })
      return reserveHotel
    },
    archivingReserve: async (_, input, context) => {
      const reserveId = input.id
      const reserve = await prisma.reserve.findUnique({
        where: { id: reserveId }
      })
      // Проверяем вышел ли срок заявки
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
          description: { reserveId: reserve.id },
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
      // if (!parent.hotelId) return null
      return await prisma.reserveHotel.findMany({
        where: { reserveId: parent.id }
      })
    },
    hotelChess: async (parent) => {
      return await prisma.hotelChess.findMany({
        where: { reserveId: parent.id }
      })
    },
    person: async (parent) => {
      return await prisma.airlinePersonal.findMany({
        where: { id: parent.reservationId }
      })
    },
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
    person: async (parent) => {
      return await prisma.airlinePersonal.findMany({
        where: { ReserveHotel: { some: { reserveHotelId: parent.id } } }
      })
    },
    passengers: async (parent) => {
      return await prisma.passenger.findMany({
        where: { reserveHotelId: parent.id }
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
    person: async (parent) => {
      return await prisma.airlinePersonal.findMany({
        where: {
          ReserveHotel: {
            some: {
              reserveHotelId: parent.reserveHotelId
            }
          }
        }
      })
    },
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

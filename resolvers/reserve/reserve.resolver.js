import { prisma } from "../../prisma.js"
import isEqual from "lodash.isequal"
import logAction from "../../exports/logaction.js"
import {
  pubsub,
  RESERVE_CREATED,
  RESERVE_HOTEL,
  RESERVE_UPDATED
} from "../../exports/pubsub.js"

const reserveResolver = {
  Query: {
    reserves: async (_, { pagination }) => {
      const totalCount = await prisma.reserve.count()
      const { skip, take } = pagination
      const totalPages = Math.ceil(totalCount / take)

      const reserves = await prisma.reserve.findMany({
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
    reserve: async (_, { id }) => {
      return prisma.reserve.findUnique({
        where: { id },
        include: {
          airline: true,
          airport: true,
          person: true,
          passengers: true,
          hotel: true,
          chat: true
        }
      })
    },
    reservationHotels: async (_, { id }) => { 
      return await prisma.reserveHotel.findMany({
        where: { reserveId: id },
        include: {
          reserve: true,
          hotel: true,
          person: true, // Include person info if needed
          passengers: true
        }
      })
     },
    reservationHotel: async (_, { id }) => { 
      return await prisma.reserveHotel.findUnique({
        where: { id: id },
        include: {
          reserve: true,
          hotel: true,
          person: true, // Include person info if needed
          passengers: true
        }
      })
     },
    reservationPassengers: async (_, { reservationId }) => {
      // Fetch passengers associated with the reservation
      return await prisma.passenger.findMany({
        where: { reserveId: reservationId },
        include: {
          person: true,
          hotel: true // Include hotel info if needed
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
        persons
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
          passengerCount
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
      const { arrival, departure, mealPlan, status, persons } = input

      // Обновление заявки без изменения списка пассажиров
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

      // Логирование действия и публикация события
      await logAction({
        userId: context.user.id,
        action: "update_reserve",
        description: {
          reserveId: updatedReserve.id,
          reserveNumber: updatedReserve.reserveNumber
        },
        reserveId: updatedReserve.id,
        airlineId: updatedReserve.airlineId
      })

      pubsub.publish(RESERVE_UPDATED, { reserveUpdated: updatedReserve })

      return updatedReserve
    },

    addHotelToReserve: async (_, { reservationId, hotelId, capacity }) => {
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

    addPassengerToReserve: async (_, { reservationId, input, hotelId }) => {
      const { name, number, gender, child, animal } = input

      // Проверка на существование заявки
      const reserve = await prisma.reserve.findUnique({
        where: { id: reservationId }
      })

      if (!reserve) {
        throw new Error("Reservation not found")
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
            capacity: 0 // Можно изменить на нужное значение вместимости, если оно должно быть по умолчанию
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
      pubsub.publish(RESERVE_UPDATED, { reserveUpdated: reserve })

      return newPassenger
    },

    assignPersonToHotel: async (_, { input }) => {
      const { reservationId, personId, hotelId } = input

      // Проверка на существование заявки, персонала и отеля
      const [reserve, person, hotel] = await Promise.all([
        prisma.reserve.findUnique({ where: { id: reservationId } }),
        prisma.airlinePersonal.findUnique({ where: { id: personId } }),
        prisma.hotel.findUnique({ where: { id: hotelId } })
      ])

      if (!reserve) {
        throw new Error("Reservation not found")
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
            capacity: 0 // Можно изменить на нужное значение вместимости, если оно должно быть по умолчанию
          }
        })
      }

      // Обновление информации о связи между персоналом и ReserveHotel
      const updatedReserveHotel = await prisma.reserveHotel.update({
        where: {
          id: reserveHotel.id
        },
        data: {
          person: {
            connect: { id: personId }
          }
        }
      })

      // Обновляем персонала с привязкой к заявке и отелю через ReserveHotel
      const updatedPerson = await prisma.airlinePersonal.update({
        where: { id: personId },
        data: {
          Reserve: { connect: { id: reservationId } },
          ReserveHotel: { connect: { id: reserveHotel.id } }
        }
      })

      // Публикация обновлений заявки
      pubsub.publish(RESERVE_UPDATED, { reserveUpdated: reserve })

      return updatedPerson
    }
  },
  Subscription: {
    reserveCreated: {
      subscribe: () => pubsub.asyncIterator([RESERVE_CREATED])
    },
    reserveUpdated: {
      subscribe: () => pubsub.asyncIterator([RESERVE_UPDATED])
    }
  },
  // ... остальные резольверы ...
  Reserve: {
    hotel: async (parent) => {
      if (!parent.hotelId) return null
      return await prisma.reserveHotel.findUnique({
        where: { reserveId: parent.id }
      })
    },
    person: async (parent) => {
      return await prisma.airlinePersonal.findMany({
        where: { id: parent.airlineId }
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
      console.log(parent)
      return await prisma.airlinePersonal.findMany({
        where: { reserveHotelId: parent.id }
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
  }
}

export default reserveResolver

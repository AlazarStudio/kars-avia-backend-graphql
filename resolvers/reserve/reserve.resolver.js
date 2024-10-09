import { prisma } from "../../prisma.js"
import { logAction } from "../../exports/logaction.js"
import {
  pubsub,
  RESERVE_CREATED,
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
          families: true,
          hotels: true,
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
          families: true,
          hotels: true,
          chat: true
        }
      })
    },
    reservationPassengers: async (_, { reservationId }) => {
      // Fetch passengers associated with the reservation
      return await prisma.passenger.findMany({
        where: { reserveId: reservationId },
        include: {
          family: {
            include: {
              passengers: true // Include other family members
            }
          },
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
        families,
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
          persons
        }
      })

      // Создание семей и пассажиров
      for (const familyInput of families) {
        // Создаем семью, связанную с резервом
        const newFamily = await prisma.family.create({
          data: {
            reserve: { connect: { id: newReserve.id } }
          }
        })

        // Создаем пассажиров, связанных с семьей и резервом
        const passengerPromises = familyInput.passengers.map((passengerData) =>
          prisma.passenger.create({
            data: {
              name: passengerData.name,
              number: passengerData.number,
              child: passengerData.child || false,
              animal: passengerData.animal || false,
              family: { connect: { id: newFamily.id } },
              reserve: { connect: { id: newReserve.id } }
            }
          })
        )

        await Promise.all(passengerPromises)
      }

      // Логирование действия и публикация события
      await logAction({
        userId: context.user.id,
        action: "create_reserve",
        description: {
          reserveId: newReserve.id,
          reserveNumber: newReserve.reserveNumber
        },
        airlineId: newReserve.airlineId
      })

      pubsub.publish(RESERVE_CREATED, { reserveCreated: newReserve })

      return newReserve
    },
    updateReserve: async (_, { id, input }, context) => {

      const {
        arrival,
        departure,
        mealPlan,
        status,
        families,
        persons
      } = input
      const updatedReserve = await prisma.reserve.update({
        where: { id },
        data: {
          arrival,
          departure,
          mealPlan,
          status,
          families,
          persons
        }
      })
      // логирование действия и публикация события
      await logAction({
        userId: context.user.id,
        action: "update_reserve",
        description: {
          reserveId: updatedReserve.id,
          reserveNumber: updatedReserve.reserveNumber
        },
        airlineId: updatedReserve.airlineId
      })
      pubsub.publish(RESERVE_UPDATED, { reserveUpdated: updatedReserve })
      return updatedReserve
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
    families: async (parent) => {
      return await prisma.family.findMany({
        where: { reserveId: parent.id },
        include: { passengers: true }
      })
    }
  },

  Family: {
    reserve: async (parent) => {
      return await prisma.reserve.findUnique({
        where: { id: parent.reserveId }
      })
    },
    passengers: async (parent) => {
      return await prisma.passenger.findMany({
        where: { familyId: parent.id }
      })
    }
  },

  Passenger: {
    reserve: async (parent) => {
      return await prisma.reserve.findUnique({
        where: { id: parent.reserveId }
      })
    },
    family: async (parent) => {
      if (!parent.familyId) return null
      return await prisma.family.findUnique({
        where: { id: parent.familyId }
      })
    }
  }
}

export default reserveResolver

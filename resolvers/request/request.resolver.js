import { prisma } from "../../prisma.js"
import { PubSub } from "graphql-subscriptions"

const pubsub = new PubSub()
const REQUEST_CREATED = "REQUEST_CREATED"
const REQUEST_UPDATED = "REQUEST_UPDATED"

const requestResolver = {
  Query: {
    requests: async () => {
      return prisma.request.findMany({
        include: {
          airline: true,
          airport: true
        }
      })
    },
    request: async (_, { requestId }) => {
      return prisma.request.findUnique({
        where: { id: requestId },
        include: {
          airline: true,
          airport: true
        }
      })
    }
  },
  Mutation: {
    createRequest: async (_, { input }, context) => {
      const {
        fullName,
        position,
        gender,
        phoneNumber,
        airportId,
        arrival,
        departure,
        roomCategory,
        mealPlan,
        airlineId,
        senderId,
        status
      } = input

      // Создание заявки
      const newRequest = await prisma.request.create({
        data: {
          fullName,
          position,
          gender,
          phoneNumber,
          airport: airportId ? {
            connect: { id: airportId }
          } : null,
          arrival,
          departure,
          roomCategory,
          mealPlan,
          airline: {
            connect: { id: airlineId } // Использование `connect` для существующей авиакомпании
          },
          sender: {
            connect: { id: senderId } // Привязка к пользователю, отправившему заявку
          },
          status
        }
      })

      // Публикация события после создания заявки
      pubsub.publish(REQUEST_CREATED, { requestCreated: newRequest })

      return newRequest
    },
    updateRequest: async (_, { id, input }, context) => {
      const {
        fullName,
        position,
        gender,
        phoneNumber,
        airport,
        arrival,
        departure,
        roomCategory,
        mealPlan,
        hotelId,
        roomNumber,
        status
      } = input

      // Обновление заявки
      const updatedRequest = await prisma.request.update({
        where: { id },
        data: {
          fullName,
          position,
          gender,
          phoneNumber,
          airport,
          arrival,
          departure,
          roomCategory,
          mealPlan,
          roomNumber,
          hotel: hotelId ? { connect: { id: hotelId } } : undefined,
          status
        }
      })

      // Публикация события после создания заявки
      pubsub.publish(REQUEST_UPDATED, { requestUpdated: updatedRequest })

      return updatedRequest
    }
  },
  Subscription: {
    requestCreated: {
      subscribe: () => pubsub.asyncIterator([REQUEST_CREATED])
    },
    requestUpdated: {
      subscribe: () => pubsub.asyncIterator([REQUEST_UPDATED])
    }
  },

  Request: {
    airport: async (parent) => {
      console.log('Request', parent);
      return await prisma.airport.findUnique({
        where: { id: parent.airportId }
      })
    },
    airline: async (parent) => {
      return await prisma.airline.findUnique({
        where: { id: parent.airlineId }
      })
    },
  }
}

export default requestResolver

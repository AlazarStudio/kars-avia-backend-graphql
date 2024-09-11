import { prisma } from "../../prisma.js"
import { PubSub } from "graphql-subscriptions"

const pubsub = new PubSub()
const REQUEST_CREATED = "REQUEST_CREATED"
const REQUEST_UPDATED = "REQUEST_UPDATED"

const requestResolver = {
  Query: {
    requests: async () => {
      return prisma.request.findMany()
    },
    request: async (_, { requestId }) => {
      return prisma.request.findUnique({
        where: { id: requestId }
      })
    }
  },
  Mutation: {
    createRequest: async (_, { input }) => {
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
        airlineId,
        senderId
      } = input

      // Создание заявки
      const newRequest = await prisma.request.create({
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
          airline: {
            connect: { id: airlineId } // Использование `connect` для существующей авиакомпании
          },
          sender: {
            connect: { id: senderId } // Привязка к пользователю, отправившему заявку
          }
        }
      })

      // Публикация события после создания заявки
      pubsub.publish(REQUEST_CREATED, { requestCreated: newRequest })

      return newRequest
    },
    updateRequest: async (_, { id, input }) => {
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
        roomNumber
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
          hotel: hotelId ? { connect: { id: hotelId } } : undefined // Установление связи с отелем, если передан hotelId
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
  }
}

export default requestResolver

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
          airline: {
            select: {
              name: true,
              images: true
            }
          },
          airport: {
            select: {
              name: true,
              code: true,
              city: true
            }
          }
        }
      })
    },
    request: async (_, { requestId }) => {
      return prisma.request.findUnique({
        where: { id: requestId },
        include: {
          airline: {
            select: {
              name: true,
              images: true
            }
          },
          airport: {
            select: {
              name: true,
              code: true,
              city: true
            }
          }
        }
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
          airport: {
            connect: { id: airportId }
          },
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
    updateRequest: async (_, { id, input }) => {
      const {
        fullName,
        position,
        gender,
        phoneNumber,
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
  }
}

export default requestResolver

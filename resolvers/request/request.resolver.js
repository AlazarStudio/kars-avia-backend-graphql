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
    request: async (_, { id }) => {
      return prisma.request.findUnique({
        where: { id: id },
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
        personId,
        airportId,
        arrival,
        departure,
        roomCategory,
        mealPlan,
        airlineId,
        senderId,
        status
      } = input

      // Получаем количество существующих заявок для порядкового номера
      const requestCount = await prisma.request.count()

      // Получаем код аэропорта
      const airport = await prisma.airport.findUnique({
        where: { id: airportId }
      })

      if (!airport) {
        throw new Error("Airport not found")
      }

      // Форматируем текущую дату
      const currentDate = new Date()
      const formattedDate = currentDate
        .toLocaleDateString("ru-RU")
        .replace(/\./g, ".")

      const requestNumber = `${String(requestCount + 1).padStart(4, "0")}-${airport.code}-${formattedDate}`

      // Создание заявки
      const newRequest = await prisma.request.create({
        data: {
          person: {
            connect: { id: personId }
          },
          airport: airportId
            ? {
                connect: { id: airportId }
              }
            : null,
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
          status,
          requestNumber
        }
      })

      // Публикация события после создания заявки
      pubsub.publish(REQUEST_CREATED, { requestCreated: newRequest })

      return newRequest
    },
    updateRequest: async (_, { id, input }, context) => {
      const {
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
      return await prisma.airport.findUnique({
        where: { id: parent.airportId }
      })
    },
    airline: async (parent) => {
      return await prisma.airline.findUnique({
        where: { id: parent.airlineId }
      })
    },
    person: async (parent) => {
      return await prisma.airlinePersonal.findUnique({
        where: { id: parent.personId }
      })
    }
  }
}

export default requestResolver

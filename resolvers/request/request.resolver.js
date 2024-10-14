import { prisma } from "../../prisma.js"
// import { PubSub } from "graphql-subscriptions"
import { logAction } from "../../exports/logaction.js"

import {
  pubsub,
  REQUEST_CREATED,
  REQUEST_UPDATED
} from "../../exports/pubsub.js"

// const pubsub = new PubSub()

const requestResolver = {
  Query: {
    requests: async (_, input) => {
      const totalCount = await prisma.request.count()
      const { skip, take } = input.pagination
      const totalPages = Math.ceil(totalCount / take)
      const requests = await prisma.request.findMany({
        skip: skip * take,
        take: take,
        include: {
          airline: true,
          airport: true,
          hotel: true,
          hotelChess: true
        },
        orderBy: { createdAt: "desc" }
      })
      return {
        totalCount,
        requests,
        totalPages
      }
    },
    request: async (_, { id }) => {
      return prisma.request.findUnique({
        where: { id: id },
        include: {
          airline: true,
          airport: true,
          hotel: true,
          hotelChess: true
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

      const requestNumber = `${String(requestCount + 1).padStart(4, "0")}-${
        airport.code
      }-${formattedDate}`

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

      // Создание чата, связанного с заявкой
      const newChat = await prisma.chat.create({
        data: {
          request: { connect: { id: newRequest.id } }
        }
      })

      // Добавление участника в чат через ChatUser
      await prisma.chatUser.create({
        data: {
          chat: { connect: { id: newChat.id } },
          user: { connect: { id: senderId } }
        }
      })

      // Публикация события после создания заявки
      pubsub.publish(REQUEST_CREATED, { requestCreated: newRequest })

      // Логирование действия
      try {
        await logAction({
          userId: context.user.id,
          action: "create_request",
          reason: null, // Причина изменения не требуется, так как это создание
          description: {
            requestId: newRequest.id,
            requestNumber: newRequest.requestNumber,
            personId: personId,
            arrival: arrival,
            departure: departure,
            roomCategory: roomCategory,
            mealPlan: mealPlan,
            status: status
          },
          hotelId: null, // Пустое, если нет отеля
          airlineId: airlineId, // ID авиакомпании
          requestId: newRequest.id,
          reserveId: null, // Пустое, если нет резерва
          oldData: null, // Старая информация отсутствует при создании
          newData: {
            requestNumber: newRequest.requestNumber,
            airportId: airportId,
            personId: personId,
            status: status
          } // Новые данные по заявке
        })
      } catch (error) {
        console.error("Ошибка при логировании действия создания заявки:", error)
      }
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
        hotelChessId,
        roomNumber,
        status
      } = input;
    
      // Получаем старую версию заявки для логирования
      const oldRequest = await prisma.request.findUnique({
        where: { id },
      });
    
      if (!oldRequest) {
        throw new Error("Request not found");
      }
    
      // Подготавливаем данные для обновления
      const dataToUpdate = {
        airport,
        arrival,
        departure,
        roomCategory,
        mealPlan,
        roomNumber,
        status
      };
    
      if (hotelId) {
        dataToUpdate.hotel = { connect: { id: hotelId } };
      }

      if (hotelChessId) {
        dataToUpdate.hotelChess = { connect: { id: hotelChessId } };
      }
    
      // Обновление заявки
      const updatedRequest = await prisma.request.update({
        where: { id },
        data: dataToUpdate,
      });
    
      // Публикация события после обновления заявки
      pubsub.publish(REQUEST_UPDATED, { requestUpdated: updatedRequest });
    
      // Логирование действия
      try {
        await logAction({
          userId: context.user.id,
          action: "update_request",
          reason: null, // Причина не указана в данном случае, но можно передавать, если потребуется
          description: {
            requestId: updatedRequest.id,
            requestNumber: updatedRequest.requestNumber,
          },
          hotelId: updatedRequest.hotelId || null,
          airlineId: updatedRequest.airlineId || null,
          requestId: updatedRequest.id,
          reserveId: null, // Резерв не обновляется в данном случае
          oldData: {
            airport: oldRequest.airport,
            arrival: oldRequest.arrival,
            departure: oldRequest.departure,
            roomCategory: oldRequest.roomCategory,
            mealPlan: oldRequest.mealPlan,
            hotelId: oldRequest.hotelId,
            hotelChessId: oldRequest.hotelChessId,
            roomNumber: oldRequest.roomNumber,
            status: oldRequest.status,
          }, // Старая информация
          newData: {
            airport: updatedRequest.airport,
            arrival: updatedRequest.arrival,
            departure: updatedRequest.departure,
            roomCategory: updatedRequest.roomCategory,
            mealPlan: updatedRequest.mealPlan,
            hotelId: updatedRequest.hotelId,
            hotelChessId: updatedRequest.hotelChessId,
            roomNumber: updatedRequest.roomNumber,
            status: updatedRequest.status,
          }, // Новая информация
        });
      } catch (error) {
        console.error("Ошибка при логировании действия обновления заявки:", error);
      }
    
      return updatedRequest;
    },    
    deleteRequests: async (_, {}, context) => {
      const deletedRequests = await prisma.request.deleteMany()
      return deletedRequests.count
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
    hotel: async (parent) => {
      if (!parent.hotelId) return null
      return await prisma.hotel.findUnique({
        where: { id: parent.hotelId }
      })
    },
    hotelChess: async (parent) => {
      if (!parent.hotelChess) return null
      return await prisma.hotelChess.findUnique({
        where: { requestId: parent.id }
      })
    },
    person: async (parent) => {
      return await prisma.airlinePersonal.findUnique({
        where: { id: parent.personId }
      })
    },
    chat: async (parent) => {
      return await prisma.chat.findUnique({
        where: { id: parent.requestId }
      })
    }
  }
}

export default requestResolver

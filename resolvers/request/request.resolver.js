import { prisma } from "../../prisma.js"
import isEqual from "lodash.isequal"
import logAction from "../../exports/logaction.js"
import {
  pubsub,
  REQUEST_CREATED,
  REQUEST_UPDATED
} from "../../exports/pubsub.js"
import calculateMeal from "../../exports/calculateMeal.js"

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
          hotelChess: true,
          logs: true
        },
        orderBy: { createdAt: "desc" }
      })
      return {
        totalCount,
        requests,
        totalPages
      }
    },
    request: async (_, { id }, context) => {
      const request = await prisma.request.findUnique({
        where: { id: id },
        include: {
          airline: true,
          airport: true,
          hotel: true,
          hotelChess: true,
          logs: true
        }
      })

      if (!request) {
        throw new Error("Request not found")
      }
      // Проверка, что статус заявки "created" (т.е. заявка открывается впервые)
      if (request.status === "created") {
        // Обновляем статус на "opened"
        const updatedRequest = await prisma.request.update({
          where: { id },
          data: { status: "opened" }
        })
        // Логируем только первое открытие заявки
        try {
          await logAction({
            context,
            action: "open_request",
            description: {
              requestId: updatedRequest.id,
              description: `Request was opened by user ${context.user.id}`
            },
            oldData: { status: "created" }, // старый статус
            newData: { status: "opened" } // новый статус
          })
        } catch (error) {
          console.error(
            "Ошибка при логировании первого открытия заявки:",
            error
          )
        }
        return updatedRequest
      }
      // Если статус уже изменён, не логируем и возвращаем текущую заявку
      return request
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
          person: { connect: { id: personId } },
          airport: airportId ? { connect: { id: airportId } } : null,
          arrival,
          departure,
          roomCategory,
          mealPlan,
          airline: { connect: { id: airlineId } },
          sender: { connect: { id: senderId } },
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

      // Логирование действия создания
      try {
        await logAction({
          context,
          action: "create_request",
          description: {
            requestId: newRequest.id,
            requestNumber: newRequest.requestNumber,
            personId,
            airportId,
            arrival,
            departure,
            roomCategory,
            mealPlan,
            status
          },
          newData: {
            requestNumber: newRequest.requestNumber,
            airportId,
            personId,
            status
          },
          airlineId,
          requestId: newRequest.id
        })
      } catch (error) {
        console.error("Ошибка при логировании действия создания заявки:", error)
      }

      pubsub.publish(REQUEST_CREATED, { requestCreated: newRequest })
      return newRequest
    },

    updateRequest: async (_, { id, input }, context) => {
      const {
        airportId,
        arrival,
        departure,
        roomCategory,
        mealPlan,
        hotelId,
        hotelChessId,
        roomNumber,
        status
      } = input

      // Получаем старую версию заявки для логирования
      const oldRequest = await prisma.request.findUnique({
        where: { id }
      })

      if (!oldRequest) {
        throw new Error("Request not found")
      }

      if (hotelId) {
        dataToUpdate.hotel = { connect: { id: hotelId } }
      }
      let hotelMealTimes = {}
      let hotel
      if (hotelId) {
        hotel = await prisma.hotel.findUnique({
          where: { id: hotelId },
          select: {
            breakfast: true,
            lunch: true,
            dinner: true
          }
        })
      }

      if (hotel) {
        hotelMealTimes = {
          breakfast: {
            start: {
              hours: parseInt(hotel.breakfast.split(":")[0]),
              minutes: parseInt(hotel.breakfast.split(":")[1])
            },
            end: {
              hours: parseInt(hotel.breakfast.split(":")[0]) + 2, // Условие, например, 2 часа на завтрак
              minutes: 0
            }
          },
          lunch: {
            start: {
              hours: parseInt(hotel.lunch.split(":")[0]),
              minutes: parseInt(hotel.lunch.split(":")[1])
            },
            end: {
              hours: parseInt(hotel.lunch.split(":")[0]) + 4, // Условие, например, 4 часа на обед
              minutes: 0
            }
          },
          dinner: {
            start: {
              hours: parseInt(hotel.dinner.split(":")[0]),
              minutes: parseInt(hotel.dinner.split(":")[1])
            },
            end: {
              hours: parseInt(hotel.dinner.split(":")[0]) + 2, // Условие, например, 2 часа на ужин
              minutes: 0
            }
          }
        }
      }

      // Вычисляем количество приемов пищи
      const mealCounts = calculateMeal(
        reverseDateTimeFormatter(arrival.date, arrival.time),
        reverseDateTimeFormatter(departure.date, departure.time),
        hotelMealTimes
      )

      // Обновляем mealPlan с учетом новых данных
      dataToUpdate.mealPlan = {
        included: true, // Пример: можно установить как true или false
        breakfast: mealCounts.totalBreakfast,
        lunch: mealCounts.totalLunch,
        dinner: mealCounts.totalDinner,
        dailyMeals: mealCounts.dailyMeals
      }

      // Подготавливаем данные для обновления
      const dataToUpdate = {
        airport: airportId ? { connect: { id: airportId } } : undefined,
        arrival,
        departure,
        roomCategory,
        mealPlan,
        roomNumber,
        status
      }

      if (hotelChessId) {
        dataToUpdate.hotelChess = { connect: { id: hotelChessId } }
      }

      // Обновление заявки
      const updatedRequest = await prisma.request.update({
        where: { id },
        data: dataToUpdate
      })

      // Сравниваем старые и новые данные
      const oldData = {
        airportId: oldRequest.airportId,
        arrival: oldRequest.arrival,
        departure: oldRequest.departure,
        roomCategory: oldRequest.roomCategory,
        mealPlan: oldRequest.mealPlan,
        roomNumber: oldRequest.roomNumber,
        status: oldRequest.status
      }
      const newData = {
        airportId,
        arrival,
        departure,
        roomCategory,
        mealPlan,
        roomNumber,
        status
      }

      try {
        if (!isEqual(oldData, newData)) {
          await logAction({
            context,
            action: "update_request",
            description: {
              requestId: updatedRequest.id,
              changes: { old: oldData, new: newData }
            },
            oldData: oldData,
            newData: newData,
            hotelId: hotelId,
            requestId: updatedRequest.id
          })
        }
      } catch (error) {
        console.error(
          "Ошибка при логировании действия обновления заявки:",
          error
        )
      }
      pubsub.publish(REQUEST_UPDATED, { requestUpdated: updatedRequest })
      return updatedRequest
    },
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
        where: { requestId: parent.requestId }
      })
    },
    logs: async (parent) => {
      return await prisma.log.findMany({
        where: { requestId: parent.id },
        include: { user: true }
      })
    }
  }
}

export default requestResolver

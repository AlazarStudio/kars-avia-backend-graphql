import { prisma } from "../../prisma.js"
import isEqual from "lodash.isequal"
import logAction from "../../exports/logaction.js"
import {
  pubsub,
  REQUEST_CREATED,
  REQUEST_UPDATED
} from "../../exports/pubsub.js"

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
    request: async (_, { id }, context) => {
      const request = await prisma.request.findUnique({
        where: { id: id },
        include: {
          airline: true,
          airport: true,
          hotel: true,
          hotelChess: true,
          logs: {
            // Добавляем логи
            include: {
              user: true
            }
          }
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
          await logAction(
            context,
            "open_request",
            {
              requestId: updatedRequest.id,
              description: `Request was opened by user ${context.user.id}`
            },
            { status: "created" }, // старый статус
            { status: "opened" } // новый статус
          )
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
      // Логирование действия создания
      try {
        await logAction(
          context,
          "create_request",
          {
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
          null,
          {
            requestNumber: newRequest.requestNumber,
            airportId,
            personId,
            status
          }
        )
      } catch (error) {
        console.error("Ошибка при логировании действия создания заявки:", error)
      }
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
      if (hotelId) {
        dataToUpdate.hotel = { connect: { id: hotelId } }
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
          await logAction(
            context,
            "update_request",
            {
              requestId: updatedRequest.id,
              changes: { old: oldData, new: newData }
            },
            oldData,
            newData,
            hotelId
          )
        }
      } catch (error) {
        console.error(
          "Ошибка при логировании действия обновления заявки:",
          error
        )
      }
      return updatedRequest
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

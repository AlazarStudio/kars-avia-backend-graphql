import { prisma } from "../../prisma.js"
import isEqual from "lodash.isequal"
import logAction from "../../exports/logaction.js"
import {
  pubsub,
  REQUEST_CREATED,
  REQUEST_UPDATED
} from "../../exports/pubsub.js"
import calculateMeal from "../../exports/calculateMeal.js"
import updateHotelChess from "../../exports/updateHotelChess.js"
import { reverseDateTimeFormatter } from "../../exports/dateTimeFormater.js"
import { airlineAdminMiddleware } from "../../middlewares/authMiddleware.js"
import updateDailyMeals from "../../exports/updateDailyMeals.js"

const requestResolver = {
  Query: {
    requests: async (_, { pagination }, context) => {
      const { skip, take, status } = pagination
      // Определяем фильтр статусов, если статус не передан (пустой массив), показываем все неархивные
      const statusFilter =
        status && status.length > 0 && !status.includes("all")
          ? { status: { in: status } }
          : {}
      // Подсчитываем записи с учетом фильтрации по статусу и архиву
      const totalCount = await prisma.request.count({
        where: {
          ...statusFilter,
          archive: { not: true }
        }
      })
      const totalPages = Math.ceil(totalCount / take)
      // Получаем записи
      const requests = await prisma.request.findMany({
        where: {
          ...statusFilter,
          archive: { not: true }
        },
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
    requestArchive: async (_, { pagination }, context) => {
      airlineAdminMiddleware(context)
      const { skip, take, status } = pagination
      // Определяем фильтр статусов
      const statusFilter =
        status && status.includes("all") ? {} : { status: { in: status } }
      const totalCount = await prisma.request.count({
        where: {
          ...statusFilter,
          archive: true
        }
      })
      const totalPages = Math.ceil(totalCount / take)
      const requests = await prisma.request.findMany({
        where: {
          ...statusFilter,
          archive: true
        },
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
      const { user } = context
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
      if (request.archive === true) {
        airlineAdminMiddleware(context)
      }
      if (!user || !user.dispatcher) {
        return request
      }
      // Проверка, что статус заявки "created" (т.е. заявка открывается впервые)
      if (request.status === "created") {
        // Обновляем статус на "opened"
        const updatedRequest = await prisma.request.update({
          where: { id },
          data: { status: "opened", receiverId: user.id }
        })
        // Проверка, существует ли уже лог о первом открытии заявки
        const existingLog = await prisma.log.findFirst({
          where: {
            action: "open_request",
            requestId: updatedRequest.id
          }
        })
        if (!existingLog) {
          // Логируем только если ещё не было записи об открытии
          try {
            await logAction({
              context,
              action: "open_request",
              description: {
                requestId: updatedRequest.id,
                requestNumber: updatedRequest.requestNumber
              },
              oldData: { status: "created" },
              newData: { status: "opened" },
              requestId: updatedRequest.id
            })
          } catch (error) {
            console.error(
              "Ошибка при логировании первого открытия заявки:",
              error
            )
          }
        }
        pubsub.publish(REQUEST_UPDATED, { requestUpdated: updatedRequest })
        return updatedRequest
      }
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
      console.log(context)
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
    modifyDailyMeals: async (_, { input }, context) => {
      const { requestId, dailyMeals } = input
      // Проверяем существование заявки
      const request = await prisma.request.findUnique({
        where: { id: requestId },
        select: { id: true }
      })
      if (!request) {
        throw new Error("Request not found")
      }
      // Вызываем функцию обновления питания
      const updatedMealPlan = await updateDailyMeals(requestId, dailyMeals)
      pubsub.publish(REQUEST_UPDATED, { requestUpdated: updatedMealPlan })
      return updatedMealPlan
    },
    extendRequestDates: async (_, { input }, context) => {
      const { requestId, newEnd, newEndName } = input
      const request = await prisma.request.findUnique({
        where: { id: requestId },
        include: { hotelChess: true, hotel: true }
      })
      if (!request) {
        throw new Error("Request not found")
      }
      if (!request.hotelChess) {
        throw new Error("Request has not been placed in a hotel")
      }
      const updatedHotelChess = await prisma.hotelChess.update({
        where: { id: request.hotelChess.id },
        data: {
          end: newEnd,
          // endTime: newEndTime
        }
      })
      const existingMealPlan = request.mealPlan || {
        included: true,
        breakfast: 0,
        lunch: 0,
        dinner: 0,
        dailyMeals: []
      }
      // const arrivalDateTime = updatedHotelChess.start
      const arrivalDateTime = request.arrival.date
      const departureDateTime = newEnd
      const hotel = request.hotel
      const mealTimes = {
        breakfast: hotel.breakfast,
        lunch: hotel.lunch,
        dinner: hotel.dinner
      }
      const newMealPlan = calculateMeal(
        arrivalDateTime,
        departureDateTime,
        mealTimes
      )
      // const newEndDate = new Date(newEnd)
      const newEndDate = newEnd
      // Фильтруем существующие dailyMeals, чтобы оставить только даты до нового конца
      const adjustedDailyMeals = (existingMealPlan.dailyMeals || []).filter(
        (day) => new Date(day.date) <= newEndDate
      );
      
      newMealPlan.dailyMeals.forEach((newDay) => {
        if (
          !adjustedDailyMeals.some(
            (existingDay) => existingDay.date === newDay.date
          )
        ) {
          adjustedDailyMeals.push(newDay)
        }
      })
      const updatedMealPlan = await updateDailyMeals(
        requestId,
        adjustedDailyMeals,
        newEndDate
      )
      const updatedRequest = await prisma.request.update({
        where: { id: requestId },
        data: {
          departure: {
            date: newEnd,
            // time: newEndTime,
            flight: newEndName
          },
          mealPlan: updatedMealPlan
        },
        include: {
          arrival: true,
          departure: true,
          hotelChess: true
        }
      })
      pubsub.publish(REQUEST_UPDATED, { requestUpdated: updatedRequest })
      return updatedRequest
    },
    // функция архивирования заявки
    archivingRequst: async (_, input, context) => {
      const requestId = input.id
      const request = await prisma.request.findUnique({
        where: { id: requestId }
      })
      // Проверяем вышел ли срок заявки
      if (
        new Date(request.departure.date) < new Date(Date.now()) &&
        request.status !== "archived"
      ) {
        const archiveRequest = await prisma.request.update({
          where: { id: requestId },
          data: { status: "archived", archive: true }
        })
        await logAction({
          context,
          action: "archive_request",
          description: { requestId: request.id },
          oldData: request,
          newData: { status: "archived" },
          hotelId: request.hotelId,
          requestId: request.id
        })
        pubsub.publish(REQUEST_UPDATED, { requestUpdated: archiveRequest })
        return archiveRequest
      } else {
        throw new Error("Request is not expired or already archived")
      }
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

import { prisma } from "../../prisma.js"
import GraphQLUpload from "graphql-upload/GraphQLUpload.mjs"
import isEqual from "lodash.isequal"
import logAction from "../../exports/logaction.js"
import {
  pubsub,
  REQUEST_CREATED,
  REQUEST_UPDATED,
  NOTIFICATION,
  MESSAGE_SENT
} from "../../exports/pubsub.js"
import calculateMeal from "../../exports/calculateMeal.js"
import updateHotelChess from "../../exports/updateHotelChess.js"
import {
  formatDate,
  reverseDateTimeFormatter
} from "../../exports/dateTimeFormater.js"
import {
  adminHotelAirMiddleware,
  airlineAdminMiddleware,
  airlineModerMiddleware
} from "../../middlewares/authMiddleware.js"
import updateDailyMeals from "../../exports/updateDailyMeals.js"
import { uploadFiles, deleteFiles } from "../../exports/uploadFiles.js"

const requestResolver = {
  Upload: GraphQLUpload,
  Query: {
    requests: async (_, { pagination }, context) => {
      const { user } = context
      const { skip, take, status } = pagination
      const statusFilter =
        status && status.length > 0 && !status.includes("all")
          ? { status: { in: status } }
          : {}
      // Если у пользователя задан airlineId – фильтруем по нему
      const airlineFilter = user.airlineId ? { airlineId: user.airlineId } : {}

      const totalCount = await prisma.request.count({
        where: {
          ...statusFilter,
          ...airlineFilter,
          archive: { not: true }
        }
      })
      const totalPages = Math.ceil(totalCount / take)
      const requests = await prisma.request.findMany({
        where: {
          ...statusFilter,
          ...airlineFilter,
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
      const { user } = context
      airlineAdminMiddleware(context)
      const { skip, take, status } = pagination
      const statusFilter =
        status && status.includes("all") ? {} : { status: { in: status } }
      const airlineFilter = user.airlineId ? { airlineId: user.airlineId } : {}
      const totalCount = await prisma.request.count({
        where: {
          ...statusFilter,
          ...airlineFilter,
          archive: true
        }
      })
      const totalPages = Math.ceil(totalCount / take)
      const requests = await prisma.request.findMany({
        where: {
          ...statusFilter,
          ...airlineFilter,
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
        where: { id },
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
      // Если пользователь является диспетчером, при первом открытии заявки (status === "created") обновляем статус
      if (!user || !user.dispatcher) {
        return request
      }
      if (request.status === "created") {
        const updatedRequest = await prisma.request.update({
          where: { id },
          data: { status: "opened", receiverId: user.id }
        })
        const existingLog = await prisma.log.findFirst({
          where: {
            action: "open_request",
            requestId: updatedRequest.id
          }
        })
        if (!existingLog) {
          try {
            await logAction({
              context,
              action: "open_request",
              description: `Заявка № <span style='color:#545873'>${updatedRequest.requestNumber}</span> открыта пользователем <span style='color:#545873'>${user.name}</span>`,
              oldData: { status: "created" },
              newData: { status: "opened" },
              requestId: updatedRequest.id
            })
          } catch (error) {
            console.error("Ошибка при логировании открытия заявки:", error)
          }
        }
        pubsub.publish(REQUEST_UPDATED, { requestUpdated: updatedRequest })
        return updatedRequest
      }
      return request
    }
  },

  Mutation: {
    createRequest: async (_, { input, files }, context) => {
      const { user } = context
      airlineModerMiddleware(context)
      const {
        personId,
        airportId,
        arrival,
        departure,
        roomCategory,
        mealPlan,
        airlineId,
        senderId,
        status,
        reserve
      } = input

      // Приведение дат к формату YYYY-MM-DD
      const arrivalDate = arrival.split("T")[0]
      const departureDate = departure.split("T")[0]

      // Проверяем наличие заявки с такими же параметрами
      const existingRequest = await prisma.request.findFirst({
        where: {
          personId,
          airlineId,
          airportId,
          arrival: {
            gte: new Date(`${arrivalDate}T00:00:00Z`),
            lte: new Date(`${arrivalDate}T23:59:59Z`)
          },
          departure: {
            gte: new Date(`${departureDate}T00:00:00Z`),
            lte: new Date(`${departureDate}T23:59:59Z`)
          },
          status: {
            not: "canceled"
          }
        }
      })

      if (existingRequest) {
        throw new Error(`Request already exists with id: ${existingRequest.id}`)
      }

      // Определяем текущий месяц и год
      const currentDate = new Date()
      const month = String(currentDate.getMonth() + 1).padStart(2, "0") // двузначный номер месяца
      const year = String(currentDate.getFullYear()).slice(-2)

      // Определяем границы месяца
      const startOfMonth = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth(),
        1
      )
      const endOfMonth = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth() + 1,
        0,
        23,
        59,
        59
      )

      // Ищем последнюю созданную заявку в этом месяце
      const lastRequest = await prisma.request.findFirst({
        where: { createdAt: { gte: startOfMonth, lte: endOfMonth } },
        orderBy: { createdAt: "desc" } // Последняя заявка
      })

      // Определяем номер
      let sequenceNumber
      if (lastRequest) {
        // Если заявки есть, увеличиваем номер
        const lastNumber = parseInt(lastRequest.requestNumber.slice(0, 4), 10)
        sequenceNumber = String(lastNumber + 1).padStart(4, "0")
      } else {
        // Если заявок еще не было в этом месяце, начинаем с 0001
        sequenceNumber = "0001"
      }

      // Получаем код аэропорта
      const airport = await prisma.airport.findUnique({
        where: { id: airportId }
      })
      if (!airport) {
        throw new Error("Airport not found")
      }

      // Формируем номер заявки
      const requestNumber = `${sequenceNumber}${airport.code}${month}${year}e`

      // Создание заявки
      let filesPath = []
      if (files && files.length > 0) {
        for (const file of files) {
          const uploadedPath = await uploadFiles(file)
          filesPath.push(uploadedPath)
        }
      }

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
          reserve,
          files: filesPath,
          requestNumber
        },
        include: {
          airline: true,
          airport: true,
          person: true
        }
      })

      // Создаём чат, связанный с заявкой
      const newChat = await prisma.chat.create({
        data: {
          request: { connect: { id: newRequest.id } },
          separator: "airline"
        }
      })
      await prisma.chatUser.create({
        data: {
          chat: { connect: { id: newChat.id } },
          user: { connect: { id: senderId } }
        }
      })

      try {
        await logAction({
          context,
          action: "create_request",
          description: `Пользователь <span style='color:#545873'>${user.name}</span> создал заявку <span style='color:#545873'>№${newRequest.requestNumber}</span> для <span style='color:#545873'>${newRequest.person.position} ${newRequest.person.name}</span> в аэропорт <span style='color:#545873'>${newRequest.airport.name}</span>`,
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
        console.error("Ошибка при логировании создания заявки:", error)
      }
      pubsub.publish(NOTIFICATION, {
        notification: {
          __typename: "RequestCreatedNotification",
          ...newRequest
        }
      })
      pubsub.publish(REQUEST_CREATED, { requestCreated: newRequest })
      return newRequest
    },

    updateRequest: async (_, { id, input }, context) => {
      const { user } = context
      // airlineAdminMiddleware(context)
      airlineModerMiddleware(context)
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
        where: { id },
        include: {
          hotelChess: true,
          hotel: true,
          person: true
        }
      })
      if (!oldRequest) {
        throw new Error("Request not found")
      }
      const isArrivalChanged =
        arrival &&
        new Date(arrival).getTime() !== new Date(oldRequest.arrival).getTime()
      const isDepartureChanged =
        departure &&
        new Date(departure).getTime() !==
          new Date(oldRequest.departure).getTime()

      const dataToUpdate = {
        airport: airportId ? { connect: { id: airportId } } : undefined,
        arrival: arrival ? new Date(arrival) : undefined,
        departure: departure ? new Date(departure) : undefined,
        roomCategory,
        roomNumber,
        status,
        mealPlan
      }
      if (hotelId) {
        dataToUpdate.hotel = { connect: { id: hotelId } }
      }
      if (hotelChessId) {
        dataToUpdate.hotelChess = { connect: { id: hotelChessId } }
      }

      // Обработка hotelChess: если заявка уже привязана к номеру, обновляем его даты
      let hotelChessToUpdate = null
      if (
        Array.isArray(oldRequest.hotelChess) &&
        oldRequest.hotelChess.length > 0
      ) {
        hotelChessToUpdate = oldRequest.hotelChess[0]
      } else if (
        oldRequest.hotelChess &&
        typeof oldRequest.hotelChess === "object"
      ) {
        hotelChessToUpdate = oldRequest.hotelChess
      }
      if (hotelChessToUpdate && hotelChessToUpdate.id) {
        await prisma.hotelChess.update({
          where: { id: hotelChessToUpdate.id },
          data: {
            start: isArrivalChanged
              ? new Date(arrival)
              : hotelChessToUpdate.start,
            end: isDepartureChanged
              ? new Date(departure)
              : hotelChessToUpdate.end
          }
        })
      } else {
        console.warn("No valid hotelChess found for updating.")
      }

      // Если даты изменились, пересчитываем mealPlan на основе настроек отеля
      if ((isArrivalChanged || isDepartureChanged) && oldRequest.hotel) {
        const hotel = await prisma.hotel.findUnique({
          where: { id: oldRequest.hotel.id },
          select: {
            breakfast: true,
            lunch: true,
            dinner: true
          }
        })
        const mealTimes = {
          breakfast: hotel.breakfast,
          lunch: hotel.lunch,
          dinner: hotel.dinner
        }
        const newMealPlan = calculateMeal(
          isArrivalChanged ? arrival : oldRequest.arrival,
          isDepartureChanged ? departure : oldRequest.departure,
          mealTimes
        )
        dataToUpdate.mealPlan = {
          included: true,
          breakfast: newMealPlan.totalBreakfast,
          lunch: newMealPlan.totalLunch,
          dinner: newMealPlan.totalDinner,
          dailyMeals: newMealPlan.dailyMeals
        }
      }

      const updatedRequest = await prisma.request.update({
        where: { id },
        data: dataToUpdate,
        include: {
          hotelChess: true,
          person: true
        }
      })

      try {
        await logAction({
          context,
          action: "update_request",
          description: `Пользователь <span style='color:#545873'>${user.name}</span> изменил заявку <span style='color:#545873'> № ${updatedRequest.requestNumber}</span> для <span style='color:#545873'>${updatedRequest.person.position} ${updatedRequest.person.name}</span> c <span style='color:#545873'>${request.arrival} - ${request.departure}</span> до <span style='color:#545873'>${updatedStart} - ${updatedEnd}</span>`,
          requestId: updatedRequest.id
        })
      } catch (error) {
        console.error("Ошибка при логировании изменения заявки:", error)
      }
      pubsub.publish(REQUEST_UPDATED, { requestUpdated: updatedRequest })
      return updatedRequest
    },

    modifyDailyMeals: async (_, { input }, context) => {
      const { user } = context
      const { requestId, dailyMeals } = input
      const request = await prisma.request.findUnique({
        where: { id: requestId },
        select: { id: true, requestNumber: true }
      })
      if (!request) {
        throw new Error("Request not found")
      }
      const updatedMealPlan = await updateDailyMeals(requestId, dailyMeals)
      try {
        await logAction({
          context,
          action: "update_request",
          description: `Пользователь <span style='color:#545873'>${user.name}</span> изменил питание для заявки<span style='color:#545873'> № ${request.requestNumber}</span>`,
          requestId: request.id
        })
      } catch (error) {
        console.error("Ошибка при логировании изменения питания заявки:", error)
      }
      pubsub.publish(REQUEST_UPDATED, { requestUpdated: updatedMealPlan })
      return updatedMealPlan
    },

    extendRequestDates: async (_, { input }, context) => {
      const { user } = context
      airlineModerMiddleware(context)
      const currentTime = new Date()
      const adjustedTime = new Date(currentTime.getTime() + 3 * 60 * 60 * 1000)
      const formattedTime = adjustedTime.toISOString()

      const { requestId, newStart, newEnd, status } = input
      // console.log(newStart, newEnd)
      const request = await prisma.request.findUnique({
        where: { id: requestId },
        include: {
          hotelChess: true,
          hotel: true,
          mealPlan: true,
          chat: true,
          airline: true
        }
      })
      if (!request) {
        throw new Error("Request not found")
      }
      if (!request.hotelChess || request.hotelChess.length === 0) {
        throw new Error("Request has not been placed in a hotel")
      }

      // Если пользователь не диспетчер, отправляем уведомление диспетчеру
      // if (!user.dispatcher) {
      if (user.airlineId && request.status != "created") {
        const extendRequest = {
          requestId,
          newStart,
          newEnd
        }
        const updatedStart = newStart ? newStart : request.arrival
        const updatedEnd = newEnd ? newEnd : request.departure
        const chat = await prisma.chat.findFirst({
          where: { requestId: requestId, separator: "airline" }
        })
        const message = await prisma.message.create({
          data: {
            text: `Запрос на изменение дат заявки ${
              request.requestNumber
            } с ${formatDate(request.arrival)} - ${formatDate(
              request.departure
            )} на ${formatDate(updatedStart)} - ${formatDate(updatedEnd)}`,
            sender: { connect: { id: user.id } },
            chat: { connect: { id: chat.id } },
            separator: "important",
            createdAt: formattedTime
          },
          include: {
            sender: true
          }
        })
        pubsub.publish(NOTIFICATION, {
          notification: {
            __typename: "ExtendRequestNotification",
            ...extendRequest
          }
        })
        pubsub.publish(`${MESSAGE_SENT}_${chat.id}`, { messageSent: message })
        // const message = `Запрос на продление заявки ${request.requestNumber} отправлен диспетчеру.`
        return request
      }

      // Если новые значения не пришли, используем существующие данные
      const updatedStart = newStart ? newStart : request.arrival
      const updatedEnd = newEnd ? newEnd : request.departure

      // Обновляем hotelChess с новыми (или старыми) датами
      const updatedHotelChess = await prisma.hotelChess.update({
        where: { id: request.hotelChess[0].id },
        data: { start: updatedStart, end: updatedEnd }
      })

      const existingMealPlan = request.mealPlan || {
        included: true,
        breakfast: 0,
        lunch: 0,
        dinner: 0,
        dailyMeals: []
      }

      // Используем обновлённые даты для расчёта плана питания

      const hotel = await prisma.hotel.findUnique({
        where: { id: request.hotelId },
        select: {
          breakfast: true,
          lunch: true,
          dinner: true
        }
      })
      const mealTimes = {
        breakfast: hotel.breakfast,
        lunch: hotel.lunch,
        dinner: hotel.dinner
      }
      const newMealPlan = calculateMeal(updatedStart, updatedEnd, mealTimes)

      const updatedRequest = await prisma.request.update({
        where: { id: requestId },
        data: {
          arrival: updatedStart,
          departure: updatedEnd,
          mealPlan: {
            included: true,
            breakfast: newMealPlan.totalBreakfast,
            lunch: newMealPlan.totalLunch,
            dinner: newMealPlan.totalDinner,
            dailyMeals: newMealPlan.dailyMeals
          },
          status: status
        },
        include: {
          hotelChess: true,
          person: true
        }
      })

      try {
        await logAction({
          context,
          action: "update_request",
          description: `Пользователь <span style='color:#545873'>${user.name}</span> изменил заявку <span style='color:#545873'> № ${updatedRequest.requestNumber}</span> для <span style='color:#545873'>${updatedRequest.person.position} ${updatedRequest.person.name}</span> c <span style='color:#545873'>${request.arrival} - ${request.departure}</span> до <span style='color:#545873'>${updatedStart} - ${updatedEnd}</span>`,
          requestId: updatedRequest.id
        })
      } catch (error) {
        console.error("Ошибка при логировании изменения заявки:", error)
      }

      pubsub.publish(REQUEST_UPDATED, { requestUpdated: updatedRequest })
      return updatedRequest
    },

    archivingRequest: async (_, input, context) => {
      const { user } = context
      const requestId = input.id
      const request = await prisma.request.findUnique({
        where: { id: requestId }
      })
      if (
        new Date(request.departure) < new Date() &&
        request.status !== "archived"
      ) {
        const archiveRequest = await prisma.request.update({
          where: { id: requestId },
          data: { status: "archived", archive: true }
        })
        await logAction({
          context,
          action: "archive_request",
          description: `Пользователь <span style='color:#545873'>${user.name}</span> отправил заявку <span style='color:#545873'>№ ${archiveRequest.requestNumber}</span> в архив`,
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
    },

    cancelRequest: async (_, input, context) => {
      const { user } = context
      const requestId = input.id
      const request = await prisma.request.findUnique({
        where: { id: requestId },
        include: { hotelChess: true }
      })
      const canceledRequest = await prisma.request.update({
        where: { id: requestId },
        data: { status: "canceled" }
      })
      if (request.hotelChess) {
        await prisma.hotelChess.deleteMany({
          where: { requestId: requestId }
        })
      }
      await logAction({
        context,
        action: "cancel_request",
        description: `Пользователь <span style='color:#545873'>${user.name}</span> отменил заявку № <span style='color:#545873'>${canceledRequest.requestNumber}</span>`,
        oldData: request,
        newData: { status: "canceled" },
        hotelId: request.hotelId,
        requestId: request.id
      })
      pubsub.publish(REQUEST_UPDATED, { requestUpdated: canceledRequest })
      return canceledRequest
    }
  },

  Subscription: {
    requestCreated: {
      subscribe: () => pubsub.asyncIterator([REQUEST_CREATED])
    },
    requestUpdated: {
      subscribe: () => pubsub.asyncIterator([REQUEST_UPDATED])
    },
    notification: {
      subscribe: () => pubsub.asyncIterator([NOTIFICATION])
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
      return await prisma.hotelChess.findFirst({
        where: { requestId: parent.id }
      })
    },
    person: async (parent) => {
      return await prisma.airlinePersonal.findUnique({
        where: { id: parent.personId }
      })
    },
    chat: async (parent) => {
      return await prisma.chat.findMany({
        where: { requestId: parent.id }
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

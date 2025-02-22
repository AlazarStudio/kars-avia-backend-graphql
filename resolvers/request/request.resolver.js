import { prisma } from "../../prisma.js"
import isEqual from "lodash.isequal"
import logAction from "../../exports/logaction.js"
import {
  pubsub,
  REQUEST_CREATED,
  REQUEST_UPDATED,
  NOTIFICATION
} from "../../exports/pubsub.js"
import calculateMeal from "../../exports/calculateMeal.js"
import updateHotelChess from "../../exports/updateHotelChess.js"
import { reverseDateTimeFormatter } from "../../exports/dateTimeFormater.js"
import {
  adminHotelAirMiddleware,
  airlineAdminMiddleware
} from "../../middlewares/authMiddleware.js"
import updateDailyMeals from "../../exports/updateDailyMeals.js"

const requestResolver = {
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
              description: `Заявка № ${updatedRequest.requestNumber} открыта пользователем ${user.name}`,
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
    createRequest: async (_, { input }, context) => {
      const { user } = context
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

      // Генерируем порядковый номер заявки
      // const requestCount = await prisma.request.count()
      const currentDate = new Date()
      const month = String(currentDate.getMonth() + 1).padStart(2, "0") // двузначный номер месяца
      const year = String(currentDate.getFullYear()).slice(-2)

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
      const requestCount = await prisma.request.count({
        where: { createdAt: { gte: startOfMonth, lte: endOfMonth } }
      })

      const airport = await prisma.airport.findUnique({
        where: { id: airportId }
      })
      if (!airport) {
        throw new Error("Airport not found")
      }

      const sequenceNumber = String(requestCount + 1).padStart(4, "0")
      const requestNumber = `${sequenceNumber}-${airport.code}-${month}${year}-e`

      // const currentDate = new Date()
      // const formattedDate = currentDate
      //   .toLocaleDateString("ru-RU")
      //   .replace(/\./g, ".")
      // const requestNumber = `${String(requestCount + 1).padStart(4, "0")}-${
      //   airport.code
      // }-${formattedDate}`

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
          description: `Пользователь ${user.name} создал заявку № ${newRequest.requestNumber} для ${newRequest.person.position} ${newRequest.person.name} в аэропорт ${newRequest.airport.name}`,
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

      pubsub.publish(REQUEST_CREATED, { requestCreated: newRequest })
      return newRequest
    },

    updateRequest: async (_, { id, input }, context) => {
      const { user } = context
      // airlineAdminMiddleware(context)
      adminHotelAirMiddleware(context)
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
          description: `Пользователь ${user.name} ${
            updatedRequest.status === "extended"
              ? ("продлил c ",
                oldRequest.arrival,
                " - ",
                oldRequest.departure,
                " до ",
                arrival,
                " - ",
                departure)
              : updatedRequest.status === "reduced"
              ? ("сократил c ",
                oldRequest.arrival,
                " - ",
                oldRequest.departure,
                " до ",
                arrival,
                " - ",
                departure)
              : "изменил"
          } заявку № ${updatedRequest.requestNumber} для ${
            updatedRequest.person.position
          } ${updatedRequest.person.name}`,
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
          description: `Пользователь ${user.name} изменил питание для заявки № ${request.requestNumber}`,
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
      const { requestId, newStart, newEnd, status } = input

      const request = await prisma.request.findUnique({
        where: { id: requestId },
        include: { hotelChess: true, hotel: true, mealPlan: true }
      })
      if (!request) {
        throw new Error("Request not found")
      }
      if (!request.hotelChess || request.hotelChess.length === 0) {
        throw new Error("Request has not been placed in a hotel")
      }

      // Если пользователь не диспетчер, отправляем уведомление диспетчеру
      if (!user.dispatcher) {
        let dispatcherId = request.receiverId
        if (!dispatcherId) {
          const dispatcher = await prisma.user.findFirst({
            where: { dispatcher: true }
          })
          if (dispatcher) {
            dispatcherId = dispatcher.id
          } else {
            throw new Error("Диспетчер не найден")
          }
        }
        const extendRequest = {
          requestId,
          newStart,
          newEnd,
          dispatcherId
        }
        pubsub.publish(NOTIFICATION, {
          notification: {
            __typename: "ExtendRequestNotification",
            ...extendRequest
          }
        })
        const message = `Запрос на продление заявки ${request.requestNumber} отправлен диспетчеру.`
        return message
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
      const arrivalDateTime = updatedStart
      const departureDateTime = updatedEnd

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
      const newEndDate = updatedEnd
      const adjustedDailyMeals = (existingMealPlan.dailyMeals || []).filter(
        (day) => new Date(day.date) <= new Date(newEndDate)
      )
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
          departure: newEndDate,
          mealPlan: updatedMealPlan,
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
          description: `Пользователь ${user.name} ${
            updatedRequest.status === "extended"
              ? `продлил c ${request.arrival} - ${request.departure} до ${updatedStart} - ${updatedEnd}`
              : updatedRequest.status === "reduced"
              ? `сократил c ${request.arrival} - ${request.departure} до ${updatedStart} - ${updatedEnd}`
              : "изменил"
          } заявку № ${updatedRequest.requestNumber} для ${
            updatedRequest.person.position
          } ${updatedRequest.person.name}`,
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
          description: `Пользователь ${user.name} отправил заявку № ${archiveRequest.requestNumber} в архив`,
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
        description: `Пользователь ${user.name} отменил заявку № ${canceledRequest.requestNumber}`,
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

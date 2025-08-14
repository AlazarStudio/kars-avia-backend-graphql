import { prisma } from "../../prisma.js"
import { GraphQLError } from "graphql"
import {
  allMiddleware,
  superAdminMiddleware
} from "../../middlewares/authMiddleware.js"

const analyticsResolver = {
  Query: {
    analyticsAirlineRequests: async (_, { input }, context) => {
      const { airlineId, startDate, endDate } = input

      const createdByPeriodData = await createdByPeriod(
        airlineId,
        startDate,
        endDate
      )
      const totalCreatedRequestsCount = await totalCreatedRequests(
        airlineId,
        startDate,
        endDate
      )
      const totalCancelledRequestsCount = await totalCancelledRequests(
        airlineId,
        startDate,
        endDate
      )

      return {
        createdByPeriod: createdByPeriodData,
        totalCreatedRequests: totalCreatedRequestsCount,
        totalCancelledRequests: totalCancelledRequestsCount
      }
    },
    analyticsHotelRequests: async (_, { input }, context) => {
      const { hotelId, startDate, endDate } = input

      const createdByPeriodData = await createdByPeriodForHotel(
        hotelId,
        startDate,
        endDate
      )
      const totalReceivedRequestsCount = await totalReceivedRequests(
        hotelId,
        startDate,
        endDate
      )
      const totalCancelledRequestsCount = await totalCancelledHotelRequests(
        hotelId,
        startDate,
        endDate
      )

      return {
        createdByPeriod: createdByPeriodData,
        totalReceivedRequests: totalReceivedRequestsCount,
        totalCancelledRequests: totalCancelledRequestsCount
      }
    },
    analyticsHotelRequests: async (_, { input }, context) => {
      const { hotelId, startDate, endDate } = input

      const receivedRequestsCount = await receivedRequests(
        hotelId,
        startDate,
        endDate
      )
      const acceptedRequestsCount = await acceptedRequests(
        hotelId,
        startDate,
        endDate
      )
      const cancelledRequestsCount = await cancelledHotelRequests(
        hotelId,
        startDate,
        endDate
      )
      const totalReceivedRequestsCount = await totalReceivedRequests(
        hotelId,
        startDate,
        endDate
      )
      const totalCancelledRequestsCount = await totalCancelledHotelRequests(
        hotelId,
        startDate,
        endDate
      )

      return {
        receivedRequests: receivedRequestsCount,
        acceptedRequests: acceptedRequestsCount,
        cancelledRequests: cancelledRequestsCount,
        totalReceivedRequests: totalReceivedRequestsCount,
        totalCancelledRequests: totalCancelledRequestsCount
      }
    }
  },
  Mutation: {},
  Analytics: {}
}

// /*
;("created")
;("opened")
;("done")
;("reduced")
;("extended")
;("transferred")
;("archiving")
;("archived")
;("canceled")

const createdByPeriod = async (airlineId, startDate, endDate) => {
  const requests = await prisma.request.findMany({
    where: {
      airlineId: airlineId,
      createdAt: {
        gte: new Date(startDate),
        lte: new Date(endDate)
      }
    },
    select: {
      createdAt: true,
      status: true
    },
    orderBy: {
      createdAt: "asc"
    }
  })

  const dateCount = {}

  requests.forEach((request) => {
    const dateKey = request.createdAt.toISOString().split("T")[0] // Получаем только дату без времени

    if (!dateCount[dateKey]) {
      dateCount[dateKey] = { count_created: 0, count_canceled: 0 }
    }

    // Подсчитываем созданные и отменённые заявки
    if (request.status === "canceled") {
      dateCount[dateKey].count_canceled += 1
    } else {
      dateCount[dateKey].count_created += 1
    }
  })

  // Преобразуем объект в массив вида [{ date, count_created, count_canceled }]
  const result = Object.keys(dateCount).map((date) => ({
    date: date,
    count_created: dateCount[date].count_created,
    count_canceled: dateCount[date].count_canceled
  }))

  return result
}

const cancelledAirlineRequests = async (airlineId, startDate, endDate) => {
  return await prisma.request.count({
    where: {
      airlineId: airlineId,
      status: "canceled", // фильтрация по статусу "canceled"
      createdAt: {
        gte: new Date(startDate),
        lte: new Date(endDate)
      }
    }
  })
}

const totalCreatedRequests = async (airlineId, startDate, endDate) => {
  return await prisma.request.count({
    where: {
      airlineId: airlineId,
      createdAt: {
        gte: new Date(startDate),
        lte: new Date(endDate)
      }
    }
  })
}

// Подсчёт общего количества отменённых заявок за период
const totalCancelledRequests = async (airlineId, startDate, endDate) => {
  return await prisma.request.count({
    where: {
      airlineId: airlineId,
      status: "canceled", // фильтрация по статусу "canceled"
      createdAt: {
        gte: new Date(startDate),
        lte: new Date(endDate)
      }
    }
  })
}

// Для гостиницы (аналогичные функции)
const totalReceivedRequests = async (hotelId, startDate, endDate) => {
  return await prisma.request.count({
    where: {
      hotelId: hotelId,
      createdAt: {
        gte: new Date(startDate),
        lte: new Date(endDate)
      }
    }
  })
}

const totalCancelledHotelRequests = async (hotelId, startDate, endDate) => {
  return await prisma.request.count({
    where: {
      hotelId: hotelId,
      status: "canceled",
      createdAt: {
        gte: new Date(startDate),
        lte: new Date(endDate)
      }
    }
  })
}

const averageProcessingTime = async (airlineId, startDate, endDate) => {
  return await prisma.request.aggregate({
    where: {
      airlineId: airlineId,
      createdAt: {
        gte: new Date(startDate),
        lte: new Date(endDate)
      }
    }
    // _avg: {
    //   processingTime: true
    // }
  })
}

const receivedRequests = async (hotelId, startDate, endDate) => {
  return await prisma.request.count({
    where: {
      hotelId: hotelId, // фильтрация по гостинице
      createdAt: {
        gte: new Date(startDate),
        lte: new Date(endDate)
      }
    }
  })
}

const acceptedRequests = async (hotelId, startDate, endDate) => {
  const statuses = [
    "done",
    "reduced",
    "extended",
    "transferred",
    "archiving",
    "archived"
  ]
  return await prisma.request.count({
    where: {
      hotelId: hotelId,
      status: { in: statuses }, // фильтрация по статусу "ACCEPTED"
      createdAt: {
        gte: new Date(startDate),
        lte: new Date(endDate)
      }
    }
  })
}

const cancelledHotelRequests = async (hotelId, startDate, endDate) => {
  return await prisma.request.count({
    where: {
      hotelId: hotelId,
      status: "canceled", // фильтрация по статусу "canceled"
      createdAt: {
        gte: new Date(startDate),
        lte: new Date(endDate)
      }
    }
  })
}

// */

export default analyticsResolver

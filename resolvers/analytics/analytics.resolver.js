import { prisma } from "../../prisma.js"
import { GraphQLError } from "graphql"
import {
  allMiddleware,
  superAdminMiddleware
} from "../../middlewares/authMiddleware.js"

const analyticsResolver = {
  Query: {},
  Mutation: {},
  Analytics: {}
}

/* 

const airlineAnalytics = await prisma.application.aggregate({
  where: {
    airlineId: airlineId,
    createdAt: {
      gte: startDate,
      lte: endDate
    }
  },
  _count: {
    id: true
  },
  _avg: {
    processingTime: true
  }
})

const hotelAnalytics = await prisma.application.aggregate({
  where: {
    hotelId: hotelId,
    createdAt: {
      gte: startDate,
      lte: endDate
    }
  },
  _count: {
    id: true // Все заявки
  },
  _sum: {
    accepted: true, // Принятые
    cancelled: true // Отменённые
  }
})


const createdByPeriod = await prisma.application.groupBy({
  by: ['createdAt'],
  where: {
    airlineId: airlineId, // Параметр авиакомпании (можно сделать динамичным)
    createdAt: {
      gte: startDate, // начало периода
      lte: endDate    // конец периода
    }
  },
  _count: {
    id: true // Считаем количество заявок
  },
  orderBy: {
    createdAt: 'asc' // Сортируем по дате
  }
})

const cancelledAirlineApplications = await prisma.application.count({
  where: {
    airlineId: airlineId,
    status: 'CANCELLED', // Параметр статуса
    createdAt: {
      gte: startDate, // начало периода
      lte: endDate    // конец периода
    }
  }
})

const averageProcessingTime = await prisma.application.aggregate({
  where: {
    airlineId: airlineId,
    createdAt: {
      gte: startDate,
      lte: endDate
    }
  },
  _avg: {
    processingTime: true // Нужно добавить в модель 'processingTime', которое хранит разницу
  }
})


const receivedApplications = await prisma.application.count({
  where: {
    hotelId: hotelId, // Параметр гостиницы
    createdAt: {
      gte: startDate,
      lte: endDate
    }
  }
})


const acceptedApplications = await prisma.application.count({
  where: {
    hotelId: hotelId,
    status: 'ACCEPTED', // Параметр статуса
    createdAt: {
      gte: startDate,
      lte: endDate
    }
  }
})

const cancelleHoteldApplications = await prisma.application.count({
  where: {
    hotelId: hotelId,
    status: 'CANCELLED', // Параметр статуса
    createdAt: {
      gte: startDate,
      lte: endDate
    }
  }
})


*/


export default analyticsResolver

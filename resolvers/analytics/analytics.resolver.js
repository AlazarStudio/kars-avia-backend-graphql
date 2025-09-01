import { prisma } from "../../prisma.js"
import { GraphQLError } from "graphql"

const analyticsResolver = {
  Query: {
    analyticsEntityRequests: async (_, { input }, context) => {
      const { startDate, endDate, filters } = input

      // Формируем условия фильтрации
      const whereConditions = buildWhereConditionsRequests(
        filters,
        startDate,
        endDate
      )

      const createdByPeriodData = await createdByPeriodForEntityRequests(
        whereConditions,
        startDate,
        endDate
      )
      const totalCreatedRequestsCount = await totalCreatedRequests(
        whereConditions,
        startDate,
        endDate
      )
      const totalCancelledRequestsCount = await totalCancelledRequests(
        whereConditions,
        startDate,
        endDate
      )

      const statusCounts = await countRequestsByStatus(whereConditions)

      // const statusCountsArray = Object.entries(statusCounts).map(
      //   ([status, count]) => ({ status, count })
      // )

      return {
        createdByPeriod: createdByPeriodData,
        totalCreatedRequests: totalCreatedRequestsCount,
        totalCancelledRequests: totalCancelledRequestsCount,
        statusCounts
      }
    },
    analyticsEntityUsers: async (_, { input }) => {
      const { filters, startDate, endDate } = input

      if (!filters?.personId) {
        throw new Error("personId обязателен для аналитики пользователей")
      }

      const result = await analyticsUserRequests({
        personId: filters.personId,
        filters,
        startDate,
        endDate
      })

      return result
    }
  }
}

;("created")
;("opened")
;("done")
;("reduced")
;("extended")
;("transferred")
;("archiving")
;("archived")
;("canceled")

// Функция для построения условий фильтрации
const buildWhereConditionsRequests = (filters, startDate, endDate) => {
  const whereConditions = {
    createdAt: {
      gte: new Date(startDate),
      lte: new Date(endDate)
    }
  }

  // Динамически добавляем фильтры
  if (filters.airlineId) whereConditions.airlineId = filters.airlineId
  if (filters.hotelId) whereConditions.hotelId = filters.hotelId
  if (filters.personId) whereConditions.personId = filters.personId

  return whereConditions
}

const analyticsUserRequests = async ({
  personId,
  filters,
  startDate,
  endDate
}) => {
  // 1. Фильтр по дате
  const dateFilter = {
    createdAt: {
      gte: new Date(startDate),
      lte: new Date(endDate)
    }
  }

  // 2. Фильтр по сущностям (авиакомпания, отель)
  const entityFilter = {}
  if (filters?.airlineId) entityFilter.airlineId = filters.airlineId
  if (filters?.hotelId) entityFilter.hotelId = filters.hotelId

  // 3. Созданные заявки (sender)
  const createdRequestsCount = await prisma.request.count({
    where: {
      senderId: personId,
      ...entityFilter,
      ...dateFilter
    }
  })

  // 4. Обработанные заявки (receiver + posted)
  const receivedRequests = await prisma.request.findMany({
    where: {
      receiverId: personId,
      ...entityFilter,
      ...dateFilter
    },
    select: { id: true }
  })

  const postedRequests = await prisma.request.findMany({
    where: {
      postedId: personId, // ✅ правильное поле
      ...entityFilter,
      ...dateFilter
    },
    select: { id: true }
  })

  // 5. Отменённые заявки
  const cancelledRequests = await prisma.request.count({
    where: {
      senderId: personId,
      receiverId: personId,
      postedId: personId,
      ...entityFilter,
      ...dateFilter,
      status: "canceled"
    }
  })

  // ~. Объединяем и убираем дубликаты
  const processedIds = new Set([
    ...receivedRequests.map((r) => r.id),
    ...postedRequests.map((r) => r.id)
  ])

  const processedCount = processedIds.size

  return {
    createdRequests: createdRequestsCount,
    processedRequests: processedCount,
    cancelledRequests: cancelledRequests
  }
}

// Получение данных по периодам с фильтрацией
const createdByPeriodForEntityRequests = async (
  whereConditions,
  startDate,
  endDate
) => {
  const requests = await prisma.request.findMany({
    where: whereConditions,
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

// Общее количество созданных заявок для всех фильтров
const totalCreatedRequests = async (whereConditions, startDate, endDate) => {
  return await prisma.request.count({
    where: whereConditions
  })
}

// Общее количество отменённых заявок для всех фильтров
const totalCancelledRequests = async (whereConditions, startDate, endDate) => {
  return await prisma.request.count({
    where: {
      ...whereConditions,
      status: "canceled" // фильтрация по статусу "canceled"
    }
  })
}

const countRequestsByStatus = async (whereConditions) => {
  // Получаем все заявки по фильтру
  const requests = await prisma.request.findMany({
    where: whereConditions,
    select: {
      status: true
    }
  })

  // Считаем количество по каждому статусу
  const statusCount = {}
  requests.forEach((request) => {
    const status = request.status || "unknown"
    if (!statusCount[status]) statusCount[status] = 0
    statusCount[status] += 1
  })

  return statusCount // { created: 10, canceled: 5, done: 7, ... }
}

export default analyticsResolver

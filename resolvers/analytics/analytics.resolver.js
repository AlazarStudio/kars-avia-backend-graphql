import { prisma } from "../../prisma.js"
import { GraphQLError } from "graphql"

const analyticsResolver = {
  Query: {
    analyticsEntityRequests: async (_, { input }, context) => {
      const { startDate, endDate, filters } = input

      // Формируем условия фильтрации
      const whereConditions = buildWhereConditions(filters, startDate, endDate)

      const createdByPeriodData = await createdByPeriodForEntity(
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

      return {
        createdByPeriod: createdByPeriodData,
        totalCreatedRequests: totalCreatedRequestsCount,
        totalCancelledRequests: totalCancelledRequestsCount
      }
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
const buildWhereConditions = (filters, startDate, endDate) => {
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

// Получение данных по периодам с фильтрацией
const createdByPeriodForEntity = async (
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

export default analyticsResolver

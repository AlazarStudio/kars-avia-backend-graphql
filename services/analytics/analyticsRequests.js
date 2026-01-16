import { prisma } from "../../prisma.js"

export const buildWhereConditionsRequests = (filters, startDate, endDate) => {
  const whereConditions = {
    createdAt: {
      gte: new Date(startDate),
      lte: new Date(endDate)
    }
  }

  if (filters.airlineId) whereConditions.airlineId = filters.airlineId
  if (filters.hotelId) whereConditions.hotelId = filters.hotelId
  if (filters.personId) whereConditions.personId = filters.personId

  return whereConditions
}

export const analyticsUserRequests = async ({
  personId,
  filters,
  startDate,
  endDate
}) => {
  const dateFilter = {
    createdAt: {
      gte: new Date(startDate),
      lte: new Date(endDate)
    }
  }

  const entityFilter = {}
  if (filters?.airlineId) entityFilter.airlineId = filters.airlineId
  if (filters?.hotelId) entityFilter.hotelId = filters.hotelId

  const createdRequestsCount = await prisma.request.count({
    where: {
      senderId: personId,
      ...entityFilter,
      ...dateFilter
    }
  })

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
      postedId: personId,
      ...entityFilter,
      ...dateFilter
    },
    select: { id: true }
  })

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

  const processedIds = new Set([
    ...receivedRequests.map((r) => r.id),
    ...postedRequests.map((r) => r.id)
  ])

  return {
    createdRequests: createdRequestsCount,
    processedRequests: processedIds.size,
    cancelledRequests: cancelledRequests
  }
}

export const createdByPeriodForEntityRequests = async (
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
    const dateKey = request.createdAt.toISOString().split("T")[0]

    if (!dateCount[dateKey]) {
      dateCount[dateKey] = { count_created: 0, count_canceled: 0 }
    }

    if (request.status === "canceled") {
      dateCount[dateKey].count_canceled += 1
    } else {
      dateCount[dateKey].count_created += 1
    }
  })

  return Object.keys(dateCount).map((date) => ({
    date: date,
    count_created: dateCount[date].count_created,
    count_canceled: dateCount[date].count_canceled
  }))
}

export const totalCreatedRequests = async (whereConditions) => {
  return await prisma.request.count({
    where: whereConditions
  })
}

export const totalCancelledRequests = async (whereConditions) => {
  return await prisma.request.count({
    where: {
      ...whereConditions,
      status: "canceled"
    }
  })
}

export const countRequestsByStatus = async (whereConditions) => {
  const requests = await prisma.request.findMany({
    where: whereConditions,
    select: {
      status: true
    }
  })

  const statusCount = {}
  requests.forEach((request) => {
    const status = request.status || "unknown"
    if (!statusCount[status]) statusCount[status] = 0
    statusCount[status] += 1
  })

  return statusCount
}


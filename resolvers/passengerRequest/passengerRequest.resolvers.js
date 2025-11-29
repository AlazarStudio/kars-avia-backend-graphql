import { GraphQLError } from "graphql"

function resolveUserId(context, inputCreatedById) {
  return (
    inputCreatedById ||
    context.currentUser?.id ||
    context.user?.id ||
    context.userId
  )
}

function updateTimes(prev, status) {
  const now = new Date()
  const times = { ...(prev || {}) }

  switch (status) {
    case "ACCEPTED":
      if (!times.acceptedAt) times.acceptedAt = now
      break
    case "IN_PROGRESS":
      if (!times.inProgressAt) times.inProgressAt = now
      break
    case "COMPLETED":
      if (!times.finishedAt) times.finishedAt = now
      break
    case "CANCELLED":
      if (!times.cancelledAt) times.cancelledAt = now
      break
  }

  return times
}

export const passengerRequestResolvers = {
  // --------- поля связей ---------
  PassengerRequest: {
    airline: (parent, _args, { prisma }) =>
      prisma.airline.findUnique({ where: { id: parent.airlineId } }),

    airport: (parent, _args, { prisma }) =>
      parent.airportId
        ? prisma.airport.findUnique({ where: { id: parent.airportId } })
        : null,

    createdBy: (parent, _args, { prisma }) =>
      prisma.user.findUnique({ where: { id: parent.createdById } }),

    chats: (parent, _args, { prisma }) =>
      prisma.chat.findMany({ where: { passengerRequestId: parent.id } })
  },

  // --------- запросы ---------
  Query: {
    passengerRequests: async (_parent, args, { prisma }) => {
      const { filter, skip, take } = args || {}
      const where = {}

      if (filter?.airlineId) where.airlineId = filter.airlineId
      if (filter?.airportId) where.airportId = filter.airportId
      if (filter?.status) where.status = filter.status

      if (filter?.search) {
        const search = filter.search.trim()
        if (search) {
          where.OR = [
            { flightNumber: { contains: search, mode: "insensitive" } },
            { routeFrom: { contains: search, mode: "insensitive" } },
            { routeTo: { contains: search, mode: "insensitive" } }
          ]
        }
      }

      return prisma.passengerRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: skip ?? undefined,
        take: take ?? undefined
      })
    },

    passengerRequest: (_parent, { id }, { prisma }) =>
      prisma.passengerRequest.findUnique({ where: { id } })
  },

  // --------- мутации ---------
  Mutation: {
    // создание
    createPassengerRequest: async (_parent, { input }, context) => {
      const { prisma } = context
      const {
        airlineId,
        airportId,
        waterService,
        mealService,
        livingService,
        status,
        createdById: inputCreatorId,
        ...rest
      } = input

      const createdById = resolveUserId(context, inputCreatorId)
      if (!createdById) {
        throw new GraphQLError("createdById is required")
      }

      const data = {
        ...rest,
        airline: { connect: { id: airlineId } },
        createdBy: { connect: { id: createdById } }
      }

      if (airportId) data.airport = { connect: { id: airportId } }
      if (status) data.status = status

      if (waterService) {
        data.waterService = {
          plan: waterService.plan || null,
          status: "NEW",
          times: null,
          people: []
        }
      }

      if (mealService) {
        data.mealService = {
          plan: mealService.plan || null,
          status: "NEW",
          times: null,
          people: []
        }
      }

      if (livingService) {
        data.livingService = {
          plan: livingService.plan || null,
          withTransfer: livingService.withTransfer ?? false,
          status: "NEW",
          times: null,
          hotels: [],
          drivers: []
        }
      }

      return prisma.passengerRequest.create({ data })
    },

    // обновление шапки + планов
    updatePassengerRequest: async (_parent, { id, input }, { prisma }) => {
      const existing = await prisma.passengerRequest.findUnique({
        where: { id }
      })
      if (!existing) throw new GraphQLError("PassengerRequest not found")

      const {
        airlineId,
        airportId,
        waterService,
        mealService,
        livingService,
        ...rest
      } = input

      const data = {}

      Object.entries(rest).forEach(([key, value]) => {
        if (value !== undefined) data[key] = value
      })

      if (airlineId) {
        data.airline = { connect: { id: airlineId } }
      }

      if (airportId !== undefined) {
        if (airportId === null) data.airport = { disconnect: true }
        else data.airport = { connect: { id: airportId } }
      }

      if (waterService) {
        const prev = existing.waterService || {}
        data.waterService = {
          ...prev,
          ...(waterService.plan !== undefined && { plan: waterService.plan })
        }
      }

      if (mealService) {
        const prev = existing.mealService || {}
        data.mealService = {
          ...prev,
          ...(mealService.plan !== undefined && { plan: mealService.plan })
        }
      }

      if (livingService) {
        const prev = existing.livingService || {}
        data.livingService = {
          ...prev,
          ...(livingService.plan !== undefined && { plan: livingService.plan }),
          ...(livingService.withTransfer !== undefined && {
            withTransfer: livingService.withTransfer
          })
        }
      }

      return prisma.passengerRequest.update({ where: { id }, data })
    },

    deletePassengerRequest: async (_parent, { id }, { prisma }) => {
      await prisma.passengerRequest.delete({ where: { id } })
      return true
    },

    // общий статус заявки
    setPassengerRequestStatus: async (_parent, { id, status }, { prisma }) => {
      const existing = await prisma.passengerRequest.findUnique({
        where: { id }
      })
      if (!existing) throw new GraphQLError("PassengerRequest not found")

      const statusTimes = updateTimes(existing.statusTimes, status)

      return prisma.passengerRequest.update({
        where: { id },
        data: {
          status,
          statusTimes
        }
      })
    },

    // статус конкретного сервиса
    setPassengerRequestServiceStatus: async (
      _parent,
      { id, service, status },
      { prisma }
    ) => {
      const existing = await prisma.passengerRequest.findUnique({
        where: { id }
      })
      if (!existing) throw new GraphQLError("PassengerRequest not found")

      const data = {}

      if (service === "WATER") {
        const prev = existing.waterService || { people: [] }
        data.waterService = {
          ...prev,
          status,
          times: updateTimes(prev.times, status)
        }
      } else if (service === "MEAL") {
        const prev = existing.mealService || { people: [] }
        data.mealService = {
          ...prev,
          status,
          times: updateTimes(prev.times, status)
        }
      } else if (service === "LIVING") {
        const prev = existing.livingService || { hotels: [], drivers: [] }
        data.livingService = {
          ...prev,
          status,
          times: updateTimes(prev.times, status)
        }
      }

      return prisma.passengerRequest.update({ where: { id }, data })
    },

    // добавить ФИО из скана / вручную
    addPassengerRequestPerson: async (
      _parent,
      { requestId, service, person },
      { prisma }
    ) => {
      const existing = await prisma.passengerRequest.findUnique({
        where: { id: requestId }
      })
      if (!existing) throw new GraphQLError("PassengerRequest not found")

      const data = {}

      if (service === "WATER") {
        const prev = existing.waterService || {
          plan: null,
          status: "NEW",
          times: null,
          people: []
        }
        const people = [...(prev.people || []), person]
        data.waterService = { ...prev, people }
      } else if (service === "MEAL") {
        const prev = existing.mealService || {
          plan: null,
          status: "NEW",
          times: null,
          people: []
        }
        const people = [...(prev.people || []), person]
        data.mealService = { ...prev, people }
      } else {
        throw new GraphQLError("PassengerWaterFoodKind must be WATER or MEAL")
      }

      return prisma.passengerRequest.update({ where: { id: requestId }, data })
    },

    // добавить отель
    addPassengerRequestHotel: async (
      _parent,
      { requestId, hotel },
      { prisma }
    ) => {
      const existing = await prisma.passengerRequest.findUnique({
        where: { id: requestId }
      })
      if (!existing) throw new GraphQLError("PassengerRequest not found")

      const prev = existing.livingService || {
        plan: null,
        withTransfer: false,
        status: "NEW",
        times: null,
        hotels: [],
        drivers: []
      }

      const hotels = [...(prev.hotels || []), hotel]

      const data = {
        livingService: {
          ...prev,
          hotels
        }
      }

      return prisma.passengerRequest.update({ where: { id: requestId }, data })
    },

    // добавить водителя (для варианта проживание+трансфер)
    addPassengerRequestDriver: async (
      _parent,
      { requestId, driver },
      { prisma }
    ) => {
      const existing = await prisma.passengerRequest.findUnique({
        where: { id: requestId }
      })
      if (!existing) throw new GraphQLError("PassengerRequest not found")

      const prev = existing.livingService || {
        plan: null,
        withTransfer: true,
        status: "NEW",
        times: null,
        hotels: [],
        drivers: []
      }

      const drivers = [...(prev.drivers || []), driver]

      const data = {
        livingService: {
          ...prev,
          withTransfer: true,
          drivers
        }
      }

      return prisma.passengerRequest.update({ where: { id: requestId }, data })
    }
  }
}

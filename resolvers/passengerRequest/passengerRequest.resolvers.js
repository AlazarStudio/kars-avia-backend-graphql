import { prisma } from "../../prisma.js"
import { GraphQLError, subscribe } from "graphql"
import {
  resolveUserId,
  updateTimes
} from "../../services/passengerRequest/utils.js"
import { withFilter } from "graphql-subscriptions"
import {
  pubsub,
  PASSENGER_REQUEST_CREATED,
  PASSENGER_REQUEST_UPDATED
} from "../../services/infra/pubsub.js"

const passengerRequestResolvers = {
  // --------- поля связей ---------
  PassengerRequest: {
    airline: async (parent) =>
      prisma.airline.findUnique({ where: { id: parent.airlineId } }),

    airport: async (parent) =>
      parent.airportId
        ? prisma.airport.findUnique({ where: { id: parent.airportId } })
        : null,

    createdBy: async (parent) =>
      prisma.user.findUnique({ where: { id: parent.createdById } }),

    chats: async (parent) =>
      prisma.chat.findMany({ where: { passengerRequestId: parent.id } })
  },

  // --------- запросы ---------
  Query: {
    passengerRequests: async (_, args, context) => {
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

    passengerRequest: (_, { id }, context) =>
      prisma.passengerRequest.findUnique({ where: { id } })
  },

  // --------- мутации ---------
  Mutation: {
    // создание
    createPassengerRequest: async (_, { input }, context) => {
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
      const passengerRequest = await prisma.passengerRequest.create({ data })

      pubsub.publish(PASSENGER_REQUEST_CREATED, {
        passengerRequestCreated: passengerRequest
      })

      return passengerRequest
    },

    // обновление шапки + планов
    updatePassengerRequest: async (_, { id, input }, context) => {
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
      const passengerRequest = await prisma.passengerRequest.update({
        where: { id },
        data
      })

      pubsub.publish(PASSENGER_REQUEST_UPDATED, {
        passengerRequestUpdated: passengerRequest
      })

      return passengerRequest
    },

    deletePassengerRequest: async (_, { id }, context) => {
      await prisma.passengerRequest.delete({ where: { id } })
      return true
    },

    // общий статус заявки
    setPassengerRequestStatus: async (_, { id, status }, context) => {
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
      _,
      { id, service, status },
      context
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
      _,
      { requestId, service, person },
      context
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
    addPassengerRequestHotel: async (_, { requestId, hotel }, context) => {
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

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data
      })

      pubsub.publish(PASSENGER_REQUEST_UPDATED, {
        passengerRequestUpdated: passengerRequest
      })

      return passengerRequest
    },

    // добавить водителя (для варианта проживание+трансфер)
    addPassengerRequestDriver: async (_, { requestId, driver }, context) => {
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

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data
      })

      pubsub.publish(PASSENGER_REQUEST_UPDATED, {
        passengerRequestUpdated: passengerRequest
      })

      return passengerRequest
    }
  },

  Subscription: {
    passengerRequestCreated: {
      subscribe: withFilter(
        () => pubsub.asyncIterator([PASSENGER_REQUEST_CREATED]),
        (payload, variables, context) => {
          const { subject, subjectType } = context

          if (!subject || subjectType !== "USER") return false

          // SUPERADMIN и диспетчеры видят все
          if (subject.role === "SUPERADMIN" || subject.dispatcher === true) {
            return true
          }

          // Пользователи "представитель"
          // const agent = payload.agent
          // if (subject.agentId && agent.id === subject.agentId) {
          //   return true
          // }

          return false
        }
      )
    },
    passengerRequestUpdated: {
      subscribe: withFilter(
        () => pubsub.asyncIterator([PASSENGER_REQUEST_UPDATED]),
        (payload, variables, context) => {
          const { subject, subjectType } = context

          if (!subject || subjectType !== "USER") return false

          // SUPERADMIN и диспетчеры видят все
          if (subject.role === "SUPERADMIN" || subject.dispatcher === true) {
            return true
          }

          // Пользователи "представитель"
          // const agent = payload.agent
          // if (subject.agentId && agent.id === subject.agentId) {
          //   return true
          // }

          return false
        }
      )
    }
  }
}

export default passengerRequestResolvers

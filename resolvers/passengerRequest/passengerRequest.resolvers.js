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
import logAction from "../../services/infra/logaction.js"

const ensureAccommodationChesses = (person, hotelIndex, hotelName) => {
  const existing = Array.isArray(person?.accommodationChesses)
    ? person.accommodationChesses
    : []
  if (existing.length > 0) return existing
  return [
    {
      hotelIndex,
      hotelName: hotelName || null,
      startAt: new Date(),
      endAt: null,
      reason: null
    }
  ]
}

const ensureHotelPerson = (person, hotelIndex, hotelName) => ({
  ...person,
  roomCategory: person.roomCategory ?? null,
  roomKind: person.roomKind ?? null,
  accommodationChesses: ensureAccommodationChesses(person, hotelIndex, hotelName)
})

const makeRoomCategoryLabel = (roomCategory, roomKind) => {
  const category = roomCategory?.trim()
  const kind = roomKind?.trim()
  if (category && kind) return `${category} / ${kind}`
  return category || kind || ""
}

const logPassengerRequestAction = async ({
  context,
  action,
  description,
  reason = null,
  oldData = null,
  newData = null,
  airlineId = null
}) => {
  if (!context?.user?.id) return
  try {
    await logAction({
      context,
      action,
      reason,
      description,
      oldData,
      newData,
      airlineId
    })
  } catch (error) {
    console.error("Ошибка логирования действия ФАП:", error)
  }
}

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
      prisma.chat.findMany({ where: { passengerRequestId: parent.id } }),

    hotelReport: async (parent, { hotelIndex }) => {
      const report = await prisma.passengerRequestHotelReport.findUnique({
        where: {
          passengerRequestId_hotelIndex: {
            passengerRequestId: parent.id,
            hotelIndex
          }
        }
      })
      return report ?? null
    },

    hotelReports: async (parent) =>
      prisma.passengerRequestHotelReport.findMany({
        where: { passengerRequestId: parent.id },
        orderBy: { hotelIndex: "asc" }
      })
  },

  PassengerRequestHotelReport: {
    reportRows: (parent) => {
      const raw = parent.reportRows
      return Array.isArray(raw) ? raw : []
    }
  },

  PassengerServiceHotelPerson: {
    accommodationChesses: (parent) =>
      Array.isArray(parent.accommodationChesses)
        ? parent.accommodationChesses
        : []
  },

  PassengerLivingService: {
    evictions: (parent) =>
      Array.isArray(parent.evictions) ? parent.evictions : []
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
        transferService,
        baggageDeliveryService,
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
          status: "NEW",
          times: null,
          hotels: [],
          evictions: []
        }
      }

      if (transferService) {
        data.transferService = {
          plan: transferService.plan || null,
          status: "NEW",
          times: null,
          drivers: []
        }
      }

      if (baggageDeliveryService) {
        data.baggageDeliveryService = {
          plan: baggageDeliveryService.plan || null,
          status: "NEW",
          times: null,
          drivers: []
        }
      }
      const passengerRequest = await prisma.passengerRequest.create({ data })
      await logPassengerRequestAction({
        context,
        action: "create_passenger_request",
        description: `Пользователь ${context.user.name} создал ФАП ${passengerRequest.flightNumber}`,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId
      })

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
        transferService,
        baggageDeliveryService,
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
          ...(livingService.plan !== undefined && { plan: livingService.plan })
        }
      }

      if (transferService) {
        const prev = existing.transferService || {}
        data.transferService = {
          ...prev,
          ...(transferService.plan !== undefined && {
            plan: transferService.plan
          })
        }
      }

      if (baggageDeliveryService) {
        const prev = existing.baggageDeliveryService || {}
        data.baggageDeliveryService = {
          ...prev,
          ...(baggageDeliveryService.plan !== undefined && {
            plan: baggageDeliveryService.plan
          })
        }
      }
      const passengerRequest = await prisma.passengerRequest.update({
        where: { id },
        data
      })
      await logPassengerRequestAction({
        context,
        action: "update_passenger_request",
        description: `Пользователь ${context.user.name} обновил ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId
      })

      pubsub.publish(PASSENGER_REQUEST_UPDATED, {
        passengerRequestUpdated: passengerRequest
      })

      return passengerRequest
    },

    deletePassengerRequest: async (_, { id }, context) => {
      const passengerRequest = await prisma.passengerRequest.delete({
        where: { id }
      })
      await logPassengerRequestAction({
        context,
        action: "delete_passenger_request",
        description: `Пользователь ${context.user.name} удалил ФАП ${passengerRequest.flightNumber}`,
        oldData: passengerRequest,
        airlineId: passengerRequest.airlineId
      })

      pubsub.publish(PASSENGER_REQUEST_UPDATED, {
        passengerRequestUpdated: passengerRequest
      })

      return true
    },

    // общий статус заявки
    setPassengerRequestStatus: async (_, { id, status }, context) => {
      const existing = await prisma.passengerRequest.findUnique({
        where: { id }
      })
      if (!existing) throw new GraphQLError("PassengerRequest not found")

      const statusTimes = updateTimes(existing.statusTimes, status)

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id },
        data: {
          status,
          statusTimes
        }
      })
      await logPassengerRequestAction({
        context,
        action: "update_passenger_request_status",
        description: `Пользователь ${context.user.name} сменил статус ФАП ${passengerRequest.flightNumber} на ${status}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId
      })

      pubsub.publish(PASSENGER_REQUEST_UPDATED, {
        passengerRequestUpdated: passengerRequest
      })

      return passengerRequest
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
        const prev = existing.livingService || { hotels: [], evictions: [] }
        data.livingService = {
          ...prev,
          evictions: prev.evictions || [],
          status,
          times: updateTimes(prev.times, status)
        }
      } else if (service === "TRANSFER") {
        const prev = existing.transferService || { drivers: [] }
        data.transferService = {
          ...prev,
          status,
          times: updateTimes(prev.times, status)
        }
      } else if (service === "BAGGAGE_DELIVERY") {
        const prev = existing.baggageDeliveryService || { drivers: [] }
        data.baggageDeliveryService = {
          ...prev,
          status,
          times: updateTimes(prev.times, status)
        }
      }

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id },
        data
      })
      await logPassengerRequestAction({
        context,
        action: "update_passenger_request_service_status",
        description: `Пользователь ${context.user.name} сменил статус сервиса ${service} в ФАП ${passengerRequest.flightNumber} на ${status}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId
      })

      pubsub.publish(PASSENGER_REQUEST_UPDATED, {
        passengerRequestUpdated: passengerRequest
      })

      return passengerRequest
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
        let nextStatus = prev.status
        let nextTimes = prev.times
        if (nextStatus === "NEW" || nextStatus === "ACCEPTED") {
          nextStatus = "IN_PROGRESS"
          nextTimes = updateTimes(prev.times, "IN_PROGRESS")
        }
        const planCount = prev.plan?.peopleCount
        if (planCount != null && people.length >= planCount) {
          nextStatus = "COMPLETED"
          nextTimes = updateTimes(nextTimes, "COMPLETED")
        }
        data.waterService = { ...prev, people, status: nextStatus, times: nextTimes }
      } else if (service === "MEAL") {
        const prev = existing.mealService || {
          plan: null,
          status: "NEW",
          times: null,
          people: []
        }
        const people = [...(prev.people || []), person]
        let nextStatus = prev.status
        let nextTimes = prev.times
        if (nextStatus === "NEW" || nextStatus === "ACCEPTED") {
          nextStatus = "IN_PROGRESS"
          nextTimes = updateTimes(prev.times, "IN_PROGRESS")
        }
        const planCount = prev.plan?.peopleCount
        if (planCount != null && people.length >= planCount) {
          nextStatus = "COMPLETED"
          nextTimes = updateTimes(nextTimes, "COMPLETED")
        }
        data.mealService = { ...prev, people, status: nextStatus, times: nextTimes }
      } else {
        throw new GraphQLError("PassengerWaterFoodKind must be WATER or MEAL")
      }

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data
      })
      await logPassengerRequestAction({
        context,
        action: "add_passenger_request_person",
        description: `Пользователь ${context.user.name} добавил пассажира в сервис ${service} ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId
      })

      pubsub.publish(PASSENGER_REQUEST_UPDATED, {
        passengerRequestUpdated: passengerRequest
      })

      return passengerRequest
    },

    // добавить отель
    addPassengerRequestHotel: async (_, { requestId, hotel }, context) => {
      const existing = await prisma.passengerRequest.findUnique({
        where: { id: requestId }
      })
      if (!existing) throw new GraphQLError("PassengerRequest not found")

      const prev = existing.livingService || {
        plan: null,
        status: "NEW",
        times: null,
        hotels: [],
        evictions: []
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
      await logPassengerRequestAction({
        context,
        action: "add_passenger_request_hotel",
        description: `Пользователь ${context.user.name} добавил отель ${hotel.name} в ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId
      })

      pubsub.publish(PASSENGER_REQUEST_UPDATED, {
        passengerRequestUpdated: passengerRequest
      })

      return passengerRequest
    },

    addPassengerRequestHotelPerson: async (
      _,
      { requestId, hotelIndex, person },
      context
    ) => {
      const existing = await prisma.passengerRequest.findUnique({
        where: { id: requestId }
      })
      if (!existing) throw new GraphQLError("PassengerRequest not found")

      const living = existing.livingService || {
        plan: null,
        status: "NEW",
        times: null,
        hotels: [],
        evictions: []
      }
      const hotels = living.hotels || []
      if (hotelIndex < 0 || hotelIndex >= hotels.length) {
        throw new GraphQLError("Invalid hotelIndex")
      }

      const hotelsClone = hotels.map((h, i) =>
        i === hotelIndex
          ? {
              ...h,
              people: [
                ...(h.people || []).map((item) =>
                  ensureHotelPerson(item, i, h.name)
                ),
                ensureHotelPerson(person, i, h.name)
              ]
            }
          : {
              ...h,
              people: (h.people || []).map((item) =>
                ensureHotelPerson(item, i, h.name)
              )
            }
      )

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: {
          livingService: {
            ...living,
            hotels: hotelsClone
          }
        }
      })
      await logPassengerRequestAction({
        context,
        action: "add_passenger_request_hotel_person",
        description: `Пользователь ${context.user.name} добавил пассажира в отель ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId
      })

      pubsub.publish(PASSENGER_REQUEST_UPDATED, {
        passengerRequestUpdated: passengerRequest
      })

      return passengerRequest
    },

    updatePassengerRequestHotelPerson: async (
      _,
      { requestId, hotelIndex, personIndex, person },
      context
    ) => {
      const existing = await prisma.passengerRequest.findUnique({
        where: { id: requestId }
      })
      if (!existing) throw new GraphQLError("PassengerRequest not found")

      const living = existing.livingService || {
        plan: null,
        status: "NEW",
        times: null,
        hotels: [],
        evictions: []
      }
      const hotels = living.hotels || []
      if (hotelIndex < 0 || hotelIndex >= hotels.length) {
        throw new GraphQLError("Invalid hotelIndex")
      }
      const people = hotels[hotelIndex].people || []
      if (personIndex < 0 || personIndex >= people.length) {
        throw new GraphQLError("Invalid personIndex")
      }

      const hotelsClone = hotels.map((h, i) => {
        if (i !== hotelIndex) {
          return {
            ...h,
            people: (h.people || []).map((item) =>
              ensureHotelPerson(item, i, h.name)
            )
          }
        }
        const newPeople = [...(h.people || [])]
        const previousPerson = newPeople[personIndex]
        newPeople[personIndex] = {
          ...person,
          accommodationChesses: ensureAccommodationChesses(
            previousPerson,
            i,
            h.name
          )
        }
        return { ...h, people: newPeople }
      })

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: {
          livingService: {
            ...living,
            hotels: hotelsClone
          }
        }
      })
      await logPassengerRequestAction({
        context,
        action: "update_passenger_request_hotel_person",
        description: `Пользователь ${context.user.name} обновил данные пассажира в отеле ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId
      })

      pubsub.publish(PASSENGER_REQUEST_UPDATED, {
        passengerRequestUpdated: passengerRequest
      })

      return passengerRequest
    },

    removePassengerRequestHotelPerson: async (
      _,
      { requestId, hotelIndex, personIndex },
      context
    ) => {
      const existing = await prisma.passengerRequest.findUnique({
        where: { id: requestId }
      })
      if (!existing) throw new GraphQLError("PassengerRequest not found")

      const living = existing.livingService || {
        plan: null,
        status: "NEW",
        times: null,
        hotels: [],
        evictions: []
      }
      const hotels = living.hotels || []
      if (hotelIndex < 0 || hotelIndex >= hotels.length) {
        throw new GraphQLError("Invalid hotelIndex")
      }
      const people = hotels[hotelIndex].people || []
      if (personIndex < 0 || personIndex >= people.length) {
        throw new GraphQLError("Invalid personIndex")
      }

      const hotelsClone = hotels.map((h, i) => {
        if (i !== hotelIndex) {
          return {
            ...h,
            people: (h.people || []).map((item) =>
              ensureHotelPerson(item, i, h.name)
            )
          }
        }
        const newPeople = [...(h.people || [])]
        newPeople.splice(personIndex, 1)
        return {
          ...h,
          people: newPeople.map((item) => ensureHotelPerson(item, i, h.name))
        }
      })

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: {
          livingService: {
            ...living,
            hotels: hotelsClone
          }
        }
      })
      await logPassengerRequestAction({
        context,
        action: "remove_passenger_request_hotel_person",
        description: `Пользователь ${context.user.name} удалил пассажира из отеля ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId
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

      const prev = existing.transferService || {
        plan: null,
        status: "NEW",
        times: null,
        drivers: []
      }

      const drivers = [...(prev.drivers || []), driver]

      const data = {
        transferService: {
          ...prev,
          drivers
        }
      }

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data
      })
      await logPassengerRequestAction({
        context,
        action: "add_passenger_request_driver",
        description: `Пользователь ${context.user.name} добавил водителя в трансфер ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId
      })

      pubsub.publish(PASSENGER_REQUEST_UPDATED, {
        passengerRequestUpdated: passengerRequest
      })

      return passengerRequest
    },

    addPassengerRequestBaggageDriver: async (
      _,
      { requestId, driver },
      context
    ) => {
      const existing = await prisma.passengerRequest.findUnique({
        where: { id: requestId }
      })
      if (!existing) throw new GraphQLError("PassengerRequest not found")

      const prev = existing.baggageDeliveryService || {
        plan: null,
        status: "NEW",
        times: null,
        drivers: []
      }

      const drivers = [...(prev.drivers || []), driver]

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: {
          baggageDeliveryService: {
            ...prev,
            drivers
          }
        }
      })
      await logPassengerRequestAction({
        context,
        action: "add_passenger_request_baggage_driver",
        description: `Пользователь ${context.user.name} добавил водителя в доставку багажа ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId
      })

      pubsub.publish(PASSENGER_REQUEST_UPDATED, {
        passengerRequestUpdated: passengerRequest
      })

      return passengerRequest
    },

    completePassengerRequestEarly: async (_, { id, reason }, context) => {
      const existing = await prisma.passengerRequest.findUnique({
        where: { id }
      })
      if (!existing) throw new GraphQLError("PassengerRequest not found")
      if (!reason?.trim()) {
        throw new GraphQLError("Reason is required")
      }

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id },
        data: {
          status: "COMPLETED",
          statusTimes: updateTimes(existing.statusTimes, "COMPLETED"),
          earlyCompletionReason: reason.trim(),
          earlyCompletedAt: new Date()
        }
      })
      await logPassengerRequestAction({
        context,
        action: "complete_passenger_request_early",
        reason: reason.trim(),
        description: `Пользователь ${context.user.name} досрочно завершил ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId
      })

      pubsub.publish(PASSENGER_REQUEST_UPDATED, {
        passengerRequestUpdated: passengerRequest
      })

      return passengerRequest
    },

    relocatePassengerRequestHotelPerson: async (
      _,
      { requestId, fromHotelIndex, toHotelIndex, personIndex, reason, movedAt },
      context
    ) => {
      const existing = await prisma.passengerRequest.findUnique({
        where: { id: requestId }
      })
      if (!existing) throw new GraphQLError("PassengerRequest not found")
      if (!reason?.trim()) {
        throw new GraphQLError("Reason is required")
      }

      const living = existing.livingService || {
        plan: null,
        status: "NEW",
        times: null,
        hotels: [],
        evictions: []
      }
      const hotels = living.hotels || []
      if (fromHotelIndex < 0 || fromHotelIndex >= hotels.length) {
        throw new GraphQLError("Invalid fromHotelIndex")
      }
      if (toHotelIndex < 0 || toHotelIndex >= hotels.length) {
        throw new GraphQLError("Invalid toHotelIndex")
      }
      if (fromHotelIndex === toHotelIndex) {
        throw new GraphQLError("fromHotelIndex and toHotelIndex must be different")
      }

      const sourcePeople = hotels[fromHotelIndex].people || []
      if (personIndex < 0 || personIndex >= sourcePeople.length) {
        throw new GraphQLError("Invalid personIndex")
      }

      const relocationDate = movedAt ? new Date(movedAt) : new Date()
      const sourceHotel = hotels[fromHotelIndex]
      const targetHotel = hotels[toHotelIndex]
      const person = ensureHotelPerson(
        sourcePeople[personIndex],
        fromHotelIndex,
        sourceHotel?.name
      )

      const chesses = [...(person.accommodationChesses || [])]
      if (chesses.length === 0) {
        chesses.push({
          hotelIndex: fromHotelIndex,
          hotelName: sourceHotel?.name || null,
          startAt: relocationDate,
          endAt: null,
          reason: null
        })
      }

      const openIndex = [...chesses].reverse().findIndex((item) => !item?.endAt)
      if (openIndex !== -1) {
        const idx = chesses.length - 1 - openIndex
        chesses[idx] = {
          ...chesses[idx],
          endAt: relocationDate
        }
      }
      chesses.push({
        hotelIndex: toHotelIndex,
        hotelName: targetHotel?.name || null,
        startAt: relocationDate,
        endAt: null,
        reason: reason.trim()
      })

      const movedPerson = {
        ...person,
        accommodationChesses: chesses
      }

      const hotelsClone = hotels.map((hotel, index) => {
        const people = (hotel.people || []).map((item) =>
          ensureHotelPerson(item, index, hotel.name)
        )
        if (index === fromHotelIndex) {
          const next = [...people]
          next.splice(personIndex, 1)
          return { ...hotel, people: next }
        }
        if (index === toHotelIndex) {
          return { ...hotel, people: [...people, movedPerson] }
        }
        return { ...hotel, people }
      })

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: {
          livingService: {
            ...living,
            evictions: living.evictions || [],
            hotels: hotelsClone
          }
        }
      })
      await logPassengerRequestAction({
        context,
        action: "relocate_passenger_request_hotel_person",
        reason: reason.trim(),
        description: `Пользователь ${context.user.name} переселил пассажира в ФАП ${passengerRequest.flightNumber} из отеля #${fromHotelIndex} в отель #${toHotelIndex}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId
      })

      pubsub.publish(PASSENGER_REQUEST_UPDATED, {
        passengerRequestUpdated: passengerRequest
      })

      return passengerRequest
    },

    evictPassengerRequestHotelPerson: async (
      _,
      { requestId, hotelIndex, personIndex, reason, evictedAt },
      context
    ) => {
      const existing = await prisma.passengerRequest.findUnique({
        where: { id: requestId }
      })
      if (!existing) throw new GraphQLError("PassengerRequest not found")
      if (!reason?.trim()) {
        throw new GraphQLError("Reason is required")
      }

      const living = existing.livingService || {
        plan: null,
        status: "NEW",
        times: null,
        hotels: [],
        evictions: []
      }
      const hotels = living.hotels || []
      if (hotelIndex < 0 || hotelIndex >= hotels.length) {
        throw new GraphQLError("Invalid hotelIndex")
      }
      const people = hotels[hotelIndex].people || []
      if (personIndex < 0 || personIndex >= people.length) {
        throw new GraphQLError("Invalid personIndex")
      }

      const evictionDate = evictedAt ? new Date(evictedAt) : new Date()
      const hotel = hotels[hotelIndex]
      const person = ensureHotelPerson(people[personIndex], hotelIndex, hotel?.name)

      const chesses = [...(person.accommodationChesses || [])]
      const openIndex = [...chesses].reverse().findIndex((item) => !item?.endAt)
      if (openIndex !== -1) {
        const idx = chesses.length - 1 - openIndex
        chesses[idx] = {
          ...chesses[idx],
          endAt: evictionDate,
          reason: reason.trim()
        }
      } else {
        chesses.push({
          hotelIndex,
          hotelName: hotel?.name || null,
          startAt: evictionDate,
          endAt: evictionDate,
          reason: reason.trim()
        })
      }

      const hotelsClone = hotels.map((item, index) => {
        if (index !== hotelIndex) {
          return {
            ...item,
            people: (item.people || []).map((p) =>
              ensureHotelPerson(p, index, item.name)
            )
          }
        }
        const nextPeople = [...(item.people || [])]
        nextPeople.splice(personIndex, 1)
        return {
          ...item,
          people: nextPeople.map((p) => ensureHotelPerson(p, index, item.name))
        }
      })

      const evictions = [
        ...(living.evictions || []),
        {
          person: {
            ...person,
            accommodationChesses: chesses
          },
          hotelIndex,
          hotelName: hotel?.name || null,
          reason: reason.trim(),
          evictedAt: evictionDate
        }
      ]

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: {
          livingService: {
            ...living,
            hotels: hotelsClone,
            evictions
          }
        }
      })
      await logPassengerRequestAction({
        context,
        action: "evict_passenger_request_hotel_person",
        reason: reason.trim(),
        description: `Пользователь ${context.user.name} выселил пассажира из отеля #${hotelIndex} в ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId
      })

      pubsub.publish(PASSENGER_REQUEST_UPDATED, {
        passengerRequestUpdated: passengerRequest
      })

      return passengerRequest
    },

    savePassengerRequestHotelReport: async (
      _,
      { requestId, hotelIndex, reportRows },
      context
    ) => {
      const existing = await prisma.passengerRequest.findUnique({
        where: { id: requestId }
      })
      if (!existing) throw new GraphQLError("PassengerRequest not found")

      const rows = reportRows.map((row) => ({
        fullName: row.fullName ?? "",
        roomNumber: row.roomNumber ?? "",
        roomCategory: makeRoomCategoryLabel(row.roomCategory, row.roomKind),
        roomKind: row.roomKind ?? "",
        daysCount: row.daysCount ?? 0,
        breakfast: row.breakfast ?? 0,
        lunch: row.lunch ?? 0,
        dinner: row.dinner ?? 0,
        foodCost: row.foodCost ?? 0,
        accommodationCost: row.accommodationCost ?? 0
      }))

      const report = await prisma.passengerRequestHotelReport.upsert({
        where: {
          passengerRequestId_hotelIndex: {
            passengerRequestId: requestId,
            hotelIndex
          }
        },
        create: {
          passengerRequestId: requestId,
          hotelIndex,
          reportRows: rows
        },
        update: { reportRows: rows }
      })
      await logPassengerRequestAction({
        context,
        action: "save_passenger_request_hotel_report",
        description: `Пользователь ${context.user.name} сохранил отчет по отелю #${hotelIndex} для ФАП ${existing.flightNumber}`,
        newData: report,
        airlineId: existing.airlineId
      })

      return report
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

import { prisma } from "../../prisma.js"
import { GraphQLError, subscribe } from "graphql"
import {
  resolveUserId,
  updateTimes
} from "../../services/passengerRequest/utils.js"
import { ensurePassengerServiceHotelItemId } from "../../services/passengerRequest/hotelItem.js"
import {
  allMiddleware,
  representativeMiddleware
} from "../../middlewares/authMiddleware.js"
import { withFilter } from "graphql-subscriptions"
import {
  pubsub,
  PASSENGER_REQUEST_CREATED,
  PASSENGER_REQUEST_UPDATED
} from "../../services/infra/pubsub.js"
import logAction from "../../services/infra/logaction.js"
import {
  createMagicLinkTokenPair,
  EXTERNAL_MAGIC_LINK_TTL_MS,
  normalizeEmail
} from "../../services/auth/externalMagicLink.js"
import { buildExternalMagicLink } from "../../services/auth/sendExternalMagicLinkEmail.js"

const getSubjectName = (context) => {
  if (context.user?.name) return context.user.name
  if (context.externalUser?.name) return context.externalUser.name
  if (context.externalUser?.email) return `Внеш. пользователь (${context.externalUser.email})`
  if (context.subject?.name) return context.subject.name
  if (context.subject?.email) return context.subject.email
  return "Неизвестный пользователь"
}

const SUBJECT_TYPE_EXT = "EXTERNAL_USER"

async function generateHotelLinks({ hotel, requestId, adminId }) {
  if (!hotel.hotelId) return { linkCRM: null, linkPWA: null }

  const hotelRecord = await prisma.hotel.findUnique({
    where: { id: hotel.hotelId },
    select: { id: true, name: true }
  })
  if (!hotelRecord) return { linkCRM: null, linkPWA: null }

  const autoEmail = `hotel-${hotel.hotelId}@auto.internal`

  const externalUser = await prisma.externalUser.upsert({
    where: { email: autoEmail },
    create: {
      email: autoEmail,
      name: hotel.name || hotelRecord.name || null,
      scope: "HOTEL",
      accessType: "CRM",
      hotelId: hotel.hotelId,
      active: true
    },
    update: {
      name: hotel.name || hotelRecord.name || undefined,
      scope: "HOTEL",
      hotelId: hotel.hotelId,
      active: true
    }
  })

  const issueMagicLink = async (linkType) => {
    const { rawToken, tokenHash } = createMagicLinkTokenPair()
    const now = new Date()
    const url = buildExternalMagicLink({
      token: rawToken,
      kind: SUBJECT_TYPE_EXT,
      linkType,
      passengerRequestId: linkType === "PWA" ? requestId : undefined
    })
    await prisma.externalUserMagicLinkToken.create({
      data: {
        externalUserId: externalUser.id,
        tokenHash,
        rawToken,
        magicLinkUrl: url,
        expiresAt: new Date(now.getTime() + EXTERNAL_MAGIC_LINK_TTL_MS),
        createdByAdminId: adminId || undefined
      }
    })
    return url
  }

  const linkCRM = await issueMagicLink("CRM")
  const linkPWA = await issueMagicLink("PWA")

  return { linkCRM, linkPWA }
}

async function generateDriverLink({ driverName, requestId, driverIndex, adminId }) {
  const autoEmail = `driver-${requestId}-${driverIndex}@auto.internal`

  const externalUser = await prisma.externalUser.upsert({
    where: { email: autoEmail },
    create: {
      email: autoEmail,
      name: driverName || null,
      scope: "DRIVER",
      accessType: "CRM",
      active: true
    },
    update: {
      name: driverName || undefined,
      active: true
    }
  })

  const { rawToken, tokenHash } = createMagicLinkTokenPair()
  const now = new Date()
  const url = buildExternalMagicLink({
    token: rawToken,
    kind: SUBJECT_TYPE_EXT,
    linkType: "PWA",
    passengerRequestId: requestId,
    driverIndex
  })
  await prisma.externalUserMagicLinkToken.create({
    data: {
      externalUserId: externalUser.id,
      tokenHash,
      rawToken,
      magicLinkUrl: url,
      expiresAt: new Date(now.getTime() + EXTERNAL_MAGIC_LINK_TTL_MS),
      createdByAdminId: adminId || undefined
    }
  })

  return url
}

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
  arrival: person.arrival ?? null,
  departure: person.departure ?? null,
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

const normalizeOptionalString = (value) => {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed || null
}

const ensureDriverPerson = (p) => ({
  fullName: (p?.fullName?.trim?.() ?? "") || "",
  phone: normalizeOptionalString(p?.phone)
})

const normalizePassengerServiceDriver = (driver = {}) => ({
  ...driver,
  fullName: driver?.fullName?.trim?.() || "",
  phone: normalizeOptionalString(driver?.phone),
  link: normalizeOptionalString(driver?.link),
  addressFrom: normalizeOptionalString(driver?.addressFrom),
  addressTo: normalizeOptionalString(driver?.addressTo),
  description: normalizeOptionalString(driver?.description),
  people: Array.isArray(driver?.people) ? driver.people.map(ensureDriverPerson) : []
})

const logPassengerRequestAction = async ({
  context,
  action,
  description,
  fulldescription = null,
  reason = null,
  oldData = null,
  newData = null,
  airlineId = null,
  passengerRequestId = null
}) => {
  try {
    await logAction({
      context,
      action,
      reason,
      description,
      fulldescription,
      oldData,
      newData,
      airlineId,
      passengerRequestId
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
      }),

    logs: async (parent, { pagination }) => {
      const { skip, take } = pagination || {}
      const totalCount = await prisma.log.count({
        where: { passengerRequestId: parent.id }
      })
      const logs = await prisma.log.findMany({
        where: { passengerRequestId: parent.id },
        include: { user: true },
        skip,
        take,
        orderBy: { createdAt: "desc" }
      })
      const totalPages = take ? Math.ceil(totalCount / take) : 0
      return { totalCount, totalPages, logs }
    }
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

  PassengerServiceDriver: {
    people: (parent) =>
      Array.isArray(parent.people) ? parent.people : []
  },

  PassengerLivingService: {
    evictions: (parent) =>
      Array.isArray(parent.evictions) ? parent.evictions : []
  },

  // --------- запросы ---------
  Query: {
    passengerRequests: async (_, args, context) => {
      // await allMiddleware(context) // временно отключено для ФАП (PWA magic link) // MIDDLEWARE_REVIEW: allMiddleware
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

    passengerRequest: async (_, { id }, context) => {
      // await allMiddleware(context) // временно отключено для ФАП (PWA magic link) // MIDDLEWARE_REVIEW: allMiddleware
      return prisma.passengerRequest.findUnique({ where: { id } })
    }
  },

  // --------- мутации ---------
  Mutation: {
    // создание
    createPassengerRequest: async (_, { input }, context) => {
      // await allMiddleware(context) // временно отключено для ФАП (PWA magic link) // MIDDLEWARE_REVIEW: allMiddleware
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
          earlyCompletionReason: null,
          earlyCompletedAt: null,
          people: []
        }
      }

      if (mealService) {
        data.mealService = {
          plan: mealService.plan || null,
          status: "NEW",
          times: null,
          earlyCompletionReason: null,
          earlyCompletedAt: null,
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
        description: "ФАП создан",
        fulldescription: `Пользователь ${getSubjectName(context)} создал ФАП ${passengerRequest.flightNumber}`,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
      })

      pubsub.publish(PASSENGER_REQUEST_CREATED, {
        passengerRequestCreated: passengerRequest
      })

      return passengerRequest
    },

    // обновление шапки + планов
    updatePassengerRequest: async (_, { id, input }, context) => {
      // await allMiddleware(context) // временно отключено для ФАП (PWA magic link) // MIDDLEWARE_REVIEW: allMiddleware
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
        description: "ФАП обновлен",
        fulldescription: `Пользователь ${getSubjectName(context)} обновил ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
      })

      pubsub.publish(PASSENGER_REQUEST_UPDATED, {
        passengerRequestUpdated: passengerRequest
      })

      return passengerRequest
    },

    deletePassengerRequest: async (_, { id }, context) => {
      // await allMiddleware(context) // временно отключено для ФАП (PWA magic link) // MIDDLEWARE_REVIEW: allMiddleware
      const passengerRequest = await prisma.passengerRequest.delete({
        where: { id }
      })
      await logPassengerRequestAction({
        context,
        action: "delete_passenger_request",
        description: "ФАП удален",
        fulldescription: `Пользователь ${getSubjectName(context)} удалил ФАП ${passengerRequest.flightNumber}`,
        oldData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
      })

      pubsub.publish(PASSENGER_REQUEST_UPDATED, {
        passengerRequestUpdated: passengerRequest
      })

      return true
    },

    // общий статус заявки
    setPassengerRequestStatus: async (_, { id, status }, context) => {
      // await allMiddleware(context) // временно отключено для ФАП (PWA magic link) // MIDDLEWARE_REVIEW: allMiddleware
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
        description: "Статус ФАП обновлен",
        fulldescription: `Пользователь ${getSubjectName(context)} сменил статус ФАП ${passengerRequest.flightNumber} на ${status}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
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
      // await allMiddleware(context) // временно отключено для ФАП (PWA magic link) // MIDDLEWARE_REVIEW: allMiddleware
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
        description: `Статус сервиса обновлен: ${service}`,
        fulldescription: `Пользователь ${context?.user?.name ?? "Пользователь"} сменил статус сервиса ${service} в ФАП ${passengerRequest.flightNumber} на ${status}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
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
      // await allMiddleware(context) // временно отключено для ФАП (PWA magic link) // MIDDLEWARE_REVIEW: allMiddleware
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
          earlyCompletionReason: null,
          earlyCompletedAt: null,
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
          earlyCompletionReason: null,
          earlyCompletedAt: null,
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
        description: `Пассажир добавлен в сервис: ${service}`,
        fulldescription: `Пользователь ${getSubjectName(context)} добавил пассажира в сервис ${service} ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
      })

      pubsub.publish(PASSENGER_REQUEST_UPDATED, {
        passengerRequestUpdated: passengerRequest
      })

      return passengerRequest
    },

    // добавить отель
    addPassengerRequestHotel: async (_, { requestId, hotel }, context) => {
      // await allMiddleware(context) // временно отключено для ФАП (PWA magic link) // MIDDLEWARE_REVIEW: allMiddleware
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

      const hotelWithItemId = ensurePassengerServiceHotelItemId(hotel)

      const adminId = context.subjectType === "USER" ? context.subject?.id : null
      try {
        const links = await generateHotelLinks({
          hotel: hotelWithItemId,
          requestId,
          adminId
        })
        hotelWithItemId.linkCRM = links.linkCRM
        hotelWithItemId.linkPWA = links.linkPWA
      } catch (e) {
        hotelWithItemId.linkCRM = null
        hotelWithItemId.linkPWA = null
      }

      const hotels = [...(prev.hotels || []), hotelWithItemId]
      const isFirstHotel = (prev.hotels || []).length === 0
      const nextStatus = isFirstHotel ? "ACCEPTED" : prev.status
      const nextTimes = isFirstHotel ? updateTimes(prev.times, "ACCEPTED") : prev.times

      const data = {
        livingService: {
          ...prev,
          hotels,
          status: nextStatus,
          times: nextTimes
        }
      }

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data
      })
      await logPassengerRequestAction({
        context,
        action: "add_passenger_request_hotel",
        description: `Отель добавлен в ФАП: ${hotelWithItemId.name}`,
        fulldescription: `Пользователь ${getSubjectName(context)} добавил отель ${hotelWithItemId.name} в ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
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
      // await representativeMiddleware(context) // временно отключено для ФАП (magic link)
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
      if (
        context.subjectType === "EXTERNAL_USER" &&
        context.subject?.scope === "HOTEL" &&
        context.subject?.hotelId
      ) {
        const targetHotel = hotels[hotelIndex]
        if (!targetHotel || targetHotel.hotelId !== context.subject.hotelId) {
          throw new GraphQLError(
            "Access forbidden: you can only add bookings to your hotel.",
            { extensions: { code: "FORBIDDEN" } }
          )
        }
      }

      const hotelsClone = hotels.map((h, i) => {
        const name = h?.name ?? ""
        return i === hotelIndex
          ? {
              ...h,
              people: [
                ...((h && h.people) || []).map((item) =>
                  ensureHotelPerson(item, i, name)
                ),
                ensureHotelPerson(person, i, name)
              ]
            }
          : {
              ...h,
              people: ((h && h.people) || []).map((item) =>
                ensureHotelPerson(item, i, name)
              )
            }
      })

      const totalPeopleBefore = (living.hotels || []).reduce(
        (sum, h) => sum + (Array.isArray(h.people) ? h.people.length : 0),
        0
      )
      const totalPeopleAfter = (hotelsClone || []).reduce(
        (sum, h) => sum + (Array.isArray(h.people) ? h.people.length : 0),
        0
      )
      const planCount = living.plan?.peopleCount ?? null
      let nextStatus = living.status
      let nextTimes = living.times || {}
      if (totalPeopleBefore === 0 && totalPeopleAfter >= 1) {
        nextStatus = "IN_PROGRESS"
        nextTimes = updateTimes(nextTimes, "IN_PROGRESS")
      }
      if (planCount != null && totalPeopleAfter >= planCount) {
        nextStatus = "COMPLETED"
        nextTimes = updateTimes(nextTimes, "COMPLETED")
      }

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: {
          livingService: {
            ...living,
            hotels: hotelsClone,
            status: nextStatus,
            times: nextTimes
          }
        }
      })
      await logPassengerRequestAction({
        context,
        action: "add_passenger_request_hotel_person",
        description: "Пассажир добавлен в отель ФАП",
        fulldescription: `Пользователь ${getSubjectName(context)} добавил пассажира в отель ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
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
      // await allMiddleware(context) // временно отключено для ФАП (PWA magic link) // MIDDLEWARE_REVIEW: allMiddleware
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
        description: "Данные пассажира в отеле ФАП обновлены",
        fulldescription: `Пользователь ${getSubjectName(context)} обновил данные пассажира в отеле ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
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
      // await allMiddleware(context) // временно отключено для ФАП (PWA magic link) // MIDDLEWARE_REVIEW: allMiddleware
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
        description: "Пассажир удален из отеля ФАП",
        fulldescription: `Пользователь ${getSubjectName(context)} удалил пассажира из отеля ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
      })

      pubsub.publish(PASSENGER_REQUEST_UPDATED, {
        passengerRequestUpdated: passengerRequest
      })

      return passengerRequest
    },

    // добавить водителя (для варианта проживание+трансфер)
    addPassengerRequestDriver: async (_, { requestId, driver }, context) => {
      // await allMiddleware(context) // временно отключено для ФАП (PWA magic link) // MIDDLEWARE_REVIEW: allMiddleware
      const existing = await prisma.passengerRequest.findUnique({
        where: { id: requestId }
      })
      if (!existing) throw new GraphQLError("PassengerRequest not found")
      if (!driver?.fullName?.trim()) {
        throw new GraphQLError("Driver fullName is required")
      }

      const prev = existing.transferService || {
        plan: null,
        status: "NEW",
        times: null,
        drivers: []
      }

      const normalizedDriver = normalizePassengerServiceDriver(driver)
      const driverIndex = (prev.drivers || []).length
      const adminId = context.subjectType === "USER" ? context.subject?.id : null
      try {
        const linkPWA = await generateDriverLink({
          driverName: normalizedDriver.fullName,
          requestId,
          driverIndex,
          adminId
        })
        normalizedDriver.linkPWA = linkPWA
      } catch (e) {
        normalizedDriver.linkPWA = null
      }

      const drivers = [...(prev.drivers || []), normalizedDriver]
      const isFirstDriver = driverIndex === 0
      const nextStatus = isFirstDriver ? "ACCEPTED" : prev.status
      const nextTimes = isFirstDriver ? updateTimes(prev.times, "ACCEPTED") : prev.times

      const data = {
        transferService: {
          ...prev,
          drivers,
          status: nextStatus,
          times: nextTimes
        }
      }

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data
      })
      await logPassengerRequestAction({
        context,
        action: "add_passenger_request_driver",
        description: "Водитель добавлен в трансфер ФАП",
        fulldescription: `Пользователь ${getSubjectName(context)} добавил водителя в трансфер ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
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
      // await allMiddleware(context) // временно отключено для ФАП (PWA magic link) // MIDDLEWARE_REVIEW: allMiddleware
      const existing = await prisma.passengerRequest.findUnique({
        where: { id: requestId }
      })
      if (!existing) throw new GraphQLError("PassengerRequest not found")
      if (!driver?.fullName?.trim()) {
        throw new GraphQLError("Driver fullName is required")
      }

      const prev = existing.baggageDeliveryService || {
        plan: null,
        status: "NEW",
        times: null,
        drivers: []
      }

      const normalizedDriver = normalizePassengerServiceDriver(driver)
      const driverIndex = (prev.drivers || []).length
      const adminId = context.subjectType === "USER" ? context.subject?.id : null
      try {
        const linkPWA = await generateDriverLink({
          driverName: normalizedDriver.fullName,
          requestId,
          driverIndex,
          adminId
        })
        normalizedDriver.linkPWA = linkPWA
      } catch (e) {
        normalizedDriver.linkPWA = null
      }

      const drivers = [...(prev.drivers || []), normalizedDriver]

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
        description: "Водитель добавлен в доставку багажа ФАП",
        fulldescription: `Пользователь ${getSubjectName(context)} добавил водителя в доставку багажа ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
      })

      pubsub.publish(PASSENGER_REQUEST_UPDATED, {
        passengerRequestUpdated: passengerRequest
      })

      return passengerRequest
    },

    completePassengerRequestBaggageDriverDelivery: async (
      _,
      { requestId, driverIndex },
      context
    ) => {
      // await allMiddleware(context) // временно отключено для ФАП (PWA magic link)
      const existing = await prisma.passengerRequest.findUnique({
        where: { id: requestId }
      })
      if (!existing) throw new GraphQLError("PassengerRequest not found")

      const bds = existing.baggageDeliveryService
      const drivers = bds?.drivers ?? []
      if (driverIndex < 0 || driverIndex >= drivers.length) {
        throw new GraphQLError("Driver index out of range")
      }

      const now = new Date()
      const updatedDrivers = drivers.map((d, i) =>
        i === driverIndex ? { ...d, deliveryCompletedAt: now } : d
      )

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: {
          baggageDeliveryService: {
            ...bds,
            drivers: updatedDrivers
          }
        }
      })

      const driver = drivers[driverIndex]
      await logPassengerRequestAction({
        context,
        action: "complete_passenger_request_baggage_driver_delivery",
        description: "Отмечена выполненная доставка багажа водителем ФАП",
        fulldescription: `Пользователь ${getSubjectName(context)} отметил доставку багажа выполненной для водителя ${driver?.fullName ?? driverIndex} (ФАП ${passengerRequest.flightNumber})`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
      })

      pubsub.publish(PASSENGER_REQUEST_UPDATED, {
        passengerRequestUpdated: passengerRequest
      })

      return passengerRequest
    },

    addPassengerRequestDriverPerson: async (
      _,
      { requestId, driverIndex, person },
      context
    ) => {
      // await allMiddleware(context) // временно отключено для ФАП (PWA magic link)
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
      const drivers = prev.drivers || []
      if (driverIndex < 0 || driverIndex >= drivers.length) {
        throw new GraphQLError("Invalid driverIndex")
      }

      const driversClone = drivers.map((d, i) => {
        const normalized = normalizePassengerServiceDriver(d)
        if (i !== driverIndex) return normalized
        return {
          ...normalized,
          people: [...(normalized.people || []), ensureDriverPerson(person)]
        }
      })

      const totalPeopleBefore = (drivers || []).reduce(
        (sum, d) => sum + (Array.isArray(d.people) ? d.people.length : 0),
        0
      )
      const totalPeopleAfter = (driversClone || []).reduce(
        (sum, d) => sum + (Array.isArray(d.people) ? d.people.length : 0),
        0
      )
      const planCount = prev.plan?.peopleCount ?? null
      let nextStatus = prev.status
      let nextTimes = prev.times || {}
      if (totalPeopleBefore === 0 && totalPeopleAfter >= 1) {
        nextStatus = "IN_PROGRESS"
        nextTimes = updateTimes(nextTimes, "IN_PROGRESS")
      }
      if (planCount != null && totalPeopleAfter >= planCount) {
        nextStatus = "COMPLETED"
        nextTimes = updateTimes(nextTimes, "COMPLETED")
      }

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: {
          transferService: {
            ...prev,
            drivers: driversClone,
            status: nextStatus,
            times: nextTimes
          }
        }
      })
      await logPassengerRequestAction({
        context,
        action: "add_passenger_request_driver_person",
        description: "Пассажир добавлен к водителю трансфера ФАП",
        fulldescription: `Пользователь ${getSubjectName(context)} добавил пассажира к водителю #${driverIndex} в ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
      })

      pubsub.publish(PASSENGER_REQUEST_UPDATED, {
        passengerRequestUpdated: passengerRequest
      })

      return passengerRequest
    },

    updatePassengerRequestDriverPerson: async (
      _,
      { requestId, driverIndex, personIndex, person },
      context
    ) => {
      // await allMiddleware(context) // временно отключено для ФАП (PWA magic link)
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
      const drivers = prev.drivers || []
      if (driverIndex < 0 || driverIndex >= drivers.length) {
        throw new GraphQLError("Invalid driverIndex")
      }
      const people = drivers[driverIndex].people || []
      if (personIndex < 0 || personIndex >= people.length) {
        throw new GraphQLError("Invalid personIndex")
      }

      const driversClone = drivers.map((d, i) => {
        const normalized = normalizePassengerServiceDriver(d)
        if (i !== driverIndex) return normalized
        const newPeople = [...(normalized.people || [])]
        newPeople[personIndex] = ensureDriverPerson(person)
        return { ...normalized, people: newPeople }
      })

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: {
          transferService: { ...prev, drivers: driversClone }
        }
      })
      await logPassengerRequestAction({
        context,
        action: "update_passenger_request_driver_person",
        description: "Данные пассажира у водителя трансфера ФАП обновлены",
        fulldescription: `Пользователь ${getSubjectName(context)} обновил данные пассажира #${personIndex} у водителя #${driverIndex} в ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
      })

      pubsub.publish(PASSENGER_REQUEST_UPDATED, {
        passengerRequestUpdated: passengerRequest
      })

      return passengerRequest
    },

    removePassengerRequestDriverPerson: async (
      _,
      { requestId, driverIndex, personIndex },
      context
    ) => {
      // await allMiddleware(context) // временно отключено для ФАП (PWA magic link)
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
      const drivers = prev.drivers || []
      if (driverIndex < 0 || driverIndex >= drivers.length) {
        throw new GraphQLError("Invalid driverIndex")
      }
      const people = drivers[driverIndex].people || []
      if (personIndex < 0 || personIndex >= people.length) {
        throw new GraphQLError("Invalid personIndex")
      }

      const driversClone = drivers.map((d, i) => {
        const normalized = normalizePassengerServiceDriver(d)
        if (i !== driverIndex) return normalized
        const newPeople = [...(normalized.people || [])]
        newPeople.splice(personIndex, 1)
        return { ...normalized, people: newPeople }
      })

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: {
          transferService: { ...prev, drivers: driversClone }
        }
      })
      await logPassengerRequestAction({
        context,
        action: "remove_passenger_request_driver_person",
        description: "Пассажир удален у водителя трансфера ФАП",
        fulldescription: `Пользователь ${getSubjectName(context)} удалил пассажира #${personIndex} у водителя #${driverIndex} в ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
      })

      pubsub.publish(PASSENGER_REQUEST_UPDATED, {
        passengerRequestUpdated: passengerRequest
      })

      return passengerRequest
    },

    completePassengerRequestWaterEarly: async (
      _,
      { requestId, reason },
      context
    ) => {
      // await allMiddleware(context) // временно отключено для ФАП (PWA magic link) // MIDDLEWARE_REVIEW: allMiddleware
      const existing = await prisma.passengerRequest.findUnique({
        where: { id: requestId }
      })
      if (!existing) throw new GraphQLError("PassengerRequest not found")
      if (!reason?.trim()) {
        throw new GraphQLError("Reason is required")
      }

      const prev = existing.waterService || {
        plan: null,
        status: "NEW",
        times: null,
        earlyCompletionReason: null,
        earlyCompletedAt: null,
        people: []
      }

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: {
          waterService: {
            ...prev,
            status: "COMPLETED",
            times: updateTimes(prev.times, "COMPLETED"),
            earlyCompletionReason: reason.trim(),
            earlyCompletedAt: new Date()
          }
        }
      })
      await logPassengerRequestAction({
        context,
        action: "complete_passenger_request_water_early",
        reason: reason.trim(),
        description: "Досрочно завершен сервис воды ФАП",
        fulldescription: `Пользователь ${getSubjectName(context)} досрочно завершил сервис воды ФАП ${passengerRequest.flightNumber}`,
        passengerRequestId: passengerRequest.id,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId
      })

      pubsub.publish(PASSENGER_REQUEST_UPDATED, {
        passengerRequestUpdated: passengerRequest
      })

      return passengerRequest
    },

    completePassengerRequestMealEarly: async (
      _,
      { requestId, reason },
      context
    ) => {
      // await allMiddleware(context) // временно отключено для ФАП (PWA magic link) // MIDDLEWARE_REVIEW: allMiddleware
      const existing = await prisma.passengerRequest.findUnique({
        where: { id: requestId }
      })
      if (!existing) throw new GraphQLError("PassengerRequest not found")
      if (!reason?.trim()) {
        throw new GraphQLError("Reason is required")
      }

      const prev = existing.mealService || {
        plan: null,
        status: "NEW",
        times: null,
        earlyCompletionReason: null,
        earlyCompletedAt: null,
        people: []
      }

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: {
          mealService: {
            ...prev,
            status: "COMPLETED",
            times: updateTimes(prev.times, "COMPLETED"),
            earlyCompletionReason: reason.trim(),
            earlyCompletedAt: new Date()
          }
        }
      })
      await logPassengerRequestAction({
        context,
        action: "complete_passenger_request_meal_early",
        reason: reason.trim(),
        description: "Досрочно завершен сервис питания ФАП",
        fulldescription: `Пользователь ${getSubjectName(context)} досрочно завершил сервис питания ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
      })

      pubsub.publish(PASSENGER_REQUEST_UPDATED, {
        passengerRequestUpdated: passengerRequest
      })

      return passengerRequest
    },

    completePassengerRequestBaggageEarly: async (
      _,
      { requestId, reason },
      context
    ) => {
      // await allMiddleware(context) // временно отключено для ФАП (PWA magic link) // MIDDLEWARE_REVIEW: allMiddleware
      const existing = await prisma.passengerRequest.findUnique({
        where: { id: requestId }
      })
      if (!existing) throw new GraphQLError("PassengerRequest not found")
      if (!reason?.trim()) {
        throw new GraphQLError("Reason is required")
      }

      const prev = existing.baggageDeliveryService || {
        plan: null,
        status: "NEW",
        times: null,
        drivers: []
      }

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: {
          baggageDeliveryService: {
            ...prev,
            status: "COMPLETED",
            times: updateTimes(prev.times, "COMPLETED")
          }
        }
      })

      await logPassengerRequestAction({
        context,
        action: "complete_passenger_request_baggage_early",
        reason: reason.trim(),
        description: "Досрочно завершена услуга «Доставка багажа» ФАП",
        fulldescription: `Пользователь ${getSubjectName(context)} досрочно завершил услугу «Доставка багажа» ФАП ${passengerRequest.flightNumber}. Причина: ${reason.trim()}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
      })

      pubsub.publish(PASSENGER_REQUEST_UPDATED, {
        passengerRequestUpdated: passengerRequest
      })

      return passengerRequest
    },

    completePassengerRequestTransferEarly: async (
      _,
      { requestId, reason },
      context
    ) => {
      // await allMiddleware(context) // временно отключено для ФАП (PWA magic link) // MIDDLEWARE_REVIEW: allMiddleware
      const existing = await prisma.passengerRequest.findUnique({
        where: { id: requestId }
      })
      if (!existing) throw new GraphQLError("PassengerRequest not found")
      if (!reason?.trim()) {
        throw new GraphQLError("Reason is required")
      }

      const prev = existing.transferService || {
        plan: null,
        status: "NEW",
        times: null,
        drivers: []
      }

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: {
          transferService: {
            ...prev,
            status: "COMPLETED",
            times: updateTimes(prev.times, "COMPLETED"),
            earlyCompletionReason: reason.trim(),
            earlyCompletedAt: new Date()
          }
        }
      })
      await logPassengerRequestAction({
        context,
        action: "complete_passenger_request_transfer_early",
        reason: reason.trim(),
        description: "Досрочно завершена услуга «Трансфер» ФАП",
        fulldescription: `Пользователь ${getSubjectName(context)} досрочно завершил услугу «Трансфер» ФАП ${passengerRequest.flightNumber}. Причина: ${reason.trim()}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
      })

      pubsub.publish(PASSENGER_REQUEST_UPDATED, {
        passengerRequestUpdated: passengerRequest
      })

      return passengerRequest
    },

    completePassengerRequestLivingEarly: async (
      _,
      { requestId, reason },
      context
    ) => {
      // await allMiddleware(context) // временно отключено для ФАП (PWA magic link) // MIDDLEWARE_REVIEW: allMiddleware
      const existing = await prisma.passengerRequest.findUnique({
        where: { id: requestId }
      })
      if (!existing) throw new GraphQLError("PassengerRequest not found")
      if (!reason?.trim()) {
        throw new GraphQLError("Reason is required")
      }

      const prev = existing.livingService || {
        plan: null,
        status: "NEW",
        times: null,
        hotels: [],
        evictions: []
      }

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: {
          livingService: {
            ...prev,
            status: "COMPLETED",
            times: updateTimes(prev.times, "COMPLETED"),
            earlyCompletionReason: reason.trim(),
            earlyCompletedAt: new Date()
          }
        }
      })
      await logPassengerRequestAction({
        context,
        action: "complete_passenger_request_living_early",
        reason: reason.trim(),
        description: "Досрочно завершена услуга «Проживание» ФАП",
        fulldescription: `Пользователь ${getSubjectName(context)} досрочно завершил услугу «Проживание» ФАП ${passengerRequest.flightNumber}. Причина: ${reason.trim()}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
      })

      pubsub.publish(PASSENGER_REQUEST_UPDATED, {
        passengerRequestUpdated: passengerRequest
      })

      return passengerRequest
    },

    completePassengerRequestEarly: async (_, { id, reason }, context) => {
      // await allMiddleware(context) // временно отключено для ФАП (PWA magic link) // MIDDLEWARE_REVIEW: allMiddleware
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
        description: "ФАП завершен досрочно",
        fulldescription: `Пользователь ${getSubjectName(context)} досрочно завершил ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
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
      // await allMiddleware(context) // временно отключено для ФАП (PWA magic link) // MIDDLEWARE_REVIEW: allMiddleware
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
        description: "Пассажир переселен между отелями ФАП",
        fulldescription: `Пользователь ${getSubjectName(context)} переселил пассажира в ФАП ${passengerRequest.flightNumber} из отеля #${fromHotelIndex} в отель #${toHotelIndex}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
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
      // await allMiddleware(context) // временно отключено для ФАП (PWA magic link) // MIDDLEWARE_REVIEW: allMiddleware
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
        description: "Пассажир выселен из отеля ФАП",
        fulldescription: `Пользователь ${getSubjectName(context)} выселил пассажира из отеля #${hotelIndex} в ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
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
      // await allMiddleware(context) // временно отключено для ФАП (PWA magic link) // MIDDLEWARE_REVIEW: allMiddleware
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
        description: "Отчет по отелю ФАП сохранен",
        fulldescription: `Пользователь ${getSubjectName(context)} сохранил отчет по отелю #${hotelIndex} для ФАП ${existing.flightNumber}`,
        newData: report,
        airlineId: existing.airlineId,
        passengerRequestId: requestId
      })

      return report
    }
  },

  Subscription: {
    passengerRequestCreated: {
      subscribe: withFilter(
        () => pubsub.asyncIterator([PASSENGER_REQUEST_CREATED]),
        (payload, variables, context) => {
          // const { subject, subjectType } = context
          // if (!subject || subjectType !== "USER") return false
          // return representativeMiddleware(context).then(() => true).catch(() => false)
          return true // временно отключена проверка для ФАП
        }
      )
    },
    
    passengerRequestUpdated: {
      subscribe: withFilter(
        () => pubsub.asyncIterator([PASSENGER_REQUEST_UPDATED]),
        (payload, variables, context) => {
          // const { subject, subjectType } = context
          // if (!subject || subjectType !== "USER") return false
          // return representativeMiddleware(context).then(() => true).catch(() => false)
          return true // временно отключена проверка для ФАП
        }
      )
    }
  }
}

export default passengerRequestResolvers

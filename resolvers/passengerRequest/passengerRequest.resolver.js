import { prisma } from "../../prisma.js"
import { GraphQLError } from "graphql"
import {
  resolveUserId,
  updateTimes
} from "../../services/passengerRequest/utils.js"
import { ensurePassengerServiceHotelItemId } from "../../services/passengerRequest/hotelItem.js"
import {
  dedupeSavedPassengers,
  ensurePersonId,
  mergeManifestPeopleIntoRoster,
  normalizeSavedPerson,
  removeSavedPersonFromRoster,
  snapshotFromDriverPerson,
  snapshotFromHotelPerson,
  snapshotFromServicePerson,
  updateSavedPersonInRoster,
  upsertSavedPassenger,
  patchSavedPersonIdentity
} from "../../services/passengerRequest/savedPassengers.js"
import { hydratePassengerRequest } from "../../services/passengerRequest/hydratePassengerRequest.js"
import { recognizePassengerDocument as recognizeDocumentService } from "../../services/docRecognition/recognizePassengerDocument.js"
import { recomputeServiceStatus } from "../../services/passengerRequest/serviceStatus.js"
import {
  deleteAllPassengerRequestFilesFromDisk,
  deletePassengerRequestFileFromDisk,
  findPassengerRequestFileIndex,
  uploadPassengerRequestFiles
} from "../../services/passengerRequest/files.js"
import {
  allMiddleware,
  representativeMiddleware
} from "../../middlewares/authMiddleware.js"
import { withFilter } from "graphql-subscriptions"
import {
  pubsub,
  PASSENGER_REQUEST_CREATED,
  PASSENGER_REQUEST_UPDATED,
  NOTIFICATION
} from "../../services/infra/pubsub.js"
import { shouldSendNotification } from "../../services/notification/notificationRateGuard.js"
import { sendRequestPartyEmail } from "../../services/notification/sendRequestPartyEmail.js"
import { buildPassengerRequestEmail } from "../../services/notification/buildPassengerRequestEmail.js"
import {
  getDispatcherFallbackForPassengerEmail,
  resolveEmailActionForLog
} from "../../services/notification/passengerRequestEmailActions.js"
import { formatDate } from "../../services/format/dateTimeFormater.js"
import logAction from "../../services/infra/logaction.js"
import {
  buildRepresentativeExternalKey,
  issueExternalDriverPwaLink,
  issueExternalLinksForUser,
  upsertDriverExternalUser,
  upsertHotelExternalUser,
  upsertRepresentativeExternalUser
} from "../../services/auth/externalAutoLinks.js"

const getSubjectName = (context) => {
  if (context.user?.name) return context.user.name
  if (context.externalUser?.name) return context.externalUser.name
  if (context.externalUser?.email)
    return `Внеш. пользователь (${context.externalUser.email})`
  if (context.subject?.name) return context.subject.name
  if (context.subject?.email) return context.subject.email
  return "Неизвестный пользователь"
}

async function generateHotelLinks({ hotel, requestId, adminId }) {
  if (!hotel.hotelId) return { linkCRM: null, linkPWA: null }

  const hotelRecord = await prisma.hotel.findUnique({
    where: { id: hotel.hotelId },
    select: { id: true, name: true }
  })
  if (!hotelRecord) return { linkCRM: null, linkPWA: null }

  const externalUser = await upsertHotelExternalUser({
    hotelId: hotel.hotelId,
    name: hotel.name || hotelRecord.name || null
  })

  const generatedLinks = await issueExternalLinksForUser({
    externalUserId: externalUser.id,
    createdByAdminId: adminId || null,
    passengerRequestId: requestId
  })
  await prisma.hotel.update({
    where: { id: hotel.hotelId },
    data: {
      externalLinkCRM: generatedLinks.linkCRM,
      externalLinkPWA: generatedLinks.linkPWA
    }
  })
  return generatedLinks
}

async function generateDriverLink({
  driverName,
  requestId,
  driverIndex,
  adminId,
  serviceKind = "transfer"
}) {
  const externalUser = await upsertDriverExternalUser({
    requestId,
    driverName,
    serviceKind,
    driverIndex
  })

  return issueExternalDriverPwaLink({
    externalUserId: externalUser.id,
    createdByAdminId: adminId || null,
    passengerRequestId: requestId,
    driverIndex,
    serviceKind
  })
}

async function generateRepresentativeLinksForRequest({
  requestId,
  airlineId,
  airportId,
  adminId
}) {
  const representativeKey = buildRepresentativeExternalKey({
    airlineId,
    airportId
  })

  try {
    const externalUser = await upsertRepresentativeExternalUser({
      representativeKey,
      name: null
    })
    const generatedLinks = await issueExternalLinksForUser({
      externalUserId: externalUser.id,
      createdByAdminId: adminId || null,
      passengerRequestId: requestId
    })

    // Keep array shape for backward compatibility, but only one link source.
    return [
      {
        representativeDepartmentName: null,
        ...generatedLinks
      }
    ]
  } catch (error) {
    return [
      {
        representativeDepartmentName: null,
        linkCRM: null,
        linkPWA: null
      }
    ]
  }
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
  personType: normalizePersonType(person?.personType),
  personCategory: normalizePersonCategory(person?.personCategory),
  airlinePersonalId: normalizeOptionalString(person?.airlinePersonalId),
  accommodationChesses: ensureAccommodationChesses(
    person,
    hotelIndex,
    hotelName
  )
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

const normalizePersonType = (value) => (value === "CREW" ? "CREW" : "PASSENGER")

const normalizePersonCategory = (value) =>
  value === "CHILD" || value === "INFANT" ? value : "ADULT"

const normalizeCrewMember = (member = {}) => ({
  airlinePersonalId: normalizeOptionalString(member?.airlinePersonalId),
  fullName: member?.fullName?.trim?.() || "",
  position: normalizeOptionalString(member?.position),
  gender: normalizeOptionalString(member?.gender),
  phone: normalizeOptionalString(member?.phone)
})

// Имя embedded-поля трансфера по направлению (ARRIVAL = аэропорт→гостиница)
const getTransferField = (direction) => {
  if (direction === "DEPARTURE") return "departureTransferService"
  if (direction === "INTERCITY") return "intercityTransferService"
  return "transferService"
}

const getTransferServiceKind = (direction) => {
  if (direction === "DEPARTURE") return "transfer_departure"
  if (direction === "INTERCITY") return "transfer_intercity"
  return "transfer"
}

// ── Общие хелперы мутаций ФАП (единый «конверт») ──
const loadRequestOrThrow = async (id) => {
  const existing = await prisma.passengerRequest.findUnique({ where: { id } })
  if (!existing) throw new GraphQLError("PassengerRequest not found")
  return existing
}

const publishPassengerRequestUpdated = (passengerRequest) =>
  pubsub.publish(PASSENGER_REQUEST_UPDATED, {
    passengerRequestUpdated: hydratePassengerRequest(passengerRequest)
  })

const assertIndex = (index, length, label) => {
  if (index < 0 || index >= length) {
    throw new GraphQLError(`Invalid ${label}`)
  }
}

const assertReason = (reason) => {
  const trimmed = reason?.trim()
  if (!trimmed) throw new GraphQLError("Reason is required")
  return trimmed
}

// Дефолты embedded-сервисов, когда сервис ещё не создан
const emptyPeopleService = () => ({
  plan: null,
  status: "NEW",
  times: null,
  earlyCompletionReason: null,
  earlyCompletedAt: null,
  people: []
})

const emptyLivingService = () => ({
  plan: null,
  status: "NEW",
  times: null,
  hotels: [],
  evictions: []
})

const emptyDriversService = () => ({
  plan: null,
  status: "NEW",
  times: null,
  drivers: []
})

const ensureDriverPerson = (p) => ({
  personId: p?.personId ?? null,
  fullName: (p?.fullName?.trim?.() ?? "") || "",
  phone: normalizeOptionalString(p?.phone),
  personType: normalizePersonType(p?.personType),
  personCategory: normalizePersonCategory(p?.personCategory),
  airlinePersonalId: normalizeOptionalString(p?.airlinePersonalId)
})

const mergeSavedPassengersForRequest = (existing, snapshot) =>
  upsertSavedPassenger(existing?.savedPassengers, snapshot)

const normalizePassengerServiceDriver = (driver = {}) => ({
  ...driver,
  fullName: driver?.fullName?.trim?.() || "",
  phone: normalizeOptionalString(driver?.phone),
  link: normalizeOptionalString(driver?.link),
  addressFrom: normalizeOptionalString(driver?.addressFrom),
  addressTo: normalizeOptionalString(driver?.addressTo),
  description: normalizeOptionalString(driver?.description),
  people: Array.isArray(driver?.people)
    ? driver.people.map(ensureDriverPerson)
    : []
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
  passengerRequestId = null,
  emailAction = null,
  skipEmail = false,
  emailExtras = {},
  cancelReason = null
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

  if (skipEmail) return

  const passengerRequest = newData ?? oldData
  const resolvedAirlineId = airlineId ?? passengerRequest?.airlineId
  if (!passengerRequest?.id || !resolvedAirlineId) return

  try {
    const menuAction = emailAction ?? resolveEmailActionForLog(action)
    const { subject, html } = await buildPassengerRequestEmail({
      emailAction: menuAction,
      passengerRequest,
      description,
      fulldescription,
      cancelReason: cancelReason ?? reason,
      emailExtras
    })

    await sendRequestPartyEmail({
      actor: context.user ?? context.subject,
      airlineId: resolvedAirlineId,
      action: menuAction,
      subject,
      html,
      entityType: "passenger_request",
      entityId: passengerRequest.id,
      dispatcherFallbackTo: getDispatcherFallbackForPassengerEmail(menuAction)
    })
  } catch (error) {
    console.error("Ошибка отправки email по ФАП:", error)
  }
}

function fmtPickupForLog(iso) {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  const pad = (n) => String(n).padStart(2, "0")
  return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`
}

function buildDriverPatchDescription(before, applied, driverIndex, direction) {
  const dirLabel = direction === "DEPARTURE" ? "вылет" : "прилёт"
  const driverLabel = before?.fullName ? `«${before.fullName}»` : `#${driverIndex + 1}`
  const diffs = []
  if ("pickupAt" in applied) {
    diffs.push(`подача: ${fmtPickupForLog(before?.pickupAt)} → ${fmtPickupForLog(applied.pickupAt)}`)
  }
  if ("vehicleType" in applied) {
    diffs.push(`тип ТС: "${before?.vehicleType ?? ""}" → "${applied.vehicleType ?? ""}"`)
  }
  if ("reportCost" in applied) {
    diffs.push(`сумма: ${before?.reportCost ?? 0} → ${applied.reportCost ?? 0}`)
  }
  if (!diffs.length) {
    return {
      short: `Заявка ${driverLabel} (${dirLabel}): изменения сохранены`,
      full: `Заявка ${driverLabel} в трансфере (${dirLabel}): изменения сохранены`,
    }
  }
  return {
    short: `Заявка ${driverLabel} (${dirLabel}): ${diffs.join(", ")}`,
    full: `Заявка ${driverLabel} в трансфере (${dirLabel}). Изменения: ${diffs.join("; ")}.`,
  }
}

function flightDateTimeMs(value) {
  if (value == null) return null
  const t = new Date(value).getTime()
  return Number.isNaN(t) ? null : t
}

function passengerRequestFlightDateChanged(existingDate, nextDate) {
  if (nextDate === undefined) return false
  return flightDateTimeMs(existingDate) !== flightDateTimeMs(nextDate)
}

async function notifyPassengerRequestSite({
  action,
  passengerRequestId,
  airlineId,
  hotelId,
  descriptionHtml,
  __typename
}) {
  if (!airlineId || !passengerRequestId) return

  const allowed = shouldSendNotification({
    channel: "site",
    action,
    entityType: "passenger_request",
    entityId: passengerRequestId
  }).allowed

  if (!allowed) return

  const airline = await prisma.airline.findUnique({ where: { id: airlineId } })

  await prisma.notification.create({
    data: {
      passengerRequest: { connect: { id: passengerRequestId } },
      airline: { connect: { id: airlineId } },
      ...(hotelId && { hotel: { connect: { id: hotelId } } }),
      description: {
        action,
        description: descriptionHtml
      }
    }
  })

  pubsub.publish(NOTIFICATION, {
    notification: {
      __typename,
      action,
      airlineId,
      passengerRequestId,
      ...(hotelId && { hotelId }),
      airline: airline || null
    }
  })
}

const passengerRequestResolvers = {
  // --------- поля связей ---------
  PassengerRequest: {
    savedPassengers: (parent) => dedupeSavedPassengers(parent.savedPassengers),

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
    },

    representativeLinks: (parent) =>
      Array.isArray(parent.representativeLinks)
        ? parent.representativeLinks
        : []
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
    people: (parent) => (Array.isArray(parent.people) ? parent.people : [])
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
            { requestNumber: { contains: search, mode: "insensitive" } },
            { flightNumber: { contains: search, mode: "insensitive" } },
            { routeFrom: { contains: search, mode: "insensitive" } },
            { routeTo: { contains: search, mode: "insensitive" } }
          ]
        }
      }

      const list = await prisma.passengerRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: skip ?? undefined,
        take: take ?? undefined
      })
      return list.map(hydratePassengerRequest)
    },

    passengerRequest: async (_, { id }, context) => {
      // await allMiddleware(context) // временно отключено для ФАП (PWA magic link) // MIDDLEWARE_REVIEW: allMiddleware
      const req = await prisma.passengerRequest.findUnique({ where: { id } })
      return req ? hydratePassengerRequest(req) : null
    }
  },

  // --------- мутации ---------
  Mutation: {
    // создание
    createPassengerRequest: async (_, { input, files }, context) => {
      // await allMiddleware(context) // временно отключено для ФАП (PWA magic link) // MIDDLEWARE_REVIEW: allMiddleware
      const {
        airlineId,
        airportId,
        waterService,
        mealService,
        livingService,
        transferService,
        departureTransferService,
        intercityTransferService,
        baggageDeliveryService,
        crewMembers,
        status,
        createdById: inputCreatorId,
        ...rest
      } = input

      const createdById = resolveUserId(context, inputCreatorId)
      if (!createdById) {
        throw new GraphQLError("createdById is required")
      }
      if (!airlineId || !airportId) {
        throw new GraphQLError("airlineId and airportId are required")
      }

      const data = {
        ...rest,
        airline: { connect: { id: airlineId } },
        createdBy: { connect: { id: createdById } }
      }

      data.airport = { connect: { id: airportId } }
      if (status) data.status = status

      if (Array.isArray(crewMembers)) {
        data.crewMembers = crewMembers.map(normalizeCrewMember)
      }

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

      if (departureTransferService) {
        data.departureTransferService = {
          plan: departureTransferService.plan || null,
          status: "NEW",
          times: null,
          drivers: []
        }
      }

      if (intercityTransferService) {
        data.intercityTransferService = {
          plan: intercityTransferService.plan || null,
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
      // Формирование уникального requestNumber: {seq4}{airportCode}{MM}{YY}f
      const now = new Date()
      const month = String(now.getMonth() + 1).padStart(2, "0")
      const year = String(now.getFullYear()).slice(-2)
      const lastRequest = await prisma.passengerRequest.findFirst({
        where: { requestNumber: { not: null } },
        orderBy: { createdAt: "desc" },
        select: { requestNumber: true }
      })
      let sequenceNumber = "0001"
      if (lastRequest?.requestNumber) {
        const lastNumber = parseInt(lastRequest.requestNumber.slice(0, 4), 10)
        if (Number.isFinite(lastNumber)) {
          sequenceNumber = String(lastNumber + 1).padStart(4, "0")
        }
      }
      const airportForNumber = await prisma.airport.findUnique({
        where: { id: airportId },
        select: { code: true }
      })
      const airportCode = airportForNumber?.code || "XXX"
      data.requestNumber = `${sequenceNumber}${airportCode}${month}${year}f`

      let passengerRequest = await prisma.passengerRequest.create({ data })
      const adminId =
        context.subjectType === "USER" ? context.subject?.id : null
      const representativeLinks = await generateRepresentativeLinksForRequest({
        requestId: passengerRequest.id,
        airlineId: passengerRequest.airlineId,
        airportId: passengerRequest.airportId,
        adminId
      })
      passengerRequest = await prisma.passengerRequest.update({
        where: { id: passengerRequest.id },
        data: { representativeLinks }
      })

      if (files?.length > 0) {
        const uploadedPaths = await uploadPassengerRequestFiles(
          passengerRequest.id,
          files
        )
        if (uploadedPaths.length > 0) {
          passengerRequest = await prisma.passengerRequest.update({
            where: { id: passengerRequest.id },
            data: { files: uploadedPaths }
          })
        }
      }

      await logPassengerRequestAction({
        context,
        action: "create_passenger_request",
        description: "ФАП создан",
        fulldescription: `Пользователь ${getSubjectName(context)} создал ФАП ${passengerRequest.requestNumber || passengerRequest.flightNumber}`,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
      })

      pubsub.publish(PASSENGER_REQUEST_CREATED, {
        passengerRequestCreated: passengerRequest
      })

      const airport = passengerRequest.airportId
        ? await prisma.airport.findUnique({
            where: { id: passengerRequest.airportId },
            select: { name: true }
          })
        : null
      const routeParts = [
        passengerRequest.routeFrom,
        passengerRequest.routeTo
      ].filter(Boolean)
      const routePart = routeParts.length
        ? `, маршрут <span style='color:#545873'>${routeParts.join(" → ")}</span>`
        : ""
      const airportPart = airport?.name
        ? `, аэропорт <span style='color:#545873'>${airport.name}</span>`
        : ""
      await notifyPassengerRequestSite({
        action: "create_passenger_request",
        passengerRequestId: passengerRequest.id,
        airlineId: passengerRequest.airlineId,
        descriptionHtml: `Создан ФАП <span style='color:#545873'>${passengerRequest.flightNumber}</span>${routePart}${airportPart}`,
        __typename: "PassengerRequestCreatedNotification"
      })

      return passengerRequest
    },

    // обновление шапки + планов
    updatePassengerRequest: async (_, { id, input }, context) => {
      // await allMiddleware(context) // временно отключено для ФАП (PWA magic link) // MIDDLEWARE_REVIEW: allMiddleware
      const existing = await loadRequestOrThrow(id)

      const {
        airlineId,
        airportId,
        waterService,
        mealService,
        livingService,
        transferService,
        departureTransferService,
        intercityTransferService,
        baggageDeliveryService,
        crewMembers,
        ...rest
      } = input

      const data = {}

      Object.entries(rest).forEach(([key, value]) => {
        if (value !== undefined) data[key] = value
      })

      if (Array.isArray(crewMembers)) {
        data.crewMembers = crewMembers.map(normalizeCrewMember)
      }

      if (airlineId) {
        data.airline = { connect: { id: airlineId } }
      }

      if (airportId !== undefined) {
        if (airportId === null) data.airport = { disconnect: true }
        else data.airport = { connect: { id: airportId } }
      }

      const totalDriverPeople = (drivers) =>
        (drivers || []).reduce((sum, d) => sum + (d?.people?.length || 0), 0)
      const totalHotelPeople = (hotels) =>
        (hotels || []).reduce((sum, h) => sum + (h?.people?.length || 0), 0)

      if (waterService) {
        const prev = existing.waterService || {}
        const mergedPlan =
          waterService.plan !== undefined ? waterService.plan : prev.plan
        const current = (prev.people || []).length
        const recalc = recomputeServiceStatus(
          { ...prev, plan: mergedPlan },
          current,
          current
        )
        data.waterService = {
          ...prev,
          ...(waterService.plan !== undefined && { plan: waterService.plan }),
          status: recalc.status,
          times: recalc.times
        }
      }

      if (mealService) {
        const prev = existing.mealService || {}
        const mergedPlan =
          mealService.plan !== undefined ? mealService.plan : prev.plan
        const current = (prev.people || []).length
        const recalc = recomputeServiceStatus(
          { ...prev, plan: mergedPlan },
          current,
          current
        )
        data.mealService = {
          ...prev,
          ...(mealService.plan !== undefined && { plan: mealService.plan }),
          status: recalc.status,
          times: recalc.times
        }
      }

      if (livingService) {
        const prev = existing.livingService || {}
        const mergedPlan =
          livingService.plan !== undefined ? livingService.plan : prev.plan
        const current = totalHotelPeople(prev.hotels)
        const recalc = recomputeServiceStatus(
          { ...prev, plan: mergedPlan },
          current,
          current
        )
        data.livingService = {
          ...prev,
          ...(livingService.plan !== undefined && { plan: livingService.plan }),
          status: recalc.status,
          times: recalc.times
        }
      }

      if (transferService) {
        const prev = existing.transferService || {}
        const mergedPlan =
          transferService.plan !== undefined ? transferService.plan : prev.plan
        const current = totalDriverPeople(prev.drivers)
        const recalc = recomputeServiceStatus(
          { ...prev, plan: mergedPlan },
          current,
          current
        )
        data.transferService = {
          ...prev,
          ...(transferService.plan !== undefined && {
            plan: transferService.plan
          }),
          status: recalc.status,
          times: recalc.times
        }
      }

      if (departureTransferService) {
        const prev = existing.departureTransferService || {}
        const mergedPlan =
          departureTransferService.plan !== undefined
            ? departureTransferService.plan
            : prev.plan
        const current = totalDriverPeople(prev.drivers)
        const recalc = recomputeServiceStatus(
          { ...prev, plan: mergedPlan },
          current,
          current
        )
        data.departureTransferService = {
          ...prev,
          ...(departureTransferService.plan !== undefined && {
            plan: departureTransferService.plan
          }),
          status: recalc.status,
          times: recalc.times
        }
      }

      if (intercityTransferService) {
        const prev = existing.intercityTransferService || {}
        const mergedPlan =
          intercityTransferService.plan !== undefined
            ? intercityTransferService.plan
            : prev.plan
        const current = totalDriverPeople(prev.drivers)
        const recalc = recomputeServiceStatus(
          { ...prev, plan: mergedPlan },
          current,
          current
        )
        data.intercityTransferService = {
          ...prev,
          ...(intercityTransferService.plan !== undefined && {
            plan: intercityTransferService.plan
          }),
          status: recalc.status,
          times: recalc.times
        }
      }

      if (baggageDeliveryService) {
        const prev = existing.baggageDeliveryService || {}
        const mergedPlan =
          baggageDeliveryService.plan !== undefined
            ? baggageDeliveryService.plan
            : prev.plan
        const current = totalDriverPeople(prev.drivers)
        const recalc = recomputeServiceStatus(
          { ...prev, plan: mergedPlan },
          current,
          current
        )
        data.baggageDeliveryService = {
          ...prev,
          ...(baggageDeliveryService.plan !== undefined && {
            plan: baggageDeliveryService.plan
          }),
          status: recalc.status,
          times: recalc.times
        }
      }
      const passengerRequest = await prisma.passengerRequest.update({
        where: { id },
        data
      })

      const isDateChange = passengerRequestFlightDateChanged(
        existing.flightDate,
        rest.flightDate
      )
      let emailExtras = {}
      let emailAction = "update_passenger_request"
      if (isDateChange) {
        emailAction = "passenger_request_dates_change"
        const airline = passengerRequest.airlineId
          ? await prisma.airline.findUnique({
              where: { id: passengerRequest.airlineId },
              select: { name: true }
            })
          : null
        emailExtras = {
          oldFlightDate: formatDate(existing.flightDate),
          newFlightDate: formatDate(passengerRequest.flightDate),
          airlineName: airline?.name
        }
      }

      await logPassengerRequestAction({
        context,
        action: "update_passenger_request",
        description: "ФАП обновлен",
        fulldescription: `Пользователь ${getSubjectName(context)} обновил ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id,
        emailAction,
        emailExtras
      })

      if (Object.keys(data).length > 0) {
        await notifyPassengerRequestSite({
          action: isDateChange
            ? "passenger_request_dates_change"
            : "update_passenger_request",
          passengerRequestId: passengerRequest.id,
          airlineId: passengerRequest.airlineId,
          descriptionHtml: `Обновлён ФАП <span style='color:#545873'>${passengerRequest.flightNumber}</span>`,
          __typename: "PassengerRequestUpdatedNotification"
        })
      }

      publishPassengerRequestUpdated(passengerRequest)

      return passengerRequest
    },

    addPassengerRequestFiles: async (_, { requestId, files }, context) => {
      const existing = await loadRequestOrThrow(requestId)
      if (!files?.length) {
        throw new GraphQLError("At least one file is required")
      }

      const uploadedPaths = await uploadPassengerRequestFiles(requestId, files)
      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: {
          files: [...(existing.files || []), ...uploadedPaths]
        }
      })

      await logPassengerRequestAction({
        context,
        action: "add_passenger_request_files",
        description: "Файлы добавлены в ФАП",
        fulldescription: `Пользователь ${getSubjectName(context)} добавил ${uploadedPaths.length} файл(ов) в ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
      })

      publishPassengerRequestUpdated(passengerRequest)

      return passengerRequest
    },

    removePassengerRequestFile: async (
      _,
      { requestId, filePath },
      context
    ) => {
      const existing = await loadRequestOrThrow(requestId)

      const fileIndex = findPassengerRequestFileIndex(
        existing.files,
        filePath
      )
      if (fileIndex < 0) {
        throw new GraphQLError("File not found on this passenger request")
      }

      const removedPath = existing.files[fileIndex]
      await deletePassengerRequestFileFromDisk(removedPath)

      const nextFiles = (existing.files || []).filter(
        (_, index) => index !== fileIndex
      )

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: { files: nextFiles }
      })

      await logPassengerRequestAction({
        context,
        action: "remove_passenger_request_file",
        description: "Файл удалён из ФАП",
        fulldescription: `Пользователь ${getSubjectName(context)} удалил файл из ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
      })

      publishPassengerRequestUpdated(passengerRequest)

      return passengerRequest
    },

    deletePassengerRequest: async (_, { id }, context) => {
      // await allMiddleware(context) // временно отключено для ФАП (PWA magic link) // MIDDLEWARE_REVIEW: allMiddleware
      const existing = await loadRequestOrThrow(id)

      await deleteAllPassengerRequestFilesFromDisk(existing.files)

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

      publishPassengerRequestUpdated(passengerRequest)

      return true
    },

    // общий статус заявки
    setPassengerRequestStatus: async (_, { id, status }, context) => {
      // await allMiddleware(context) // временно отключено для ФАП (PWA magic link) // MIDDLEWARE_REVIEW: allMiddleware
      const existing = await loadRequestOrThrow(id)

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

      publishPassengerRequestUpdated(passengerRequest)

      return passengerRequest
    },

    // ростер экипажа заявки
    updatePassengerRequestCrew: async (
      _,
      { requestId, crewMembers },
      context
    ) => {
      // await allMiddleware(context) // временно отключено для ФАП (PWA magic link) // MIDDLEWARE_REVIEW: allMiddleware
      const existing = await loadRequestOrThrow(requestId)

      const normalizedCrew = Array.isArray(crewMembers)
        ? crewMembers.map(normalizeCrewMember)
        : []

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: { crewMembers: normalizedCrew }
      })

      await logPassengerRequestAction({
        context,
        action: "update_passenger_request_crew",
        description: "Обновлён ростер экипажа ФАП",
        fulldescription: `Пользователь ${getSubjectName(context)} обновил ростер экипажа ФАП ${passengerRequest.flightNumber} (${normalizedCrew.length} чел.)`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
      })

      publishPassengerRequestUpdated(passengerRequest)

      return passengerRequest
    },

    addPassengerRequestSavedPerson: async (_, { requestId, person }, context) => {
      const existing = await loadRequestOrThrow(requestId)

      let savedPassengers
      try {
        savedPassengers = upsertSavedPassenger(
          existing.savedPassengers,
          person
        )
      } catch (e) {
        throw new GraphQLError(e.message || "Invalid saved passenger")
      }

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: { savedPassengers }
      })

      await logPassengerRequestAction({
        context,
        action: "add_passenger_request_saved_person",
        description: "Пассажир добавлен в реестр ФАП",
        fulldescription: `Пользователь ${getSubjectName(context)} добавил пассажира в реестр ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
      })

      publishPassengerRequestUpdated(passengerRequest)

      return passengerRequest
    },

    updatePassengerRequestSavedPerson: async (
      _,
      { requestId, personId, person },
      context
    ) => {
      const existing = await loadRequestOrThrow(requestId)

      let savedPassengers
      try {
        savedPassengers = updateSavedPersonInRoster(
          existing.savedPassengers,
          personId,
          person
        )
      } catch (e) {
        throw new GraphQLError(e.message || "Invalid saved passenger")
      }

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: { savedPassengers }
      })

      await logPassengerRequestAction({
        context,
        action: "update_passenger_request_saved_person",
        description: "Пассажир обновлён в реестре ФАП",
        fulldescription: `Пользователь ${getSubjectName(context)} обновил пассажира в реестре ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
      })

      publishPassengerRequestUpdated(passengerRequest)

      return passengerRequest
    },

    removePassengerRequestSavedPerson: async (
      _,
      { requestId, personId },
      context
    ) => {
      const existing = await loadRequestOrThrow(requestId)

      let savedPassengers
      try {
        savedPassengers = removeSavedPersonFromRoster(
          existing.savedPassengers,
          personId
        )
      } catch (e) {
        throw new GraphQLError(e.message || "Saved passenger not found")
      }

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: { savedPassengers }
      })

      await logPassengerRequestAction({
        context,
        action: "remove_passenger_request_saved_person",
        description: "Пассажир удалён из реестра ФАП",
        fulldescription: `Пользователь ${getSubjectName(context)} удалил пассажира из реестра ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
      })

      publishPassengerRequestUpdated(passengerRequest)

      return passengerRequest
    },

    // Пакетное добавление в реестр (импорт манифеста); дедуп по ФИО в хелпере
    addPassengerRequestSavedPeople: async (
      _,
      { requestId, people },
      context
    ) => {
      const existing = await loadRequestOrThrow(requestId)

      let merged
      try {
        merged = mergeManifestPeopleIntoRoster(
          existing.savedPassengers,
          people
        )
      } catch (e) {
        throw new GraphQLError(e.message || "Invalid saved passengers")
      }

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: { savedPassengers: merged.roster }
      })

      await logPassengerRequestAction({
        context,
        action: "add_passenger_request_saved_people",
        description: `Импорт манифеста в реестр ФАП: добавлено ${merged.addedCount}, пропущено ${merged.matchedCount}`,
        fulldescription: `Пользователь ${getSubjectName(context)} импортировал манифест в реестр ФАП ${passengerRequest.flightNumber}: добавлено ${merged.addedCount}, пропущено ${merged.matchedCount} (уже в реестре)`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id,
        skipEmail: true
      })

      publishPassengerRequestUpdated(passengerRequest)

      return passengerRequest
    },

    // общий статус заявки
    cancelPassengerRequest: async (_, { id, cancelReason }, context) => {
      // await allMiddleware(context) // временно отключено для ФАП (PWA magic link) // MIDDLEWARE_REVIEW: allMiddleware
      const existing = await loadRequestOrThrow(id)
      const status = "CANCELLED"
      const statusTimes = updateTimes(existing.statusTimes, status)

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id },
        data: {
          status,
          statusTimes,
          cancelReason
        }
      })

      await logPassengerRequestAction({
        context,
        action: "update_passenger_request_status",
        description: "Заявка по ФАП отменена",
        fulldescription: `Пользователь ${getSubjectName(context)} отменил ФАП ${passengerRequest.flightNumber}`,
        reason: cancelReason,
        cancelReason,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id,
        emailAction: "cancel_passenger_request"
      })

      publishPassengerRequestUpdated(passengerRequest)

      await notifyPassengerRequestSite({
        action: "cancel_passenger_request",
        passengerRequestId: passengerRequest.id,
        airlineId: passengerRequest.airlineId,
        descriptionHtml: `Отменён ФАП <span style='color:#545873'>${passengerRequest.flightNumber}</span>`,
        __typename: "PassengerRequestUpdatedNotification"
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
      const existing = await loadRequestOrThrow(id)

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
      } else if (service === "DEPARTURE_TRANSFER") {
        const prev = existing.departureTransferService || { drivers: [] }
        data.departureTransferService = {
          ...prev,
          status,
          times: updateTimes(prev.times, status)
        }
      } else if (service === "INTERCITY_TRANSFER") {
        const prev = existing.intercityTransferService || { drivers: [] }
        data.intercityTransferService = {
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

      publishPassengerRequestUpdated(passengerRequest)

      return passengerRequest
    },

    recognizePassengerDocument: async (_, { image }, context) => {
      // await allMiddleware(context) // временно отключено для ФАП (PWA magic link) // MIDDLEWARE_REVIEW: allMiddleware
      return await recognizeDocumentService(image)
    },

    // добавить ФИО из скана / вручную
    addPassengerRequestPerson: async (
      _,
      { requestId, service, person },
      context
    ) => {
      // await allMiddleware(context) // временно отключено для ФАП (PWA magic link) // MIDDLEWARE_REVIEW: allMiddleware
      const existing = await loadRequestOrThrow(requestId)
      const personWithId = {
        ...ensurePersonId(person),
        personCategory: normalizePersonCategory(person?.personCategory),
      }

      const data = {}

      if (service === "WATER") {
        const prev = existing.waterService || emptyPeopleService()
        const people = [...(prev.people || []), personWithId]
        const recalc = recomputeServiceStatus(
          prev,
          (prev.people || []).length,
          people.length
        )
        data.waterService = {
          ...prev,
          people,
          status: recalc.status,
          times: recalc.times
        }
      } else if (service === "MEAL") {
        const prev = existing.mealService || emptyPeopleService()
        const people = [...(prev.people || []), personWithId]
        const recalc = recomputeServiceStatus(
          prev,
          (prev.people || []).length,
          people.length
        )
        data.mealService = {
          ...prev,
          people,
          status: recalc.status,
          times: recalc.times
        }
      } else {
        throw new GraphQLError("PassengerWaterFoodKind must be WATER or MEAL")
      }

      data.savedPassengers = mergeSavedPassengersForRequest(
        existing,
        snapshotFromServicePerson(personWithId)
      )

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

      publishPassengerRequestUpdated(passengerRequest)

      return passengerRequest
    },

    addPassengerRequestPeople: async (
      _,
      { requestId, service, people },
      context
    ) => {
      // await allMiddleware(context) // временно отключено для ФАП (PWA magic link) // MIDDLEWARE_REVIEW: allMiddleware
      if (!Array.isArray(people) || people.length === 0) {
        throw new GraphQLError("people must be a non-empty array")
      }
      if (service !== "WATER" && service !== "MEAL") {
        throw new GraphQLError("PassengerWaterFoodKind must be WATER or MEAL")
      }
      const existing = await loadRequestOrThrow(requestId)
      const peopleWithId = people.map((p) => ({
        ...ensurePersonId(p),
        personCategory: normalizePersonCategory(p?.personCategory),
      }))

      const serviceField = service === "WATER" ? "waterService" : "mealService"
      const prev = existing[serviceField] || emptyPeopleService()
      const nextPeople = [...(prev.people || []), ...peopleWithId]

      const recalc = recomputeServiceStatus(
        prev,
        (prev.people || []).length,
        nextPeople.length
      )
      const nextStatus = recalc.status
      const nextTimes = recalc.times

      let savedPassengers = existing.savedPassengers
      for (const p of peopleWithId) {
        savedPassengers = upsertSavedPassenger(
          savedPassengers,
          snapshotFromServicePerson(p)
        )
      }

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: {
          [serviceField]: {
            ...prev,
            people: nextPeople,
            status: nextStatus,
            times: nextTimes
          },
          savedPassengers
        }
      })
      await logPassengerRequestAction({
        context,
        action: "add_passenger_request_people",
        description: `Пакетно добавлены пассажиры в сервис ${service} (${people.length})`,
        fulldescription: `Пользователь ${getSubjectName(context)} добавил ${people.length} пассажиров в сервис ${service} ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
      })

      publishPassengerRequestUpdated(passengerRequest)

      return passengerRequest
    },

    // обновление получателя воды/питания
    updatePassengerRequestPerson: async (
      _,
      { requestId, service, personIndex, person },
      context
    ) => {
      // await allMiddleware(context) // временно отключено для ФАП (PWA magic link) // MIDDLEWARE_REVIEW: allMiddleware
      const existing = await loadRequestOrThrow(requestId)

      const data = {}
      const serviceField = service === "WATER" ? "waterService" : "mealService"
      if (service !== "WATER" && service !== "MEAL") {
        throw new GraphQLError("PassengerWaterFoodKind must be WATER or MEAL")
      }

      const prev = existing[serviceField] || emptyPeopleService()
      const people = [...(prev.people || [])]
      assertIndex(personIndex, people.length, "personIndex")
      // keep existing issuedAt unless explicitly provided
      people[personIndex] = {
        ...people[personIndex],
        ...person,
        personCategory: normalizePersonCategory(
          person?.personCategory ?? people[personIndex]?.personCategory
        ),
        issuedAt: person?.issuedAt ?? people[personIndex]?.issuedAt ?? null
      }
      data[serviceField] = { ...prev, people }
      data.savedPassengers = patchSavedPersonIdentity(
        existing.savedPassengers,
        people[personIndex]
      )

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data
      })
      await logPassengerRequestAction({
        context,
        action: "update_passenger_request_person",
        description: `Получатель обновлён в сервисе: ${service}`,
        fulldescription: `Пользователь ${getSubjectName(context)} обновил получателя #${personIndex} в сервисе ${service} ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
      })

      publishPassengerRequestUpdated(passengerRequest)

      return passengerRequest
    },

    // удаление получателя воды/питания
    removePassengerRequestPerson: async (
      _,
      { requestId, service, personIndex },
      context
    ) => {
      // await allMiddleware(context) // временно отключено для ФАП (PWA magic link) // MIDDLEWARE_REVIEW: allMiddleware
      const existing = await loadRequestOrThrow(requestId)

      const data = {}
      const serviceField = service === "WATER" ? "waterService" : "mealService"
      if (service !== "WATER" && service !== "MEAL") {
        throw new GraphQLError("PassengerWaterFoodKind must be WATER or MEAL")
      }

      const prev = existing[serviceField] || emptyPeopleService()
      const people = [...(prev.people || [])]
      assertIndex(personIndex, people.length, "personIndex")
      people.splice(personIndex, 1)

      const recalc = recomputeServiceStatus(
        prev,
        (prev.people || []).length,
        people.length
      )
      data[serviceField] = {
        ...prev,
        people,
        status: recalc.status,
        times: recalc.times
      }

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data
      })
      await logPassengerRequestAction({
        context,
        action: "remove_passenger_request_person",
        description: `Получатель удалён из сервиса: ${service}`,
        fulldescription: `Пользователь ${getSubjectName(context)} удалил получателя #${personIndex} в сервисе ${service} ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
      })

      publishPassengerRequestUpdated(passengerRequest)

      return passengerRequest
    },

    // добавить отель
    addPassengerRequestHotel: async (_, { requestId, hotel }, context) => {
      // await allMiddleware(context) // временно отключено для ФАП (PWA magic link) // MIDDLEWARE_REVIEW: allMiddleware
      const existing = await loadRequestOrThrow(requestId)

      const prev = existing.livingService || emptyLivingService()

      const hotelWithItemId = ensurePassengerServiceHotelItemId(hotel)

      const adminId =
        context.subjectType === "USER" ? context.subject?.id : null
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
      const nextTimes = isFirstHotel
        ? updateTimes(prev.times, "ACCEPTED")
        : prev.times

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
        passengerRequestId: passengerRequest.id,
        emailExtras: { hotelName: hotelWithItemId.name }
      })

      publishPassengerRequestUpdated(passengerRequest)

      await notifyPassengerRequestSite({
        action: "update_hotel_chess_passenger_request",
        passengerRequestId: passengerRequest.id,
        airlineId: passengerRequest.airlineId,
        hotelId: hotelWithItemId.hotelId || undefined,
        descriptionHtml: `В ФАП <span style='color:#545873'>${passengerRequest.flightNumber}</span> добавлен отель <span style='color:#545873'>${hotelWithItemId.name}</span>`,
        __typename: "PassengerRequestUpdatedNotification"
      })

      return passengerRequest
    },

    removePassengerRequestHotel: async (
      _,
      { requestId, hotelIndex },
      context
    ) => {
      // await allMiddleware(context) // временно отключено для ФАП (PWA magic link) // MIDDLEWARE_REVIEW: allMiddleware
      const existing = await loadRequestOrThrow(requestId)

      const living = existing.livingService || emptyLivingService()
      const hotels = living.hotels || []
      assertIndex(hotelIndex, hotels.length, "hotelIndex")

      const removedHotel = hotels[hotelIndex]
      const indexMap = new Map()
      let nextIndex = 0
      hotels.forEach((hotel, idx) => {
        if (idx === hotelIndex) return
        indexMap.set(idx, nextIndex)
        nextIndex += 1
      })

      const nextHotels = hotels
        .filter((_, idx) => idx !== hotelIndex)
        .map((hotel, idx) => {
          const hotelName = hotel?.name ?? null
          const nextPeople = (hotel?.people || []).map((person) => {
            const normalizedPerson = ensureHotelPerson(person, idx, hotelName)
            const nextChesses = (normalizedPerson.accommodationChesses || [])
              .filter((item) => item?.hotelIndex !== hotelIndex)
              .map((item) => {
                const mappedIndex = indexMap.get(item?.hotelIndex)
                if (mappedIndex == null) return item
                return {
                  ...item,
                  hotelIndex: mappedIndex,
                  hotelName:
                    hotels[item.hotelIndex]?.name ?? item.hotelName ?? null
                }
              })
            return {
              ...normalizedPerson,
              accommodationChesses: nextChesses
            }
          })
          return {
            ...hotel,
            people: nextPeople
          }
        })

      const nextEvictions = (living.evictions || [])
        .filter((item) => item?.hotelIndex !== hotelIndex)
        .map((item) => {
          const mappedIndex = indexMap.get(item?.hotelIndex)
          if (mappedIndex == null) return item
          return {
            ...item,
            hotelIndex: mappedIndex,
            hotelName: hotels[item.hotelIndex]?.name ?? item.hotelName ?? null
          }
        })

      const totalPeopleBefore = hotels.reduce(
        (sum, h) => sum + (Array.isArray(h.people) ? h.people.length : 0),
        0
      )
      const totalPeopleAfter = nextHotels.reduce(
        (sum, h) => sum + (Array.isArray(h.people) ? h.people.length : 0),
        0
      )
      const recalc =
        nextHotels.length === 0
          ? { status: "NEW", times: living.times || {} }
          : recomputeServiceStatus(living, totalPeopleBefore, totalPeopleAfter)
      const nextLivingService = {
        ...living,
        hotels: nextHotels,
        evictions: nextEvictions,
        status: recalc.status,
        times: recalc.times
      }

      const [, , passengerRequest] = await prisma.$transaction([
        prisma.passengerRequestHotelReport.deleteMany({
          where: {
            passengerRequestId: requestId,
            hotelIndex
          }
        }),
        prisma.passengerRequestHotelReport.updateMany({
          where: {
            passengerRequestId: requestId,
            hotelIndex: { gt: hotelIndex }
          },
          data: {
            hotelIndex: {
              decrement: 1
            }
          }
        }),
        prisma.passengerRequest.update({
          where: { id: requestId },
          data: {
            livingService: nextLivingService
          }
        })
      ])

      await logPassengerRequestAction({
        context,
        action: "remove_passenger_request_hotel",
        description: `Отель удален из ФАП: ${removedHotel?.name || hotelIndex}`,
        fulldescription: `Пользователь ${getSubjectName(context)} удалил отель ${removedHotel?.name || `#${hotelIndex}`} из ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id,
        emailExtras: { hotelName: removedHotel?.name }
      })

      publishPassengerRequestUpdated(passengerRequest)

      await notifyPassengerRequestSite({
        action: "update_hotel_chess_passenger_request",
        passengerRequestId: passengerRequest.id,
        airlineId: passengerRequest.airlineId,
        hotelId: removedHotel?.hotelId || undefined,
        descriptionHtml: `В ФАП <span style='color:#545873'>${passengerRequest.flightNumber}</span> удален отель <span style='color:#545873'>${removedHotel?.name || `#${hotelIndex}`}</span>`,
        __typename: "PassengerRequestUpdatedNotification"
      })

      return passengerRequest
    },

    // обновить редактируемые поля отеля (name / peopleCount / address / link / hotelId)
    // itemId, people, accommodationChesses, linkCRM/linkPWA не трогаем — сохраняем как есть
    updatePassengerRequestHotel: async (
      _,
      { requestId, hotelIndex, hotel },
      context
    ) => {
      // await allMiddleware(context) // временно отключено для ФАП (PWA magic link) // MIDDLEWARE_REVIEW: allMiddleware
      const existing = await loadRequestOrThrow(requestId)

      const living = existing.livingService || emptyLivingService()
      const hotels = living.hotels || []
      assertIndex(hotelIndex, hotels.length, "hotelIndex")

      const prevHotel = hotels[hotelIndex] || {}
      const placedCount = (prevHotel.people || []).length

      // Валидация: новое количество мест не может быть меньше уже размещённых
      if (
        typeof hotel.peopleCount === "number" &&
        hotel.peopleCount < placedCount
      ) {
        throw new GraphQLError(
          `Нельзя задать меньше количества уже размещённых гостей (${placedCount})`
        )
      }

      // Валидация: сумма мест по всем отелям не должна превышать план услуги
      const planCap = living?.plan?.peopleCount
      if (typeof planCap === "number" && typeof hotel.peopleCount === "number") {
        const sumOthers = hotels.reduce(
          (s, h, i) => s + (i === hotelIndex ? 0 : Number(h?.peopleCount) || 0),
          0
        )
        if (sumOthers + hotel.peopleCount > planCap) {
          throw new GraphQLError(
            `Превышен план услуги. Максимум для этого отеля: ${Math.max(0, planCap - sumOthers)}`
          )
        }
      }

      const updatedHotel = {
        ...prevHotel,
        name: hotel.name ?? prevHotel.name,
        peopleCount:
          typeof hotel.peopleCount === "number"
            ? hotel.peopleCount
            : prevHotel.peopleCount,
        address: hotel.address ?? prevHotel.address ?? null,
        link: hotel.link ?? prevHotel.link ?? null,
        hotelId: hotel.hotelId ?? prevHotel.hotelId ?? null
      }

      const nextHotels = hotels.map((h, i) =>
        i === hotelIndex ? updatedHotel : h
      )

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: {
          livingService: {
            ...living,
            hotels: nextHotels
          }
        }
      })

      await logPassengerRequestAction({
        context,
        action: "update_passenger_request_hotel",
        description: `Отель обновлён в ФАП: ${updatedHotel.name || hotelIndex}`,
        fulldescription: `Пользователь ${getSubjectName(context)} обновил отель ${updatedHotel.name || `#${hotelIndex}`} в ФАП ${passengerRequest.flightNumber} (мест: ${updatedHotel.peopleCount})`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id,
        emailExtras: { hotelName: updatedHotel.name }
      })

      publishPassengerRequestUpdated(passengerRequest)

      await notifyPassengerRequestSite({
        action: "update_hotel_chess_passenger_request",
        passengerRequestId: passengerRequest.id,
        airlineId: passengerRequest.airlineId,
        hotelId: updatedHotel.hotelId || undefined,
        descriptionHtml: `В ФАП <span style='color:#545873'>${passengerRequest.flightNumber}</span> обновлён отель <span style='color:#545873'>${updatedHotel.name || `#${hotelIndex}`}</span>`,
        __typename: "PassengerRequestUpdatedNotification"
      })

      return passengerRequest
    },

    addPassengerRequestHotelPerson: async (
      _,
      { requestId, hotelIndex, person },
      context
    ) => {
      // await representativeMiddleware(context) // временно отключено для ФАП (magic link)
      const existing = await loadRequestOrThrow(requestId)
      const personWithId = ensurePersonId(person)

      const living = existing.livingService || emptyLivingService()
      const hotels = living.hotels || []
      assertIndex(hotelIndex, hotels.length, "hotelIndex")
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
                ensureHotelPerson(personWithId, i, name)
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
      const recalc = recomputeServiceStatus(
        living,
        totalPeopleBefore,
        totalPeopleAfter
      )
      const nextStatus = recalc.status
      const nextTimes = recalc.times

      const targetHotelForPerson = hotels[hotelIndex]
      const normalizedHotelPerson = ensureHotelPerson(
        personWithId,
        hotelIndex,
        targetHotelForPerson?.name ?? ""
      )
      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: {
          livingService: {
            ...living,
            hotels: hotelsClone,
            status: nextStatus,
            times: nextTimes
          },
          savedPassengers: mergeSavedPassengersForRequest(
            existing,
            snapshotFromHotelPerson(normalizedHotelPerson)
          )
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
        passengerRequestId: passengerRequest.id,
        emailExtras: {
          hotelName: targetHotelForPerson?.name,
          personName: person?.fullName,
          roomName: makeRoomCategoryLabel(
            person?.roomCategory,
            person?.roomKind
          )
        }
      })

      publishPassengerRequestUpdated(passengerRequest)

      return passengerRequest
    },

    addPassengerRequestHotelPeople: async (
      _,
      { requestId, hotelIndex, people },
      context
    ) => {
      // await representativeMiddleware(context) // временно отключено для ФАП (magic link)
      if (!Array.isArray(people) || people.length === 0) {
        throw new GraphQLError("people must be a non-empty array")
      }
      const existing = await loadRequestOrThrow(requestId)
      const peopleWithId = people.map(ensurePersonId)

      const living = existing.livingService || emptyLivingService()
      const hotels = living.hotels || []
      assertIndex(hotelIndex, hotels.length, "hotelIndex")
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
        const existingPeople = ((h && h.people) || []).map((item) =>
          ensureHotelPerson(item, i, name)
        )
        if (i !== hotelIndex) {
          return { ...h, people: existingPeople }
        }
        const added = peopleWithId.map((p) => ensureHotelPerson(p, i, name))
        return { ...h, people: [...existingPeople, ...added] }
      })

      const totalPeopleBefore = (living.hotels || []).reduce(
        (sum, h) => sum + (Array.isArray(h.people) ? h.people.length : 0),
        0
      )
      const totalPeopleAfter = hotelsClone.reduce(
        (sum, h) => sum + (Array.isArray(h.people) ? h.people.length : 0),
        0
      )
      const recalc = recomputeServiceStatus(
        living,
        totalPeopleBefore,
        totalPeopleAfter
      )
      const nextStatus = recalc.status
      const nextTimes = recalc.times

      let savedPassengers = existing.savedPassengers
      for (const p of peopleWithId) {
        savedPassengers = upsertSavedPassenger(
          savedPassengers,
          snapshotFromHotelPerson(
            ensureHotelPerson(p, hotelIndex, hotels[hotelIndex]?.name ?? "")
          )
        )
      }

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: {
          livingService: {
            ...living,
            hotels: hotelsClone,
            status: nextStatus,
            times: nextTimes
          },
          savedPassengers
        }
      })
      await logPassengerRequestAction({
        context,
        action: "add_passenger_request_hotel_people",
        description: `Пакетно добавлены пассажиры в отель ФАП (${people.length})`,
        fulldescription: `Пользователь ${getSubjectName(context)} добавил ${people.length} пассажиров в отель ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
      })

      publishPassengerRequestUpdated(passengerRequest)

      return passengerRequest
    },

    updatePassengerRequestHotelPerson: async (
      _,
      { requestId, hotelIndex, personIndex, person },
      context
    ) => {
      // await allMiddleware(context) // временно отключено для ФАП (PWA magic link) // MIDDLEWARE_REVIEW: allMiddleware
      const existing = await loadRequestOrThrow(requestId)

      const living = existing.livingService || emptyLivingService()
      const hotels = living.hotels || []
      assertIndex(hotelIndex, hotels.length, "hotelIndex")
      const people = hotels[hotelIndex].people || []
      assertIndex(personIndex, people.length, "personIndex")

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
          personId: person?.personId ?? previousPerson?.personId ?? null,
          personType: normalizePersonType(
            person?.personType ?? previousPerson?.personType
          ),
          personCategory: normalizePersonCategory(
            person?.personCategory ?? previousPerson?.personCategory
          ),
          airlinePersonalId:
            normalizeOptionalString(person?.airlinePersonalId) ??
            previousPerson?.airlinePersonalId ??
            null,
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
          },
          savedPassengers: patchSavedPersonIdentity(
            existing.savedPassengers,
            hotelsClone[hotelIndex].people[personIndex]
          )
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

      publishPassengerRequestUpdated(passengerRequest)

      return passengerRequest
    },

    removePassengerRequestHotelPerson: async (
      _,
      { requestId, hotelIndex, personIndex },
      context
    ) => {
      // await allMiddleware(context) // временно отключено для ФАП (PWA magic link) // MIDDLEWARE_REVIEW: allMiddleware
      const existing = await loadRequestOrThrow(requestId)

      const living = existing.livingService || emptyLivingService()
      const hotels = living.hotels || []
      assertIndex(hotelIndex, hotels.length, "hotelIndex")
      const people = hotels[hotelIndex].people || []
      assertIndex(personIndex, people.length, "personIndex")

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

      const totalPeopleBefore = (hotels || []).reduce(
        (sum, h) => sum + (Array.isArray(h.people) ? h.people.length : 0),
        0
      )
      const totalPeopleAfter = hotelsClone.reduce(
        (sum, h) => sum + (Array.isArray(h.people) ? h.people.length : 0),
        0
      )
      const recalc = recomputeServiceStatus(
        living,
        totalPeopleBefore,
        totalPeopleAfter
      )

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: {
          livingService: {
            ...living,
            hotels: hotelsClone,
            status: recalc.status,
            times: recalc.times
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

      publishPassengerRequestUpdated(passengerRequest)

      return passengerRequest
    },

    // добавить водителя (для варианта проживание+трансфер)
    addPassengerRequestDriver: async (
      _,
      { requestId, driver, direction = "ARRIVAL" },
      context
    ) => {
      // await allMiddleware(context) // временно отключено для ФАП (PWA magic link) // MIDDLEWARE_REVIEW: allMiddleware
      const existing = await loadRequestOrThrow(requestId)
      if (!driver?.fullName?.trim()) {
        throw new GraphQLError("Driver fullName is required")
      }

      const transferField = getTransferField(direction)
      const prev = existing[transferField] || emptyDriversService()

      const normalizedDriver = normalizePassengerServiceDriver(driver)
      const driverIndex = (prev.drivers || []).length
      const adminId =
        context.subjectType === "USER" ? context.subject?.id : null
      try {
        const linkPWA = await generateDriverLink({
          driverName: normalizedDriver.fullName,
          requestId,
          driverIndex,
          adminId,
          serviceKind: getTransferServiceKind(direction)
        })
        normalizedDriver.linkPWA = linkPWA
      } catch (e) {
        normalizedDriver.linkPWA = null
      }

      const drivers = [...(prev.drivers || []), normalizedDriver]
      const isFirstDriver = driverIndex === 0
      const nextStatus = isFirstDriver ? "ACCEPTED" : prev.status
      const nextTimes = isFirstDriver
        ? updateTimes(prev.times, "ACCEPTED")
        : prev.times

      const data = {
        [transferField]: {
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

      publishPassengerRequestUpdated(passengerRequest)

      return passengerRequest
    },

    updatePassengerRequestDriver: async (
      _,
      { requestId, driverIndex, patch, direction },
      context
    ) => {
      // await allMiddleware(context) // временно отключено для ФАП (PWA magic link) // MIDDLEWARE_REVIEW: allMiddleware
      const req = await loadRequestOrThrow(requestId)

      const field = getTransferField(direction)
      const service = req[field]
      if (!service?.plan?.enabled) throw new GraphQLError("Service is not enabled")
      if (service.status === "COMPLETED" || service.status === "CANCELLED") {
        throw new GraphQLError("Service is completed, no updates allowed")
      }

      const drivers = [...(service.drivers ?? [])]
      assertIndex(driverIndex, drivers.length, "driverIndex")
      const before = drivers[driverIndex]

      const applied = {}
      if (Object.prototype.hasOwnProperty.call(patch, "pickupAt")) {
        applied.pickupAt = patch.pickupAt
      }
      if (Object.prototype.hasOwnProperty.call(patch, "vehicleType")) {
        applied.vehicleType = patch.vehicleType
      }
      if (Object.prototype.hasOwnProperty.call(patch, "reportCost")) {
        applied.reportCost = patch.reportCost
      }
      if (Object.keys(applied).length === 0) return req

      drivers[driverIndex] = { ...before, ...applied }

      const updated = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: { [field]: { ...service, drivers } },
      })

      const log = buildDriverPatchDescription(before, applied, driverIndex, direction)
      await logPassengerRequestAction({
        context,
        action: "update_passenger_request_driver",
        description: log.short,
        fulldescription: log.full,
        oldData: req,
        newData: updated,
        airlineId: updated.airlineId,
        passengerRequestId: requestId,
        skipEmail: true
      })

      publishPassengerRequestUpdated(updated)

      return updated
    },

    removePassengerRequestDriver: async (
      _,
      { requestId, driverIndex, direction = "ARRIVAL" },
      context
    ) => {
      // await allMiddleware(context) // временно отключено для ФАП (PWA magic link) // MIDDLEWARE_REVIEW: allMiddleware
      const existing = await loadRequestOrThrow(requestId)

      const transferField = getTransferField(direction)
      const prev = existing[transferField] || emptyDriversService()
      const drivers = prev.drivers || []
      assertIndex(driverIndex, drivers.length, "driverIndex")

      const removedDriver = normalizePassengerServiceDriver(
        drivers[driverIndex]
      )
      const nextDrivers = drivers
        .filter((_, index) => index !== driverIndex)
        .map(normalizePassengerServiceDriver)
      const totalPeopleBefore = drivers.reduce(
        (sum, d) => sum + (Array.isArray(d.people) ? d.people.length : 0),
        0
      )
      const totalPeopleAfter = nextDrivers.reduce(
        (sum, d) => sum + (Array.isArray(d.people) ? d.people.length : 0),
        0
      )
      const recalc =
        nextDrivers.length === 0
          ? { status: "NEW", times: prev.times || {} }
          : recomputeServiceStatus(prev, totalPeopleBefore, totalPeopleAfter)

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: {
          [transferField]: {
            ...prev,
            status: recalc.status,
            times: recalc.times,
            drivers: nextDrivers
          }
        }
      })
      await logPassengerRequestAction({
        context,
        action: "remove_passenger_request_driver",
        description: "Водитель удален из трансфера ФАП",
        fulldescription: `Пользователь ${getSubjectName(context)} удалил водителя ${removedDriver?.fullName || `#${driverIndex}`} из трансфера ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
      })

      publishPassengerRequestUpdated(passengerRequest)

      return passengerRequest
    },

    addPassengerRequestBaggageDriver: async (
      _,
      { requestId, driver },
      context
    ) => {
      // await allMiddleware(context) // временно отключено для ФАП (PWA magic link) // MIDDLEWARE_REVIEW: allMiddleware
      const existing = await loadRequestOrThrow(requestId)
      if (!driver?.fullName?.trim()) {
        throw new GraphQLError("Driver fullName is required")
      }

      const prev = existing.baggageDeliveryService || emptyDriversService()

      const normalizedDriver = normalizePassengerServiceDriver(driver)
      const driverIndex = (prev.drivers || []).length
      const adminId =
        context.subjectType === "USER" ? context.subject?.id : null
      try {
        const linkPWA = await generateDriverLink({
          driverName: normalizedDriver.fullName,
          requestId,
          driverIndex,
          adminId,
          serviceKind: "baggage"
        })
        normalizedDriver.linkPWA = linkPWA
      } catch (e) {
        normalizedDriver.linkPWA = null
      }

      const drivers = [...(prev.drivers || []), normalizedDriver]

      const now = new Date()
      const isFirstDriver = (prev.drivers || []).length === 0
      const updatedStatus =
        isFirstDriver && prev.status === "NEW" ? "ACCEPTED" : prev.status
      const updatedTimes =
        isFirstDriver && prev.status === "NEW"
          ? { ...(prev.times || {}), acceptedAt: now }
          : prev.times || {}

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: {
          baggageDeliveryService: {
            ...prev,
            status: updatedStatus,
            times: updatedTimes,
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

      publishPassengerRequestUpdated(passengerRequest)

      return passengerRequest
    },

    removePassengerRequestBaggageDriver: async (
      _,
      { requestId, driverIndex },
      context
    ) => {
      // await allMiddleware(context) // временно отключено для ФАП (PWA magic link) // MIDDLEWARE_REVIEW: allMiddleware
      const existing = await loadRequestOrThrow(requestId)

      const prev = existing.baggageDeliveryService || emptyDriversService()
      const drivers = prev.drivers || []
      assertIndex(driverIndex, drivers.length, "driverIndex")

      const removedDriver = normalizePassengerServiceDriver(
        drivers[driverIndex]
      )
      const nextDrivers = drivers
        .filter((_, index) => index !== driverIndex)
        .map(normalizePassengerServiceDriver)
      const totalPeopleBefore = drivers.reduce(
        (sum, d) => sum + (Array.isArray(d.people) ? d.people.length : 0),
        0
      )
      const totalPeopleAfter = nextDrivers.reduce(
        (sum, d) => sum + (Array.isArray(d.people) ? d.people.length : 0),
        0
      )
      const recalc =
        nextDrivers.length === 0
          ? { status: "NEW", times: prev.times || {} }
          : recomputeServiceStatus(prev, totalPeopleBefore, totalPeopleAfter)

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: {
          baggageDeliveryService: {
            ...prev,
            status: recalc.status,
            times: recalc.times,
            drivers: nextDrivers
          }
        }
      })
      await logPassengerRequestAction({
        context,
        action: "remove_passenger_request_baggage_driver",
        description: "Водитель удален из доставки багажа ФАП",
        fulldescription: `Пользователь ${getSubjectName(context)} удалил водителя ${removedDriver?.fullName || `#${driverIndex}`} из доставки багажа ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
      })

      publishPassengerRequestUpdated(passengerRequest)

      return passengerRequest
    },

    acceptPassengerRequestBaggageOrder: async (
      _,
      { requestId, driverIndex },
      context
    ) => {
      const existing = await loadRequestOrThrow(requestId)

      const bds = existing.baggageDeliveryService
      if (!bds) throw new GraphQLError("BaggageDeliveryService not found")

      const drivers = bds.drivers ?? []
      if (driverIndex < 0 || driverIndex >= drivers.length) {
        throw new GraphQLError("Driver index out of range")
      }

      const now = new Date()
      const alreadyInProgress =
        bds.status === "IN_PROGRESS" ||
        bds.status === "COMPLETED" ||
        bds.status === "CANCELLED"
      const updatedStatus = alreadyInProgress ? bds.status : "IN_PROGRESS"
      const updatedTimes = alreadyInProgress
        ? bds.times || {}
        : { ...(bds.times || {}), inProgressAt: now }

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: {
          baggageDeliveryService: {
            ...bds,
            status: updatedStatus,
            times: updatedTimes
          }
        }
      })

      const driver = drivers[driverIndex]
      await logPassengerRequestAction({
        context,
        action: "accept_passenger_request_baggage_order",
        description: "Водитель принял заказ на доставку багажа ФАП",
        fulldescription: `Водитель ${driver?.fullName ?? driverIndex} принял заказ на доставку багажа (ФАП ${passengerRequest.flightNumber})`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
      })

      publishPassengerRequestUpdated(passengerRequest)

      return passengerRequest
    },

    completePassengerRequestBaggageDriverDelivery: async (
      _,
      { requestId, driverIndex },
      context
    ) => {
      // await allMiddleware(context) // временно отключено для ФАП (PWA magic link)
      const existing = await loadRequestOrThrow(requestId)

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

      publishPassengerRequestUpdated(passengerRequest)

      return passengerRequest
    },

    addPassengerRequestDriverPerson: async (
      _,
      { requestId, driverIndex, person, direction = "ARRIVAL" },
      context
    ) => {
      // await allMiddleware(context) // временно отключено для ФАП (PWA magic link)
      const existing = await loadRequestOrThrow(requestId)
      const personWithId = ensurePersonId(person)

      const transferField = getTransferField(direction)
      const prev = existing[transferField] || emptyDriversService()
      const drivers = prev.drivers || []
      assertIndex(driverIndex, drivers.length, "driverIndex")

      const driversClone = drivers.map((d, i) => {
        const normalized = normalizePassengerServiceDriver(d)
        if (i !== driverIndex) return normalized
        return {
          ...normalized,
          people: [...(normalized.people || []), ensureDriverPerson(personWithId)]
        }
      })

      const totalPeopleBefore = drivers.reduce(
        (sum, d) => sum + (Array.isArray(d.people) ? d.people.length : 0),
        0
      )
      const totalPeopleAfter = driversClone.reduce(
        (sum, d) => sum + (Array.isArray(d.people) ? d.people.length : 0),
        0
      )
      const recalc = recomputeServiceStatus(
        prev,
        totalPeopleBefore,
        totalPeopleAfter
      )
      const nextStatus = recalc.status
      const nextTimes = recalc.times

      const normalizedDriverPerson = ensureDriverPerson(personWithId)
      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: {
          [transferField]: {
            ...prev,
            drivers: driversClone,
            status: nextStatus,
            times: nextTimes
          },
          savedPassengers: mergeSavedPassengersForRequest(
            existing,
            snapshotFromDriverPerson(normalizedDriverPerson)
          )
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

      publishPassengerRequestUpdated(passengerRequest)

      return passengerRequest
    },

    addPassengerRequestDriverPeople: async (
      _,
      { requestId, driverIndex, people, direction = "ARRIVAL" },
      context
    ) => {
      // await allMiddleware(context) // временно отключено для ФАП (PWA magic link)
      if (!Array.isArray(people) || people.length === 0) {
        throw new GraphQLError("people must be a non-empty array")
      }
      const existing = await loadRequestOrThrow(requestId)
      const peopleWithId = people.map(ensurePersonId)

      const transferField = getTransferField(direction)
      const prev = existing[transferField] || emptyDriversService()
      const drivers = prev.drivers || []
      assertIndex(driverIndex, drivers.length, "driverIndex")

      const driversClone = drivers.map((d, i) => {
        const normalized = normalizePassengerServiceDriver(d)
        if (i !== driverIndex) return normalized
        const added = peopleWithId.map((p) => ensureDriverPerson(p))
        return {
          ...normalized,
          people: [...(normalized.people || []), ...added]
        }
      })

      const totalPeopleBefore = drivers.reduce(
        (sum, d) => sum + (Array.isArray(d.people) ? d.people.length : 0),
        0
      )
      const totalPeopleAfter = driversClone.reduce(
        (sum, d) => sum + (Array.isArray(d.people) ? d.people.length : 0),
        0
      )
      const recalc = recomputeServiceStatus(
        prev,
        totalPeopleBefore,
        totalPeopleAfter
      )
      const nextStatus = recalc.status
      const nextTimes = recalc.times

      let savedPassengers = existing.savedPassengers
      for (const p of peopleWithId) {
        savedPassengers = upsertSavedPassenger(
          savedPassengers,
          snapshotFromDriverPerson(ensureDriverPerson(p))
        )
      }

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: {
          [transferField]: {
            ...prev,
            drivers: driversClone,
            status: nextStatus,
            times: nextTimes
          },
          savedPassengers
        }
      })
      await logPassengerRequestAction({
        context,
        action: "add_passenger_request_driver_people",
        description: `Пакетно добавлены пассажиры к водителю трансфера ФАП (${people.length})`,
        fulldescription: `Пользователь ${getSubjectName(context)} добавил ${people.length} пассажиров к водителю #${driverIndex} в ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
      })

      publishPassengerRequestUpdated(passengerRequest)

      return passengerRequest
    },

    updatePassengerRequestDriverPerson: async (
      _,
      { requestId, driverIndex, personIndex, person, direction = "ARRIVAL" },
      context
    ) => {
      // await allMiddleware(context) // временно отключено для ФАП (PWA magic link)
      const existing = await loadRequestOrThrow(requestId)

      const transferField = getTransferField(direction)
      const prev = existing[transferField] || emptyDriversService()
      const drivers = prev.drivers || []
      assertIndex(driverIndex, drivers.length, "driverIndex")
      const people = drivers[driverIndex].people || []
      assertIndex(personIndex, people.length, "personIndex")

      const driversClone = drivers.map((d, i) => {
        const normalized = normalizePassengerServiceDriver(d)
        if (i !== driverIndex) return normalized
        const newPeople = [...(normalized.people || [])]
        const prevPerson = newPeople[personIndex]
        newPeople[personIndex] = ensureDriverPerson({
          ...person,
          personId: person?.personId ?? prevPerson?.personId ?? null
        })
        return { ...normalized, people: newPeople }
      })

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: {
          [transferField]: { ...prev, drivers: driversClone },
          savedPassengers: patchSavedPersonIdentity(
            existing.savedPassengers,
            driversClone[driverIndex].people[personIndex]
          )
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

      publishPassengerRequestUpdated(passengerRequest)

      return passengerRequest
    },

    removePassengerRequestDriverPerson: async (
      _,
      { requestId, driverIndex, personIndex, direction = "ARRIVAL" },
      context
    ) => {
      // await allMiddleware(context) // временно отключено для ФАП (PWA magic link)
      const existing = await loadRequestOrThrow(requestId)

      const transferField = getTransferField(direction)
      const prev = existing[transferField] || emptyDriversService()
      const drivers = prev.drivers || []
      assertIndex(driverIndex, drivers.length, "driverIndex")
      const people = drivers[driverIndex].people || []
      assertIndex(personIndex, people.length, "personIndex")

      const driversClone = drivers.map((d, i) => {
        const normalized = normalizePassengerServiceDriver(d)
        if (i !== driverIndex) return normalized
        const newPeople = [...(normalized.people || [])]
        newPeople.splice(personIndex, 1)
        return { ...normalized, people: newPeople }
      })

      const totalPeopleBefore = drivers.reduce(
        (sum, d) => sum + (Array.isArray(d.people) ? d.people.length : 0),
        0
      )
      const totalPeopleAfter = driversClone.reduce(
        (sum, d) => sum + (Array.isArray(d.people) ? d.people.length : 0),
        0
      )
      const recalc = recomputeServiceStatus(
        prev,
        totalPeopleBefore,
        totalPeopleAfter
      )

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: {
          [transferField]: {
            ...prev,
            drivers: driversClone,
            status: recalc.status,
            times: recalc.times
          }
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

      publishPassengerRequestUpdated(passengerRequest)

      return passengerRequest
    },

    completePassengerRequestWaterEarly: async (
      _,
      { requestId, reason },
      context
    ) => {
      // await allMiddleware(context) // временно отключено для ФАП (PWA magic link) // MIDDLEWARE_REVIEW: allMiddleware
      const existing = await loadRequestOrThrow(requestId)
      const cleanReason = assertReason(reason)

      const prev = existing.waterService || emptyPeopleService()

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: {
          waterService: {
            ...prev,
            status: "COMPLETED",
            times: updateTimes(prev.times, "COMPLETED"),
            earlyCompletionReason: cleanReason,
            earlyCompletedAt: new Date()
          }
        }
      })
      await logPassengerRequestAction({
        context,
        action: "complete_passenger_request_water_early",
        reason: cleanReason,
        description: "Досрочно завершен сервис воды ФАП",
        fulldescription: `Пользователь ${getSubjectName(context)} досрочно завершил сервис воды ФАП ${passengerRequest.flightNumber}`,
        passengerRequestId: passengerRequest.id,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId
      })

      publishPassengerRequestUpdated(passengerRequest)

      return passengerRequest
    },

    completePassengerRequestMealEarly: async (
      _,
      { requestId, reason },
      context
    ) => {
      // await allMiddleware(context) // временно отключено для ФАП (PWA magic link) // MIDDLEWARE_REVIEW: allMiddleware
      const existing = await loadRequestOrThrow(requestId)
      const cleanReason = assertReason(reason)

      const prev = existing.mealService || emptyPeopleService()

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: {
          mealService: {
            ...prev,
            status: "COMPLETED",
            times: updateTimes(prev.times, "COMPLETED"),
            earlyCompletionReason: cleanReason,
            earlyCompletedAt: new Date()
          }
        }
      })
      await logPassengerRequestAction({
        context,
        action: "complete_passenger_request_meal_early",
        reason: cleanReason,
        description: "Досрочно завершен сервис питания ФАП",
        fulldescription: `Пользователь ${getSubjectName(context)} досрочно завершил сервис питания ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
      })

      publishPassengerRequestUpdated(passengerRequest)

      return passengerRequest
    },

    completePassengerRequestBaggageEarly: async (
      _,
      { requestId, reason },
      context
    ) => {
      // await allMiddleware(context) // временно отключено для ФАП (PWA magic link) // MIDDLEWARE_REVIEW: allMiddleware
      const existing = await loadRequestOrThrow(requestId)
      const cleanReason = assertReason(reason)

      const prev = existing.baggageDeliveryService || emptyDriversService()

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
        reason: cleanReason,
        description: "Досрочно завершена услуга «Доставка багажа» ФАП",
        fulldescription: `Пользователь ${getSubjectName(context)} досрочно завершил услугу «Доставка багажа» ФАП ${passengerRequest.flightNumber}. Причина: ${cleanReason}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
      })

      publishPassengerRequestUpdated(passengerRequest)

      return passengerRequest
    },

    completePassengerRequestTransferEarly: async (
      _,
      { requestId, reason, direction = "ARRIVAL" },
      context
    ) => {
      // await allMiddleware(context) // временно отключено для ФАП (PWA magic link) // MIDDLEWARE_REVIEW: allMiddleware
      const existing = await loadRequestOrThrow(requestId)
      const cleanReason = assertReason(reason)

      const transferField = getTransferField(direction)
      const prev = existing[transferField] || emptyDriversService()

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: {
          [transferField]: {
            ...prev,
            status: "COMPLETED",
            times: updateTimes(prev.times, "COMPLETED"),
            earlyCompletionReason: cleanReason,
            earlyCompletedAt: new Date()
          }
        }
      })
      await logPassengerRequestAction({
        context,
        action: "complete_passenger_request_transfer_early",
        reason: cleanReason,
        description: "Досрочно завершена услуга «Трансфер» ФАП",
        fulldescription: `Пользователь ${getSubjectName(context)} досрочно завершил услугу «Трансфер» ФАП ${passengerRequest.flightNumber}. Причина: ${cleanReason}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
      })

      publishPassengerRequestUpdated(passengerRequest)

      return passengerRequest
    },

    completePassengerRequestLivingEarly: async (
      _,
      { requestId, reason },
      context
    ) => {
      // await allMiddleware(context) // временно отключено для ФАП (PWA magic link) // MIDDLEWARE_REVIEW: allMiddleware
      const existing = await loadRequestOrThrow(requestId)
      const cleanReason = assertReason(reason)

      const prev = existing.livingService || emptyLivingService()

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: {
          livingService: {
            ...prev,
            status: "COMPLETED",
            times: updateTimes(prev.times, "COMPLETED"),
            earlyCompletionReason: cleanReason,
            earlyCompletedAt: new Date()
          }
        }
      })
      await logPassengerRequestAction({
        context,
        action: "complete_passenger_request_living_early",
        reason: cleanReason,
        description: "Досрочно завершена услуга «Проживание» ФАП",
        fulldescription: `Пользователь ${getSubjectName(context)} досрочно завершил услугу «Проживание» ФАП ${passengerRequest.flightNumber}. Причина: ${cleanReason}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
      })

      publishPassengerRequestUpdated(passengerRequest)

      return passengerRequest
    },

    completePassengerRequestEarly: async (_, { id, reason }, context) => {
      // await allMiddleware(context) // временно отключено для ФАП (PWA magic link) // MIDDLEWARE_REVIEW: allMiddleware
      const existing = await loadRequestOrThrow(id)
      const cleanReason = assertReason(reason)

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id },
        data: {
          status: "COMPLETED",
          statusTimes: updateTimes(existing.statusTimes, "COMPLETED"),
          earlyCompletionReason: cleanReason,
          earlyCompletedAt: new Date()
        }
      })
      await logPassengerRequestAction({
        context,
        action: "complete_passenger_request_early",
        reason: cleanReason,
        description: "ФАП завершен досрочно",
        fulldescription: `Пользователь ${getSubjectName(context)} досрочно завершил ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
      })

      publishPassengerRequestUpdated(passengerRequest)

      return passengerRequest
    },

    relocatePassengerRequestHotelPerson: async (
      _,
      { requestId, fromHotelIndex, toHotelIndex, personIndex, reason, movedAt },
      context
    ) => {
      // await allMiddleware(context) // временно отключено для ФАП (PWA magic link) // MIDDLEWARE_REVIEW: allMiddleware
      const existing = await loadRequestOrThrow(requestId)
      const cleanReason = assertReason(reason)

      const living = existing.livingService || emptyLivingService()
      const hotels = living.hotels || []
      assertIndex(fromHotelIndex, hotels.length, "fromHotelIndex")
      assertIndex(toHotelIndex, hotels.length, "toHotelIndex")
      if (fromHotelIndex === toHotelIndex) {
        throw new GraphQLError(
          "fromHotelIndex and toHotelIndex must be different"
        )
      }

      const sourcePeople = hotels[fromHotelIndex].people || []
      assertIndex(personIndex, sourcePeople.length, "personIndex")

      const relocationDate = movedAt ? new Date(movedAt) : new Date()
      const sourceHotel = hotels[fromHotelIndex]
      const targetHotel = hotels[toHotelIndex]

      // Проверка вместимости целевого отеля
      const targetCapacity = Number(targetHotel?.peopleCount) || 0
      const targetPlaced = (targetHotel?.people || []).length
      if (targetCapacity > 0 && targetPlaced >= targetCapacity) {
        throw new GraphQLError(
          `В гостинице «${targetHotel?.name || `#${toHotelIndex}`}» нет свободных мест (${targetPlaced}/${targetCapacity})`
        )
      }
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
        reason: cleanReason
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
        reason: cleanReason,
        description: "Пассажир переселен между отелями ФАП",
        fulldescription: `Пользователь ${getSubjectName(context)} переселил пассажира в ФАП ${passengerRequest.flightNumber} из отеля #${fromHotelIndex} в отель #${toHotelIndex}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id,
        emailExtras: {
          hotelName: targetHotel?.name,
          personName: person?.fullName
        }
      })

      publishPassengerRequestUpdated(passengerRequest)

      await notifyPassengerRequestSite({
        action: "update_hotel_chess_passenger_request",
        passengerRequestId: passengerRequest.id,
        airlineId: passengerRequest.airlineId,
        hotelId: targetHotel?.hotelId || undefined,
        descriptionHtml: `В ФАП <span style='color:#545873'>${passengerRequest.flightNumber}</span> переселение пассажира: отель #${fromHotelIndex} → #${toHotelIndex}`,
        __typename: "PassengerRequestUpdatedNotification"
      })

      return passengerRequest
    },

    evictPassengerRequestHotelPerson: async (
      _,
      { requestId, hotelIndex, personIndex, reason, evictedAt },
      context
    ) => {
      // await allMiddleware(context) // временно отключено для ФАП (PWA magic link) // MIDDLEWARE_REVIEW: allMiddleware
      const existing = await loadRequestOrThrow(requestId)
      const cleanReason = assertReason(reason)

      const living = existing.livingService || emptyLivingService()
      const hotels = living.hotels || []
      assertIndex(hotelIndex, hotels.length, "hotelIndex")
      const people = hotels[hotelIndex].people || []
      assertIndex(personIndex, people.length, "personIndex")

      const evictionDate = evictedAt ? new Date(evictedAt) : new Date()
      const hotel = hotels[hotelIndex]
      const person = ensureHotelPerson(
        people[personIndex],
        hotelIndex,
        hotel?.name
      )

      const chesses = [...(person.accommodationChesses || [])]
      const openIndex = [...chesses].reverse().findIndex((item) => !item?.endAt)
      if (openIndex !== -1) {
        const idx = chesses.length - 1 - openIndex
        chesses[idx] = {
          ...chesses[idx],
          endAt: evictionDate,
          reason: cleanReason
        }
      } else {
        chesses.push({
          hotelIndex,
          hotelName: hotel?.name || null,
          startAt: evictionDate,
          endAt: evictionDate,
          reason: cleanReason
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
          reason: cleanReason,
          evictedAt: evictionDate
        }
      ]

      const totalPeopleBefore = (hotels || []).reduce(
        (sum, h) => sum + (Array.isArray(h.people) ? h.people.length : 0),
        0
      )
      const totalPeopleAfter = hotelsClone.reduce(
        (sum, h) => sum + (Array.isArray(h.people) ? h.people.length : 0),
        0
      )
      const recalc = recomputeServiceStatus(
        living,
        totalPeopleBefore,
        totalPeopleAfter
      )

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: {
          livingService: {
            ...living,
            hotels: hotelsClone,
            evictions,
            status: recalc.status,
            times: recalc.times
          }
        }
      })
      await logPassengerRequestAction({
        context,
        action: "evict_passenger_request_hotel_person",
        reason: cleanReason,
        description: "Пассажир выселен из отеля ФАП",
        fulldescription: `Пользователь ${getSubjectName(context)} выселил пассажира из отеля #${hotelIndex} в ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id,
        emailExtras: {
          hotelName: hotel?.name,
          personName: person?.fullName
        }
      })

      publishPassengerRequestUpdated(passengerRequest)

      await notifyPassengerRequestSite({
        action: "update_hotel_chess_passenger_request",
        passengerRequestId: passengerRequest.id,
        airlineId: passengerRequest.airlineId,
        hotelId: hotel?.hotelId || undefined,
        descriptionHtml: `В ФАП <span style='color:#545873'>${passengerRequest.flightNumber}</span> выселение пассажира из отеля <span style='color:#545873'>${hotel?.name ?? "#" + hotelIndex}</span>`,
        __typename: "PassengerRequestUpdatedNotification"
      })

      return passengerRequest
    },

    savePassengerRequestHotelReport: async (
      _,
      { requestId, hotelIndex, reportRows },
      context
    ) => {
      // await allMiddleware(context) // временно отключено для ФАП (PWA magic link) // MIDDLEWARE_REVIEW: allMiddleware
      const existing = await loadRequestOrThrow(requestId)

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

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
import {
  upsertGroup,
  removeGroup,
  stripPersonFromGroups
} from "../../services/passengerRequest/passengerGroups.js"
import {
  normalizeDriverPerson,
  normalizeDriversForWrite,
  tripReportCost,
  collectBaggageDriverPatch
} from "../../services/passengerRequest/baggageDelivery.js"
import {
  ensureDriverIds,
  findStaleDriverLinks,
  newDriverId,
  readLinkDriverIndex
} from "../../services/passengerRequest/serviceDrivers.js"
import {
  normalizeBulkIndexes,
  spliceAtIndexes
} from "../../services/passengerRequest/bulkHotelPeople.js"
import { hydratePassengerRequest } from "../../services/passengerRequest/hydratePassengerRequest.js"
import { reportRowsEqual } from "../../services/passengerRequest/hotelReportRows.js"
import { recognizePassengerDocument as recognizeDocumentService } from "../../services/docRecognition/recognizePassengerDocument.js"
import { recognitionRateLimiter } from "../../services/docRecognition/recognitionRateLimit.js"
import { logger } from "../../services/infra/logger.js"
import {
  recomputeServiceStatus,
  resolveDriverCountStatus,
  transferFactCount
} from "../../services/passengerRequest/serviceStatus.js"
import {
  deleteAllPassengerRequestFilesFromDisk,
  deletePassengerRequestFileFromDisk,
  findPassengerRequestFileIndex,
  uploadPassengerRequestFiles
} from "../../services/passengerRequest/files.js"
import { withFapAuthGuard } from "../../services/passengerRequest/fapAccess.js"
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
  revokeDriverExternalAccess,
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
  driverId,
  adminId,
  serviceKind = "transfer"
}) {
  const externalUser = await upsertDriverExternalUser({
    requestId,
    driverName,
    serviceKind,
    driverIndex,
    driverId
  })

  return issueExternalDriverPwaLink({
    externalUserId: externalUser.id,
    createdByAdminId: adminId || null,
    passengerRequestId: requestId,
    driverIndex,
    driverId,
    serviceKind
  })
}

// После удаления водителя индексы выживших съезжают, и ссылки, выпущенные до
// появления driverId, начинают указывать на чужую запись. Такие ссылки
// перевыпускаем на новый адрес, а старый доступ гасим — иначе водитель
// вернётся по прежней ссылке и снова попадёт не к себе.
// Мутирует переданный массив: линки правим до записи в БД.
async function reissueShiftedDriverLinks({
  requestId,
  serviceKind,
  drivers,
  removedIndex,
  adminId
}) {
  for (const { index, driver } of findStaleDriverLinks(drivers, removedIndex)) {
    const previousIndex = readLinkDriverIndex(driver.linkPWA)
    try {
      const linkPWA = await generateDriverLink({
        driverName: driver.fullName,
        requestId,
        driverIndex: index,
        driverId: driver.id,
        adminId,
        serviceKind
      })
      drivers[index] = { ...driver, linkPWA }
    } catch (e) {
      // Ссылку на чужую запись оставлять нельзя: без ссылки безопаснее.
      drivers[index] = { ...driver, linkPWA: null }
      continue
    }
    if (previousIndex == null || previousIndex === index) continue
    try {
      await revokeDriverExternalAccess({
        requestId,
        serviceKind,
        driverIndex: previousIndex
      })
    } catch (e) {
      // Новая ссылка уже выпущена — гашение старой лучшее из возможного.
    }
  }
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
// ВНИМАНИЕ: мутации читают заявку ТОЛЬКО отсюда — это сырьё из Prisma, и менять
// это на hydratePassengerRequest нельзя. Гидрация накладывает на пассажира ключ
// seat, которого нет в composite-типе PassengerServiceDriverPerson, а
// normalizeDriversForWrite пассажиров не фильтрует, а спредит как есть — любой
// путь записи водителей, прочитавший заявку через гидрацию, упадёт на неизвестном
// аргументе. Гидрация — исключительно для чтения и публикации в подписку.
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

// Белый список полей пассажира остаётся здесь: в composite-тип не должно утечь
// ничего лишнего. Три поля доставки багажа (бирки, цена, адрес) не нормализуем
// повторно — отдаём сырьё в normalizeDriverPerson, чтобы правила жили в одном
// месте (там же чинится null в baggageTags у легаси-пассажиров).
const ensureDriverPerson = (p) =>
  normalizeDriverPerson({
    personId: p?.personId ?? null,
    fullName: (p?.fullName?.trim?.() ?? "") || "",
    phone: normalizeOptionalString(p?.phone),
    personType: normalizePersonType(p?.personType),
    personCategory: normalizePersonCategory(p?.personCategory),
    airlinePersonalId: normalizeOptionalString(p?.airlinePersonalId),
    baggageTags: p?.baggageTags,
    reportCost: p?.reportCost,
    addressTo: p?.addressTo
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
  hotelItemId: normalizeOptionalString(driver?.hotelItemId),
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
  if ("transportedCount" in applied) {
    diffs.push(
      `перевезено: ${before?.transportedCount ?? "—"} → ${applied.transportedCount ?? "—"}`
    )
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

function buildBaggageDriverPatchDescription(before, applied, driverIndex) {
  // Метка — по водителю: поездка теперь везёт список пассажиров, и имя первого
  // из них в заголовке лога вводило бы в заблуждение.
  const label = before?.fullName ? `«${before.fullName}»` : `#${driverIndex + 1}`
  const diffs = []
  if ("peopleCount" in applied) {
    diffs.push(
      `ожидаемое кол-во пассажиров: ${before?.peopleCount ?? "—"} → ${applied.peopleCount ?? "—"}`
    )
  }
  if ("vehicleType" in applied) {
    diffs.push(`тип ТС: "${before?.vehicleType ?? ""}" → "${applied.vehicleType ?? ""}"`)
  }
  if ("deliveryCompletedAt" in applied) {
    diffs.push(
      `дата доставки: ${fmtPickupForLog(before?.deliveryCompletedAt)} → ${fmtPickupForLog(applied.deliveryCompletedAt)}`
    )
  }
  if ("people" in applied) {
    // Бирок и суммы в патче больше нет: бирки живут на пассажире, сумма поездки
    // производная. Поэтому описываем состав пассажиров и его цену.
    const from = (before?.people ?? []).length
    const to = (applied.people ?? []).length
    // «—», а не 0: у поездки без пассажиров суммы нет, считать не из чего.
    const fromCost = tripReportCost(before?.people) ?? "—"
    const toCost = tripReportCost(applied.people) ?? "—"
    diffs.push(
      `пассажиры: ${from} → ${to}, сумма поездки: ${fromCost} → ${toCost}`
    )
  }
  // Ветки «изменений нет» здесь быть не может: collectBaggageDriverPatch отдаёт
  // только эти ключи, а пустой патч резолвер отсекает раньше.
  return {
    short: `Доставка багажа ${label}: ${diffs.join(", ")}`,
    full: `Доставка багажа ${label}. Изменения: ${diffs.join("; ")}.`
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

// АУТЕНТИФИКАЦИЯ. Query, мутации и подписки этого модуля защищены обёрткой
// withFapAuthGuard на экспорте (services/passengerRequest/fapAccess.js): она
// требует, чтобы у вызывающего был субъект допустимого типа. Секции полей
// типов обёрткой не покрыты. Почти все они достижимы только через уже
// защищённые корневые поля модуля; исключение — Notification.passengerRequest
// (dispatcher.resolver.js), но тот путь закрыт активным allMiddleware и
// доступен только субъектам USER.
//
// АВТОРИЗАЦИИ здесь нет: ни ролевых проверок, ни изоляции по авиакомпании.
// Роль проверить нечем — у ExternalUser нет поля role, и любая ролевая
// проверка отбила бы весь PWA, который живёт на магик-линках. Раньше на этом
// месте было 50 закомментированных вызовов middleware, рассыпанных по всему
// модулю; они удалены как вводящие в заблуждение — включение любого из них
// ломает магик-линк.
//
// У подписок проверка одноразовая, в момент subscribe: уже открытый поток
// не перепроверяется, когда токен протухает.
//
// Полноценная авторизация запланирована отдельно. Для гостиниц и водителей
// данные уже есть (ExternalUser.scope/hotelId/driverId), для изоляции по
// авиакомпании — нет.
const passengerRequestResolvers = {
  // --------- поля связей ---------
  PassengerRequest: {
    savedPassengers: (parent) => dedupeSavedPassengers(parent.savedPassengers),

    // legacy-заявки без поля → [] (в схеме список non-null)
    passengerGroups: (parent) =>
      Array.isArray(parent.passengerGroups) ? parent.passengerGroups : [],

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

  // У пассажиров, заведённых до появления поля, Prisma отдаёт baggageTags как
  // null, а схема обещает [String!]! — без этого резолвера запрос падает.
  PassengerServiceDriverPerson: {
    baggageTags: (parent) =>
      Array.isArray(parent.baggageTags) ? parent.baggageTags : []
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

      // Поиск и период оба используют внутренний OR — кладём их в where.AND,
      // чтобы условия не затирали друг друга.
      const and = []

      if (filter?.search) {
        const search = filter.search.trim()
        if (search) {
          and.push({
            OR: [
              { requestNumber: { contains: search, mode: "insensitive" } },
              { flightNumber: { contains: search, mode: "insensitive" } },
              { routeFrom: { contains: search, mode: "insensitive" } },
              { routeTo: { contains: search, mode: "insensitive" } }
            ]
          })
        }
      }

      // Период: по дате рейса; заявки без flightDate (null ИЛИ unset — в Mongo это
      // разные вещи, ловим обе через isSet) — по дате создания.
      if (filter?.dateFrom || filter?.dateTo) {
        const range = {}
        if (filter.dateFrom) range.gte = new Date(filter.dateFrom)
        if (filter.dateTo) range.lte = new Date(filter.dateTo)
        const flightDateMissing = {
          OR: [{ flightDate: null }, { flightDate: { isSet: false } }]
        }
        and.push({
          OR: [
            { flightDate: range },
            { AND: [flightDateMissing, { createdAt: range }] }
          ]
        })
      }

      if (and.length) where.AND = and

      const list = await prisma.passengerRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: skip ?? undefined,
        take: take ?? undefined
      })
      return list.map(hydratePassengerRequest)
    },

    passengerRequest: async (_, { id }, context) => {
      const req = await prisma.passengerRequest.findUnique({ where: { id } })
      return req ? hydratePassengerRequest(req) : null
    }
  },

  // --------- мутации ---------
  Mutation: {
    // создание
    createPassengerRequest: async (_, { input, files }, context) => {
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

      // Факт услуги: список либо «перевезено N» на поездке (max), см. serviceStatus.js.
      // Для багажа transportedCount пуст — поведение прежнее.
      const totalDriverPeople = (drivers) => transferFactCount(drivers)
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
          drivers: normalizeDriversForWrite(prev.drivers),
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
          drivers: normalizeDriversForWrite(prev.drivers),
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
          drivers: normalizeDriversForWrite(prev.drivers),
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
          drivers: normalizeDriversForWrite(prev.drivers),
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

      // удалённый человек уходит и из групп; опустевшие группы удаляются
      const passengerGroups = stripPersonFromGroups(
        existing.passengerGroups,
        personId
      )

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: { savedPassengers, passengerGroups }
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

    setPassengerRequestGroup: async (_, { requestId, group }, context) => {
      const existing = await loadRequestOrThrow(requestId)

      const passengerGroups = upsertGroup(
        existing.passengerGroups,
        group,
        existing.savedPassengers
      )

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: { passengerGroups }
      })

      await logPassengerRequestAction({
        context,
        action: "set_passenger_request_group",
        description: "Группа пассажиров сохранена",
        fulldescription: `Пользователь ${getSubjectName(context)} сохранил группу пассажиров в ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
      })

      publishPassengerRequestUpdated(passengerRequest)

      return passengerRequest
    },

    removePassengerRequestGroup: async (_, { requestId, groupId }, context) => {
      const existing = await loadRequestOrThrow(requestId)

      const passengerGroups = removeGroup(existing.passengerGroups, groupId)

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: { passengerGroups }
      })

      await logPassengerRequestAction({
        context,
        action: "remove_passenger_request_group",
        description: "Группа пассажиров расформирована",
        fulldescription: `Пользователь ${getSubjectName(context)} расформировал группу пассажиров в ФАП ${passengerRequest.flightNumber}`,
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
          drivers: normalizeDriversForWrite(prev.drivers),
          status,
          times: updateTimes(prev.times, status)
        }
      } else if (service === "DEPARTURE_TRANSFER") {
        const prev = existing.departureTransferService || { drivers: [] }
        data.departureTransferService = {
          ...prev,
          drivers: normalizeDriversForWrite(prev.drivers),
          status,
          times: updateTimes(prev.times, status)
        }
      } else if (service === "INTERCITY_TRANSFER") {
        const prev = existing.intercityTransferService || { drivers: [] }
        data.intercityTransferService = {
          ...prev,
          drivers: normalizeDriversForWrite(prev.drivers),
          status,
          times: updateTimes(prev.times, status)
        }
      } else if (service === "BAGGAGE_DELIVERY") {
        const prev = existing.baggageDeliveryService || { drivers: [] }
        data.baggageDeliveryService = {
          ...prev,
          drivers: normalizeDriversForWrite(prev.drivers),
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
      // Каждый вызов стоит двух платных обращений в Yandex Cloud, поэтому
      // считаем по субъекту. Анонимных вызовов здесь уже не бывает — их
      // отбивает withFapAuthGuard на экспорте модуля.
      //
      // http-статус намеренно НЕ ставим: Apollo Client на любом статусе ≥300
      // бросает ServerError с пустым graphQLErrors, и текст сообщения до
      // клиента не доходит вовсе. Обычная GraphQL-ошибка с кодом читается.
      if (!recognitionRateLimiter.check(context?.subject?.id)) {
        logger.warn(
          `[FAP] Распознавание документа отклонено лимитом, субъект ${context?.subject?.id}`
        )
        throw new GraphQLError("Слишком много запросов на распознавание", {
          extensions: { code: "TOO_MANY_REQUESTS" }
        })
      }
      return await recognizeDocumentService(image)
    },

    // добавить ФИО из скана / вручную
    addPassengerRequestPerson: async (
      _,
      { requestId, service, person },
      context
    ) => {
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

    // массовое удаление получателей воды/питания
    removePassengerRequestPeople: async (
      _,
      { requestId, service, personIndexes },
      context
    ) => {
      const existing = await loadRequestOrThrow(requestId)

      if (service !== "WATER" && service !== "MEAL") {
        throw new GraphQLError("PassengerWaterFoodKind must be WATER or MEAL")
      }
      const serviceField = service === "WATER" ? "waterService" : "mealService"

      const prev = existing[serviceField] || emptyPeopleService()
      const prevPeople = prev.people || []

      // Валидация ДО изменений: пачка применяется целиком либо не применяется вовсе.
      const indexes = normalizeBulkIndexes(personIndexes)
      if (indexes.length === 0) {
        throw new GraphQLError("Не выбран ни один получатель")
      }
      for (const idx of indexes) {
        assertIndex(idx, prevPeople.length, "personIndex")
      }

      const { next: people } = spliceAtIndexes(prevPeople, indexes)

      // Статус услуги пересчитываем ОДИН раз по итогу всей пачки.
      const recalc = recomputeServiceStatus(
        prev,
        prevPeople.length,
        people.length
      )

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: {
          [serviceField]: {
            ...prev,
            people,
            status: recalc.status,
            times: recalc.times
          }
        }
      })

      await logPassengerRequestAction({
        context,
        action: "remove_passenger_request_people",
        description: `Получатели удалены из сервиса: ${service}`,
        fulldescription: `Пользователь ${getSubjectName(context)} удалил получателей (${indexes.length}) в сервисе ${service} ФАП ${passengerRequest.flightNumber}`,
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
        description: `Гостиница добавлена в ФАП: ${hotelWithItemId.name}`,
        fulldescription: `Пользователь ${getSubjectName(context)} добавил гостиницу ${hotelWithItemId.name} в ФАП ${passengerRequest.flightNumber}`,
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
        descriptionHtml: `В ФАП <span style='color:#545873'>${passengerRequest.flightNumber}</span> добавлена гостиница <span style='color:#545873'>${hotelWithItemId.name}</span>`,
        __typename: "PassengerRequestUpdatedNotification"
      })

      return passengerRequest
    },

    removePassengerRequestHotel: async (
      _,
      { requestId, hotelIndex },
      context
    ) => {
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

      // привязка поездок к удалённой гостинице снимается — как и остальные ссылки на отель
      // услуги без таких поездок не переписываем
      const detachedDriverServices = {}
      if (removedHotel?.itemId) {
        for (const serviceField of [
          "transferService",
          "departureTransferService",
          "intercityTransferService",
          "baggageDeliveryService"
        ]) {
          const prevService = existing[serviceField]
          const hasLinked = (prevService?.drivers || []).some(
            (d) => d?.hotelItemId === removedHotel.itemId
          )
          if (!hasLinked) continue
          detachedDriverServices[serviceField] = {
            ...prevService,
            drivers: normalizeDriversForWrite(prevService.drivers).map((d) =>
              d.hotelItemId === removedHotel.itemId
                ? { ...d, hotelItemId: null }
                : d
            )
          }
        }
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
            livingService: nextLivingService,
            ...detachedDriverServices
          }
        })
      ])

      await logPassengerRequestAction({
        context,
        action: "remove_passenger_request_hotel",
        description: `Гостиница удалена из ФАП: ${removedHotel?.name || "без названия"}`,
        fulldescription: `Пользователь ${getSubjectName(context)} удалил гостиницу ${removedHotel?.name || "без названия"} из ФАП ${passengerRequest.flightNumber}`,
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
        descriptionHtml: `В ФАП <span style='color:#545873'>${passengerRequest.flightNumber}</span> удалена гостиница <span style='color:#545873'>${removedHotel?.name || "без названия"}</span>`,
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
        description: `Гостиница обновлена в ФАП: ${updatedHotel.name || "без названия"}`,
        fulldescription: `Пользователь ${getSubjectName(context)} обновил гостиницу ${updatedHotel.name || "без названия"} в ФАП ${passengerRequest.flightNumber} (мест: ${updatedHotel.peopleCount})`,
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
        descriptionHtml: `В ФАП <span style='color:#545873'>${passengerRequest.flightNumber}</span> обновлена гостиница <span style='color:#545873'>${updatedHotel.name || "без названия"}</span>`,
        __typename: "PassengerRequestUpdatedNotification"
      })

      return passengerRequest
    },

    addPassengerRequestHotelPerson: async (
      _,
      { requestId, hotelIndex, person },
      context
    ) => {
      const existing = await loadRequestOrThrow(requestId)
      const personWithId = ensurePersonId(person)

      const living = existing.livingService || emptyLivingService()
      const hotels = living.hotels || []
      assertIndex(hotelIndex, hotels.length, "hotelIndex")
      // Порог перебора считаем по КОНКРЕТНОЙ гостинице: totalPeopleBefore/After ниже
      // считаются по всей услуге и для этого не годятся.
      const overbookHotel = hotels[hotelIndex] || {}
      const overbookCapacity = Number(overbookHotel.peopleCount) || 0
      const overbookPlacedBefore = (overbookHotel.people || []).length
      const overbookPlacedAfter = overbookPlacedBefore + 1
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
        description: "Пассажир добавлен в гостиницу ФАП",
        fulldescription: `Пользователь ${getSubjectName(context)} добавил пассажира в гостиницу ФАП ${passengerRequest.flightNumber}`,
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

      // Уведомляем ТОЛЬКО при переходе через порог, иначе каждый следующий гость сверх
      // заявки плодит новую запись.
      if (
        overbookCapacity > 0 &&
        overbookPlacedBefore <= overbookCapacity &&
        overbookPlacedAfter > overbookCapacity
      ) {
        // Уведомление не должно ронять уже совершённое добавление: гость записан,
        // и ошибка на этом шаге заставила бы оператора отсканировать его повторно.
        try {
          await notifyPassengerRequestSite({
            action: "passenger_request_hotel_overbooked",
            passengerRequestId: passengerRequest.id,
            airlineId: passengerRequest.airlineId,
            hotelId: overbookHotel.hotelId || undefined,
            descriptionHtml: `В ФАП <span style='color:#545873'>${passengerRequest.flightNumber}</span> в гостинице <span style='color:#545873'>${overbookHotel.name || "без названия"}</span> заселено <span style='color:#545873'>${overbookPlacedAfter}</span> при <span style='color:#545873'>${overbookCapacity}</span> местах по заявке`,
            __typename: "PassengerRequestUpdatedNotification"
          })
        } catch (error) {
          console.error(`Ошибка уведомления об overbooked ФАП (requestId=${requestId}, hotelIndex=${hotelIndex}):`, error)
        }
      }

      return passengerRequest
    },

    addPassengerRequestHotelPeople: async (
      _,
      { requestId, hotelIndex, people },
      context
    ) => {
      if (!Array.isArray(people) || people.length === 0) {
        throw new GraphQLError("people must be a non-empty array")
      }
      const existing = await loadRequestOrThrow(requestId)
      const peopleWithId = people.map(ensurePersonId)

      const living = existing.livingService || emptyLivingService()
      const hotels = living.hotels || []
      assertIndex(hotelIndex, hotels.length, "hotelIndex")
      const overbookHotel = hotels[hotelIndex] || {}
      const overbookCapacity = Number(overbookHotel.peopleCount) || 0
      const overbookPlacedBefore = (overbookHotel.people || []).length
      const overbookPlacedAfter = overbookPlacedBefore + peopleWithId.length
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
        description: `Пакетно добавлены пассажиры в гостиницу ФАП (${people.length})`,
        fulldescription: `Пользователь ${getSubjectName(context)} добавил ${people.length} пассажиров в гостиницу ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
      })

      publishPassengerRequestUpdated(passengerRequest)

      // Уведомляем ТОЛЬКО при переходе через порог, иначе каждый следующий гость сверх
      // заявки плодит новую запись.
      if (
        overbookCapacity > 0 &&
        overbookPlacedBefore <= overbookCapacity &&
        overbookPlacedAfter > overbookCapacity
      ) {
        // Уведомление не должно ронять уже совершённое добавление: гости записаны,
        // и ошибка на этом шаге заставила бы оператора отсканировать их повторно.
        try {
          await notifyPassengerRequestSite({
            action: "passenger_request_hotel_overbooked",
            passengerRequestId: passengerRequest.id,
            airlineId: passengerRequest.airlineId,
            hotelId: overbookHotel.hotelId || undefined,
            descriptionHtml: `В ФАП <span style='color:#545873'>${passengerRequest.flightNumber}</span> в гостинице <span style='color:#545873'>${overbookHotel.name || "без названия"}</span> заселено <span style='color:#545873'>${overbookPlacedAfter}</span> при <span style='color:#545873'>${overbookCapacity}</span> местах по заявке`,
            __typename: "PassengerRequestUpdatedNotification"
          })
        } catch (error) {
          console.error(`Ошибка уведомления об overbooked ФАП (requestId=${requestId}, hotelIndex=${hotelIndex}):`, error)
        }
      }

      return passengerRequest
    },

    updatePassengerRequestHotelPerson: async (
      _,
      { requestId, hotelIndex, personIndex, person },
      context
    ) => {
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
          // Прежний гость — база, инпут накладывается поверх. Клиенты шлют неполный
          // набор полей, и без базы всё, чего нет в инпуте (arrival, departure,
          // roomCategory, roomKind), пропадало бы из документа.
          ...ensureHotelPerson(previousPerson, i, h.name),
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
        description: "Данные пассажира в гостинице ФАП обновлены",
        fulldescription: `Пользователь ${getSubjectName(context)} обновил данные пассажира в гостинице ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
      })

      publishPassengerRequestUpdated(passengerRequest)

      return passengerRequest
    },

    assignPassengerRequestHotelRoom: async (
      _,
      { requestId, hotelIndex, personIndexes, roomNumber },
      context
    ) => {
      const existing = await loadRequestOrThrow(requestId)

      const living = existing.livingService || emptyLivingService()
      const hotels = living.hotels || []
      assertIndex(hotelIndex, hotels.length, "hotelIndex")
      const people = hotels[hotelIndex].people || []

      // Индексы здесь не съезжают (это update, а не удаление), нормализация нужна
      // ради дедупа и предсказуемого порядка.
      const indexes = normalizeBulkIndexes(personIndexes)
      if (indexes.length === 0) {
        throw new GraphQLError("Не выбран ни один гость")
      }
      for (const idx of indexes) {
        assertIndex(idx, people.length, "personIndex")
      }

      const room = normalizeOptionalString(roomNumber)
      const target = new Set(indexes)

      const hotelsClone = hotels.map((h, i) => {
        if (i !== hotelIndex) {
          return {
            ...h,
            people: (h.people || []).map((item) =>
              ensureHotelPerson(item, i, h.name)
            )
          }
        }
        return {
          ...h,
          people: (h.people || []).map((item, personIndex) => {
            const normalized = ensureHotelPerson(item, i, h.name)
            // Меняем ОДНО поле у существующего объекта: остальные (arrival,
            // departure, roomCategory, roomKind…) остаются нетронутыми.
            return target.has(personIndex)
              ? { ...normalized, roomNumber: room }
              : normalized
          })
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
        action: "assign_passenger_request_hotel_room",
        description: "Присвоен номер комнаты в гостинице ФАП",
        fulldescription: `Пользователь ${getSubjectName(context)} присвоил номер «${room ?? "—"}» гостям (${indexes.length}) в гостинице ${hotels[hotelIndex]?.name || "без названия"} ФАП ${passengerRequest.flightNumber}`,
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
        description: "Пассажир удалён из гостиницы ФАП",
        fulldescription: `Пользователь ${getSubjectName(context)} удалил пассажира из гостиницы ФАП ${passengerRequest.flightNumber}`,
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
      const existing = await loadRequestOrThrow(requestId)
      if (!driver?.fullName?.trim()) {
        throw new GraphQLError("Driver fullName is required")
      }

      // Привязка к гостинице — только к той, что есть в проживании этой заявки
      const hotelItemId = normalizeOptionalString(driver?.hotelItemId)
      const linkedHotel = hotelItemId
        ? (existing.livingService?.hotels || []).find(
            (h) => h?.itemId && h.itemId === hotelItemId
          )
        : null
      if (hotelItemId && !linkedHotel) {
        throw new GraphQLError(
          "Unknown hotelItemId: no such hotel in livingService"
        )
      }

      const transferField = getTransferField(direction)
      const prev = existing[transferField] || emptyDriversService()

      const normalizedDriver = normalizePassengerServiceDriver(driver)
      normalizedDriver.id = newDriverId()
      const driverIndex = (prev.drivers || []).length
      const adminId =
        context.subjectType === "USER" ? context.subject?.id : null
      try {
        const linkPWA = await generateDriverLink({
          driverName: normalizedDriver.fullName,
          requestId,
          driverIndex,
          driverId: normalizedDriver.id,
          adminId,
          serviceKind: getTransferServiceKind(direction)
        })
        normalizedDriver.linkPWA = linkPWA
      } catch (e) {
        normalizedDriver.linkPWA = null
      }

      const drivers = [
        ...normalizeDriversForWrite(prev.drivers),
        normalizedDriver
      ]
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
        fulldescription: `Пользователь ${getSubjectName(context)} добавил водителя в трансфер ФАП ${passengerRequest.flightNumber}${linkedHotel ? ` (гостиница «${linkedHotel.name}»)` : ""}`,
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
      const req = await loadRequestOrThrow(requestId)

      const field = getTransferField(direction)
      const service = req[field]
      if (!service?.plan?.enabled) throw new GraphQLError("Service is not enabled")
      // Патч разрешён и после COMPLETED: сумму/тип ТС/«перевезено» вводят по факту
      // поездки, а статусом управляет пересчёт (снижение факта ниже плана реоткроет
      // услугу). Запрет остаётся только для CANCELLED.
      if (service.status === "CANCELLED") {
        throw new GraphQLError("Service is cancelled, no updates allowed")
      }

      const drivers = normalizeDriversForWrite(service.drivers)
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
      if (Object.prototype.hasOwnProperty.call(patch, "transportedCount")) {
        const value = patch.transportedCount
        if (value != null && (!Number.isInteger(value) || value < 0)) {
          throw new GraphQLError("transportedCount must be a non-negative integer")
        }
        applied.transportedCount = value
      }
      if (Object.keys(applied).length === 0) return req

      const factBefore = transferFactCount(drivers)
      drivers[driverIndex] = { ...before, ...applied }

      let nextService = { ...service, drivers }
      if ("transportedCount" in applied) {
        const recalc = resolveDriverCountStatus(
          service,
          factBefore,
          transferFactCount(drivers)
        )
        if (recalc) {
          nextService = { ...nextService, status: recalc.status, times: recalc.times }
        }
      }

      const updated = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: { [field]: nextService },
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
      const existing = await loadRequestOrThrow(requestId)

      const transferField = getTransferField(direction)
      const prev = existing[transferField] || emptyDriversService()
      const drivers = prev.drivers || []
      assertIndex(driverIndex, drivers.length, "driverIndex")

      const removedDriver = normalizePassengerServiceDriver(
        drivers[driverIndex]
      )
      const nextDrivers = ensureDriverIds(
        drivers
          .filter((_, index) => index !== driverIndex)
          .map(normalizePassengerServiceDriver)
      )
      await reissueShiftedDriverLinks({
        requestId,
        serviceKind: getTransferServiceKind(direction),
        drivers: nextDrivers,
        removedIndex: driverIndex,
        adminId: context.subjectType === "USER" ? context.subject?.id : null
      })
      const totalPeopleBefore = transferFactCount(drivers)
      const totalPeopleAfter = transferFactCount(nextDrivers)
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
      const existing = await loadRequestOrThrow(requestId)
      if (!driver?.fullName?.trim()) {
        throw new GraphQLError("Driver fullName is required")
      }

      const prev = existing.baggageDeliveryService || emptyDriversService()

      // Поездка заводится сразу со списком пассажиров: они хранятся в общем
      // people[], чтобы получить personId и гидрацию идентичности из ростера
      // заявки. Ключ people есть в composite-типе — снимать его не нужно,
      // normalizePassengerServiceDriver прогонит каждого через ensureDriverPerson.
      const normalizedDriver = normalizePassengerServiceDriver(driver)
      normalizedDriver.reportCost = tripReportCost(normalizedDriver.people)
      normalizedDriver.id = newDriverId()
      const driverIndex = (prev.drivers || []).length
      const adminId =
        context.subjectType === "USER" ? context.subject?.id : null
      try {
        const linkPWA = await generateDriverLink({
          driverName: normalizedDriver.fullName,
          requestId,
          driverIndex,
          driverId: normalizedDriver.id,
          adminId,
          serviceKind: "baggage"
        })
        normalizedDriver.linkPWA = linkPWA
      } catch (e) {
        normalizedDriver.linkPWA = null
      }

      const drivers = [
        ...normalizeDriversForWrite(prev.drivers),
        normalizedDriver
      ]

      const now = new Date()
      const isFirstDriver = (prev.drivers || []).length === 0
      const acceptedStatus =
        isFirstDriver && prev.status === "NEW" ? "ACCEPTED" : prev.status
      const acceptedTimes =
        isFirstDriver && prev.status === "NEW"
          ? { ...(prev.times || {}), acceptedAt: now }
          : prev.times || {}

      // Правило «первый водитель → ACCEPTED» остаётся нижней границей, но поездка
      // заводится сразу со списком пассажиров — поэтому дальше пересчитываем статус
      // по фактическому числу людей во ВСЁМ массиве водителей, ровно как в патче.
      // Иначе услуга с тремя заведёнными пассажирами висела бы в ACCEPTED до
      // следующей случайной правки. Поездка без пассажиров ничего не пересчитывает:
      // там поведение прежнее.
      let updatedStatus = acceptedStatus
      let updatedTimes = acceptedTimes
      if (normalizedDriver.people.length > 0) {
        const totalPeopleBefore = (prev.drivers || []).reduce(
          (sum, d) => sum + (Array.isArray(d.people) ? d.people.length : 0),
          0
        )
        const totalPeopleAfter = drivers.reduce(
          (sum, d) => sum + (Array.isArray(d.people) ? d.people.length : 0),
          0
        )
        const recalc = recomputeServiceStatus(
          { ...prev, status: acceptedStatus, times: acceptedTimes },
          totalPeopleBefore,
          totalPeopleAfter
        )
        updatedStatus = recalc.status
        updatedTimes = recalc.times
      }

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
      const existing = await loadRequestOrThrow(requestId)

      const prev = existing.baggageDeliveryService || emptyDriversService()
      const drivers = prev.drivers || []
      assertIndex(driverIndex, drivers.length, "driverIndex")

      const removedDriver = normalizePassengerServiceDriver(
        drivers[driverIndex]
      )
      const nextDrivers = ensureDriverIds(
        drivers
          .filter((_, index) => index !== driverIndex)
          .map(normalizePassengerServiceDriver)
      )
      await reissueShiftedDriverLinks({
        requestId,
        serviceKind: "baggage",
        drivers: nextDrivers,
        removedIndex: driverIndex,
        adminId: context.subjectType === "USER" ? context.subject?.id : null
      })
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

    updatePassengerRequestBaggageDriver: async (
      _,
      { requestId, driverIndex, patch },
      context
    ) => {
      const existing = await loadRequestOrThrow(requestId)

      const prev = existing.baggageDeliveryService
      if (!prev) throw new GraphQLError("BaggageDeliveryService not found")
      if (!prev.plan?.enabled) throw new GraphQLError("Service is not enabled")
      if (prev.status === "COMPLETED" || prev.status === "CANCELLED") {
        throw new GraphQLError("Service is completed, no updates allowed")
      }

      const drivers = normalizeDriversForWrite(prev.drivers)
      assertIndex(driverIndex, drivers.length, "driverIndex")
      const before = drivers[driverIndex]

      const applied = collectBaggageDriverPatch(patch)
      if (Object.keys(applied).length === 0) return existing

      const next = { ...before, ...applied }
      if ("people" in applied) {
        // Тот же белый список, что и при создании: правка и заведение поездки
        // кладут в composite-тип одинаковый набор ключей. Нормализация внутри
        // идемпотентна, повторный прогон безвреден.
        next.people = applied.people.map(ensureDriverPerson)
        // Патч говорит про пассажиров — сумму поездки пересчитываем всегда,
        // в том числе в null на пустом списке. Молчит про пассажиров —
        // ручную сумму легаси-поездки не трогаем.
        next.reportCost = tripReportCost(next.people)
      }
      drivers[driverIndex] = next

      const nextService = { ...prev, drivers }
      if ("people" in applied) {
        // Патч — единственный путь, которым пассажиры попадают в существующую
        // поездку, поэтому статус услуги пересчитываем здесь же (как в
        // addPassengerRequestDriverPeople у трансфера). Иначе услуга висела бы в
        // ACCEPTED при любом числе заведённых пассажиров, а удаление посторонней
        // поездки задним числом внезапно перебрасывало бы её в IN_PROGRESS.
        // Людей считаем по ВСЕМУ массиву водителей: услуга одна на все поездки.
        const totalPeopleBefore = (prev.drivers || []).reduce(
          (sum, d) => sum + (Array.isArray(d.people) ? d.people.length : 0),
          0
        )
        const totalPeopleAfter = drivers.reduce(
          (sum, d) => sum + (Array.isArray(d.people) ? d.people.length : 0),
          0
        )
        const recalc = recomputeServiceStatus(
          prev,
          totalPeopleBefore,
          totalPeopleAfter
        )
        nextService.status = recalc.status
        nextService.times = recalc.times
      }

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: { baggageDeliveryService: nextService }
      })

      const log = buildBaggageDriverPatchDescription(before, applied, driverIndex)
      await logPassengerRequestAction({
        context,
        action: "update_passenger_request_baggage_driver",
        description: log.short,
        fulldescription: log.full,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id,
        skipEmail: true
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
            drivers: normalizeDriversForWrite(drivers),
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
      const existing = await loadRequestOrThrow(requestId)

      const bds = existing.baggageDeliveryService
      const drivers = bds?.drivers ?? []
      if (driverIndex < 0 || driverIndex >= drivers.length) {
        throw new GraphQLError("Driver index out of range")
      }

      // Дата доставки, введённая диспетчером вручную, — источник истины для реестра.
      // Водитель из PWA, нажимая «доставлено», не должен её затирать.
      const now = new Date()
      const updatedDrivers = normalizeDriversForWrite(drivers).map((d, i) =>
        i === driverIndex
          ? { ...d, deliveryCompletedAt: d.deliveryCompletedAt ?? now }
          : d
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

      const totalPeopleBefore = transferFactCount(drivers)
      const totalPeopleAfter = transferFactCount(driversClone)
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

      const totalPeopleBefore = transferFactCount(drivers)
      const totalPeopleAfter = transferFactCount(driversClone)
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

      const totalPeopleBefore = transferFactCount(drivers)
      const totalPeopleAfter = transferFactCount(driversClone)
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

    removePassengerRequestDriverPeople: async (
      _,
      { requestId, driverIndex, personIndexes, direction = "ARRIVAL" },
      context
    ) => {
      const existing = await loadRequestOrThrow(requestId)

      const transferField = getTransferField(direction)
      const prev = existing[transferField] || emptyDriversService()
      const drivers = prev.drivers || []
      assertIndex(driverIndex, drivers.length, "driverIndex")
      const people = drivers[driverIndex].people || []

      const indexes = normalizeBulkIndexes(personIndexes)
      if (indexes.length === 0) {
        throw new GraphQLError("Не выбран ни один пассажир")
      }
      for (const idx of indexes) {
        assertIndex(idx, people.length, "personIndex")
      }

      const driversClone = drivers.map((d, i) => {
        const normalized = normalizePassengerServiceDriver(d)
        if (i !== driverIndex) return normalized
        const { next } = spliceAtIndexes(normalized.people || [], indexes)
        return { ...normalized, people: next }
      })

      // Факт поездки = max(список, transportedCount), поэтому итог считаем
      // через transferFactCount, а не по длине people. Пересчёт один на пачку.
      const totalPeopleBefore = transferFactCount(drivers)
      const totalPeopleAfter = transferFactCount(driversClone)
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
        action: "remove_passenger_request_driver_people",
        description: "Пассажиры удалены у водителя трансфера ФАП",
        fulldescription: `Пользователь ${getSubjectName(context)} удалил пассажиров (${indexes.length}) у водителя #${driverIndex} в ФАП ${passengerRequest.flightNumber}`,
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
      const existing = await loadRequestOrThrow(requestId)
      const cleanReason = assertReason(reason)

      const prev = existing.baggageDeliveryService || emptyDriversService()

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: {
          baggageDeliveryService: {
            ...prev,
            drivers: normalizeDriversForWrite(prev.drivers),
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
      const existing = await loadRequestOrThrow(requestId)
      const cleanReason = assertReason(reason)

      const transferField = getTransferField(direction)
      const prev = existing[transferField] || emptyDriversService()

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: {
          [transferField]: {
            ...prev,
            drivers: normalizeDriversForWrite(prev.drivers),
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

      // Лимит вместимости при переселении снят сознательно: фактическое заселение
      // может превышать заказ, и перебор надо иметь возможность перераспределить
      // между гостиницами, а не только выселять.
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
        description: "Пассажир переселён между гостиницами ФАП",
        fulldescription: `Пользователь ${getSubjectName(context)} переселил пассажира в ФАП ${passengerRequest.flightNumber} из гостиницы ${sourceHotel?.name || "без названия"} в ${targetHotel?.name || "без названия"}`,
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
        descriptionHtml: `В ФАП <span style='color:#545873'>${passengerRequest.flightNumber}</span> пассажир переселён: <span style='color:#545873'>${sourceHotel?.name || "без названия"}</span> → <span style='color:#545873'>${targetHotel?.name || "без названия"}</span>`,
        __typename: "PassengerRequestUpdatedNotification"
      })

      return passengerRequest
    },

    relocatePassengerRequestHotelPeople: async (
      _,
      { requestId, fromHotelIndex, toHotelIndex, personIndexes, reason, movedAt },
      context
    ) => {
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

      const sourceHotel = hotels[fromHotelIndex]
      const targetHotel = hotels[toHotelIndex]
      const sourcePeople = sourceHotel.people || []

      const indexes = normalizeBulkIndexes(personIndexes)
      if (indexes.length === 0) {
        throw new GraphQLError("Не выбран ни один пассажир")
      }
      for (const idx of indexes) {
        assertIndex(idx, sourcePeople.length, "personIndex")
      }

      // Лимит вместимости при переселении снят сознательно: фактическое заселение
      // может превышать заказ, и перебор надо иметь возможность перераспределить
      // между гостиницами, а не только выселять.

      const relocationDate = movedAt ? new Date(movedAt) : new Date()
      const { next: nextSource, removed } = spliceAtIndexes(sourcePeople, indexes)

      const moved = removed.map((raw) => {
        const person = ensureHotelPerson(raw, fromHotelIndex, sourceHotel?.name)
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
          chesses[idx] = { ...chesses[idx], endAt: relocationDate }
        }
        chesses.push({
          hotelIndex: toHotelIndex,
          hotelName: targetHotel?.name || null,
          startAt: relocationDate,
          endAt: null,
          reason: cleanReason
        })
        return { ...person, accommodationChesses: chesses }
      })

      const hotelsClone = hotels.map((hotel, index) => {
        const peopleMapped = (hotel.people || []).map((item) =>
          ensureHotelPerson(item, index, hotel.name)
        )
        if (index === fromHotelIndex) {
          return {
            ...hotel,
            people: nextSource.map((item) =>
              ensureHotelPerson(item, index, hotel.name)
            )
          }
        }
        if (index === toHotelIndex) {
          return { ...hotel, people: [...peopleMapped, ...moved] }
        }
        return { ...hotel, people: peopleMapped }
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
        action: "relocate_passenger_request_hotel_people",
        reason: cleanReason,
        description: "Массовое переселение между гостиницами ФАП",
        fulldescription: `Пользователь ${getSubjectName(context)} переселил пассажиров (${moved.length}) в ФАП ${passengerRequest.flightNumber} из гостиницы ${sourceHotel?.name || "без названия"} в ${targetHotel?.name || "без названия"}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id,
        emailExtras: {
          hotelName: targetHotel?.name,
          personName: moved.map((p) => p?.fullName).join(", ")
        }
      })

      publishPassengerRequestUpdated(passengerRequest)

      await notifyPassengerRequestSite({
        action: "update_hotel_chess_passenger_request",
        passengerRequestId: passengerRequest.id,
        airlineId: passengerRequest.airlineId,
        hotelId: targetHotel?.hotelId || undefined,
        descriptionHtml: `В ФАП <span style='color:#545873'>${passengerRequest.flightNumber}</span> переселено пассажиров: <span style='color:#545873'>${moved.length}</span>. <span style='color:#545873'>${sourceHotel?.name || "без названия"}</span> → <span style='color:#545873'>${targetHotel?.name || "без названия"}</span>`,
        __typename: "PassengerRequestUpdatedNotification"
      })

      return passengerRequest
    },

    evictPassengerRequestHotelPerson: async (
      _,
      { requestId, hotelIndex, personIndex, reason, evictedAt },
      context
    ) => {
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
        description: "Пассажир выселен из гостиницы ФАП",
        fulldescription: `Пользователь ${getSubjectName(context)} выселил пассажира из гостиницы ${hotel?.name || "без названия"} в ФАП ${passengerRequest.flightNumber}`,
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
        descriptionHtml: `В ФАП <span style='color:#545873'>${passengerRequest.flightNumber}</span> пассажир выселен из гостиницы <span style='color:#545873'>${hotel?.name ?? "без названия"}</span>`,
        __typename: "PassengerRequestUpdatedNotification"
      })

      return passengerRequest
    },

    evictPassengerRequestHotelPeople: async (
      _,
      { requestId, hotelIndex, personIndexes, reason, evictedAt },
      context
    ) => {
      const existing = await loadRequestOrThrow(requestId)
      const cleanReason = assertReason(reason)

      const living = existing.livingService || emptyLivingService()
      const hotels = living.hotels || []
      assertIndex(hotelIndex, hotels.length, "hotelIndex")
      const hotel = hotels[hotelIndex]
      const people = hotel.people || []

      // Валидация ДО изменений: пачка применяется целиком либо не применяется вовсе.
      const indexes = normalizeBulkIndexes(personIndexes)
      if (indexes.length === 0) {
        throw new GraphQLError("Не выбран ни один пассажир")
      }
      for (const idx of indexes) {
        assertIndex(idx, people.length, "personIndex")
      }

      const evictionDate = evictedAt ? new Date(evictedAt) : new Date()
      const { next: nextPeople, removed } = spliceAtIndexes(people, indexes)

      const evicted = removed.map((raw) => {
        const person = ensureHotelPerson(raw, hotelIndex, hotel?.name)
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
        return {
          person: { ...person, accommodationChesses: chesses },
          hotelIndex,
          hotelName: hotel?.name || null,
          reason: cleanReason,
          evictedAt: evictionDate
        }
      })

      const hotelsClone = hotels.map((item, index) => {
        if (index !== hotelIndex) {
          return {
            ...item,
            people: (item.people || []).map((p) =>
              ensureHotelPerson(p, index, item.name)
            )
          }
        }
        return {
          ...item,
          people: nextPeople.map((p) => ensureHotelPerson(p, index, item.name))
        }
      })

      const evictions = [...(living.evictions || []), ...evicted]

      const totalPeopleBefore = hotels.reduce(
        (sum, h) => sum + (Array.isArray(h.people) ? h.people.length : 0),
        0
      )
      const totalPeopleAfter = hotelsClone.reduce(
        (sum, h) => sum + (Array.isArray(h.people) ? h.people.length : 0),
        0
      )
      // Статус услуги пересчитываем ОДИН раз по итогу всей пачки.
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
        action: "evict_passenger_request_hotel_people",
        reason: cleanReason,
        description: "Массовое выселение из гостиницы ФАП",
        fulldescription: `Пользователь ${getSubjectName(context)} выселил пассажиров (${evicted.length}) из гостиницы ${hotel?.name || "без названия"} в ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id,
        emailExtras: {
          hotelName: hotel?.name,
          personName: evicted.map((e) => e.person?.fullName).join(", ")
        }
      })

      publishPassengerRequestUpdated(passengerRequest)

      await notifyPassengerRequestSite({
        action: "update_hotel_chess_passenger_request",
        passengerRequestId: passengerRequest.id,
        airlineId: passengerRequest.airlineId,
        hotelId: hotel?.hotelId || undefined,
        descriptionHtml: `В ФАП <span style='color:#545873'>${passengerRequest.flightNumber}</span> выселено пассажиров: <span style='color:#545873'>${evicted.length}</span>. Гостиница <span style='color:#545873'>${hotel?.name ?? "без названия"}</span>`,
        __typename: "PassengerRequestUpdatedNotification"
      })

      return passengerRequest
    },

    savePassengerRequestHotelReport: async (
      _,
      { requestId, hotelIndex, reportRows },
      context
    ) => {
      const existing = await loadRequestOrThrow(requestId)

      const rows = reportRows.map((row) => ({
        fullName: row.fullName ?? "",
        personId: row.personId ?? "",
        roomNumber: row.roomNumber ?? "",
        roomCategory: makeRoomCategoryLabel(row.roomCategory, row.roomKind),
        roomKind: row.roomKind ?? "",
        daysCount: row.daysCount ?? 0,
        breakfast: row.breakfast ?? 0,
        lunch: row.lunch ?? 0,
        dinner: row.dinner ?? 0,
        breakfastCount: row.breakfastCount ?? null,
        lunchCount: row.lunchCount ?? null,
        dinnerCount: row.dinnerCount ?? null,
        breakfastLunchbox: row.breakfastLunchbox ?? false,
        lunchLunchbox: row.lunchLunchbox ?? false,
        dinnerLunchbox: row.dinnerLunchbox ?? false,
        lunchboxPrice: row.lunchboxPrice ?? 0,
        lunchboxCount: row.lunchboxCount ?? null,
        foodCost: row.foodCost ?? 0,
        accommodationCost: row.accommodationCost ?? 0,
        tariffName: row.tariffName ?? "",
        pricePerDay: row.pricePerDay ?? 0,
        placementKind: row.placementKind ?? 0,
        accommodationDiscount: row.accommodationDiscount ?? null,
        placementKindOverride: row.placementKindOverride ?? null
      }))

      // Флаг отправки сбрасываем ТОЛЬКО если строки реально изменились: автосейв
      // дёргается ещё и флашем на размонтировании страницы и перед выгрузкой Excel,
      // и без этой проверки флаг слетал бы от простого захода в отчёт.
      const prev = await prisma.passengerRequestHotelReport.findUnique({
        where: {
          passengerRequestId_hotelIndex: {
            passengerRequestId: requestId,
            hotelIndex
          }
        }
      })
      const rowsChanged = !reportRowsEqual(rows, prev?.reportRows)

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
        update: {
          reportRows: rows,
          ...(rowsChanged && { submittedAt: null })
        }
      })
      await logPassengerRequestAction({
        context,
        action: "save_passenger_request_hotel_report",
        description: "Отчёт по гостинице ФАП сохранён",
        fulldescription: `Пользователь ${getSubjectName(context)} сохранил отчёт по гостинице ${existing.livingService?.hotels?.[hotelIndex]?.name || "без названия"} для ФАП ${existing.flightNumber}`,
        newData: report,
        airlineId: existing.airlineId,
        passengerRequestId: requestId
      })

      // Уведомляем подписчиков: другие открытые клиенты перечитают заявку и
      // увидят обновлённый отчёт/тарифы (раньше сейв отчёта событие не публиковал).
      publishPassengerRequestUpdated(existing)

      return report
    },

    submitPassengerRequestHotelReport: async (
      _,
      { requestId, hotelIndex },
      context
    ) => {
      const existing = await loadRequestOrThrow(requestId)
      const hotel = existing.livingService?.hotels?.[hotelIndex]

      const report = await prisma.passengerRequestHotelReport.findUnique({
        where: {
          passengerRequestId_hotelIndex: {
            passengerRequestId: requestId,
            hotelIndex
          }
        }
      })
      if (!report) throw new GraphQLError("Отчёт ещё не сохранён")

      const updated = await prisma.passengerRequestHotelReport.update({
        where: { id: report.id },
        data: { submittedAt: new Date() }
      })

      await logPassengerRequestAction({
        context,
        action: "submit_passenger_request_hotel_report",
        description: "Отчёт по гостинице ФАП отправлен на проверку",
        fulldescription: `Пользователь ${getSubjectName(context)} отправил отчёт по гостинице ${hotel?.name || "без названия"} на проверку в ФАП ${existing.flightNumber}`,
        newData: updated,
        airlineId: existing.airlineId,
        passengerRequestId: requestId
      })

      // Публикуем событие по заявке: у авиакомпании открытая страница сделает refetch
      // и отчёт появится без перезагрузки.
      publishPassengerRequestUpdated(existing)

      await notifyPassengerRequestSite({
        action: "submit_passenger_request_hotel_report",
        passengerRequestId: existing.id,
        airlineId: existing.airlineId,
        hotelId: hotel?.hotelId || undefined,
        descriptionHtml: `В ФАП <span style='color:#545873'>${existing.flightNumber}</span> отчёт по гостинице <span style='color:#545873'>${hotel?.name ?? "без названия"}</span> отправлен на проверку`,
        __typename: "PassengerRequestUpdatedNotification"
      })

      return updated
    },

    hidePassengerRequestHotelReport: async (
      _,
      { requestId, hotelIndex },
      context
    ) => {
      const existing = await loadRequestOrThrow(requestId)

      const report = await prisma.passengerRequestHotelReport.findUnique({
        where: {
          passengerRequestId_hotelIndex: {
            passengerRequestId: requestId,
            hotelIndex
          }
        }
      })
      if (!report) throw new GraphQLError("Отчёт ещё не сохранён")

      const updated = await prisma.passengerRequestHotelReport.update({
        where: { id: report.id },
        data: { submittedAt: null }
      })

      await logPassengerRequestAction({
        context,
        action: "hide_passenger_request_hotel_report",
        description: "Отчёт по гостинице ФАП скрыт от авиакомпании",
        fulldescription: `Пользователь ${getSubjectName(context)} скрыл отчёт по гостинице ${existing.livingService?.hotels?.[hotelIndex]?.name || "без названия"} от авиакомпании в ФАП ${existing.flightNumber}`,
        newData: updated,
        airlineId: existing.airlineId,
        passengerRequestId: requestId
      })

      // Публикуем событие по заявке: у авиакомпании открытая страница сделает refetch
      // и отчёт скроется без перезагрузки.
      publishPassengerRequestUpdated(existing)

      return updated
    }
  },

  Subscription: {
    passengerRequestCreated: {
      subscribe: withFilter(
        () => pubsub.asyncIterator([PASSENGER_REQUEST_CREATED]),
        (payload, variables, context) => {
          // Фильтр пропускает всё осознанно: субъект проверяется выше, в
          // subscribe (withFapAuthGuard), а адресной рассылки по получателю
          // в ФАП нет — событие уходит всем подписчикам.
          return true
        }
      )
    },

    passengerRequestUpdated: {
      subscribe: withFilter(
        () => pubsub.asyncIterator([PASSENGER_REQUEST_UPDATED]),
        (payload, variables, context) => {
          // Фильтр пропускает всё осознанно: субъект проверяется выше, в
          // subscribe (withFapAuthGuard), а адресной рассылки по получателю
          // в ФАП нет — событие уходит всем подписчикам.
          return true
        }
      )
    }
  }
}

export default withFapAuthGuard(passengerRequestResolvers)

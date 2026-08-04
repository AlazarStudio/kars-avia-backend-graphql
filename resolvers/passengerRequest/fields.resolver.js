// Резолверы полей типов ФАП и корневые Query.

import { prisma } from "../../prisma.js"
import { dedupeSavedPassengers } from "../../services/passengerRequest/savedPassengers.js"
import { hydratePassengerRequest } from "../../services/passengerRequest/hydratePassengerRequest.js"
import { reportWhere } from "../../services/passengerRequest/envelope.js"

export default {
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
        where: reportWhere(parent.id, hotelIndex)
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
  }
}

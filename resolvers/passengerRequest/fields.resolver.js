// Резолверы полей типов ФАП и корневые Query.

import { prisma } from "../../prisma.js"
import { dedupeSavedPassengers } from "../../services/passengerRequest/savedPassengers.js"
import { hydratePassengerRequest } from "../../services/passengerRequest/hydratePassengerRequest.js"
import { reportWhere } from "../../services/passengerRequest/envelope.js"
import {
  scopeFilterForQuery,
  evaluateRequestAccess
} from "../../services/passengerRequest/fapScopeGuard.js"
import {
  resolveScope,
  hotelIndexesForScope
} from "../../services/passengerRequest/fapScope.js"
import { visibleHotelReports } from "../../services/analytics/passengerAnalyticsUtils.js"

// Зритель-авиакомпания. Берём канонический предикат модуля, а не
// `context.user?.airlineId`: resolveScope знает все типы субъекта ФАП, включая
// персонал авиакомпании, у которого своего `user` в контексте нет.
const viewerIsAirline = (context) => resolveScope(context).kind === "airline"

// Индексы гостиниц, отчёты которых зритель вправе читать; null — все.
// Для гостиничного зрителя это ровно его строка заявки: в общей заявке рядом
// стоят гостиницы других организаций, и их отчёт — чужие деньги.
const viewerHotelIndexes = (context, request) =>
  hotelIndexesForScope(resolveScope(context), request)

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

    // Правило «авиакомпания видит только ОТПРАВЛЕННЫЙ на проверку отчёт» до
    // сих пор жило в двух видах: серверно — в аналитике (visibleHotelReports),
    // а для самого отчёта только на клиенте (FapHotelPage рисует заглушку
    // «Отчёт формируется»). Строки при этом уезжали в браузер авиакомпании
    // целиком и читались в devtools. Здесь то же правило и тот же хелпер, что
    // в аналитике, — чтобы оно было ОДНО, а не два.
    // Флаг FAP_SCOPE_ENFORCE тут ни при чём: это не межорганизационная
    // изоляция, а видимость черновика, и в аналитике она тоже безусловна.
    hotelReport: async (parent, { hotelIndex }, context) => {
      // Чужой индекс отсекаем ДО обращения в базу: и запроса меньше, и
      // существование чужого отчёта не подтверждается разницей в ответах.
      const ownIndexes = viewerHotelIndexes(context, parent)
      if (ownIndexes && !ownIndexes.includes(hotelIndex)) return null

      const report = await prisma.passengerRequestHotelReport.findUnique({
        where: reportWhere(parent.id, hotelIndex)
      })
      if (!report) return null
      return visibleHotelReports([report], viewerIsAirline(context))[0] ?? null
    },

    hotelReports: async (parent, _args, context) => {
      const reports = await prisma.passengerRequestHotelReport.findMany({
        where: { passengerRequestId: parent.id },
        orderBy: { hotelIndex: "asc" }
      })
      const ownIndexes = viewerHotelIndexes(context, parent)
      const scoped = ownIndexes
        ? reports.filter((rep) => ownIndexes.includes(rep?.hotelIndex))
        : reports
      return visibleHotelReports(scoped, viewerIsAirline(context))
    },

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
    // Каждая строка списка несёт заявку целиком, включая hotels[] соседних
    // гостиниц — это тот же ПРИНЯТЫЙ РАЗРЫВ, что описан у Query.passengerRequest
    // ниже (позиционная адресация по hotelIndex), см. комментарий там.
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

      // Скоуп субъекта кладём в тот же AND, а не в корень where: там уже лежат
      // поиск и период, и запись в корень затёрла бы пользовательский фильтр
      // либо была бы затёрта им.
      const scope = scopeFilterForQuery(context)
      if (scope.denyAll) return []
      if (scope.filter) and.push(scope.filter)

      if (and.length) where.AND = and

      const list = await prisma.passengerRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: skip ?? undefined,
        take: take ?? undefined
      })
      return list.map(hydratePassengerRequest)
    },

    // ⚠️ ПРИНЯТЫЙ РАЗРЫВ: заявка отдаётся участнику ЦЕЛИКОМ, включая
    // livingService.hotels[] соседних гостиниц с их гостями. Скрывать чужие
    // строки здесь мы сознательно НЕ стали:
    //
    // 1. Адресация гостиниц позиционная. Все мутации и маршруты отчёта ходят по
    //    hotelIndex, и фильтрация массива сдвинула бы индексы — гостиница
    //    правила бы соседа, думая, что правит себя. Обнуление элементов на
    //    месте индексы сохраняет, но даёт полумеру: рядом в том же документе
    //    лежат livingService.evictions (выселенные соседа с ФИО), savedPassengers
    //    (ростер всей заявки), passengerGroups и водители трансфера — они
    //    гостиничные не по строке, и одна замаскированная ветка создала бы
    //    видимость изоляции там, где её нет.
    // 2. Гейты этой работы закрывают ЗАПИСЬ по чужому индексу и ЧТЕНИЕ отчёта
    //    (деньги гостиницы, отдельная модель). Полная изоляция состава заявки —
    //    отдельное решение о форме документа, а не довесок к гейтам.
    //
    // Разрыв закреплён тестом «hotels[] отдаётся гостинице целиком» в
    // query.characterization.test.js: при закрытии он обязан измениться.
    passengerRequest: async (_, { id }, context) => {
      const req = await prisma.passengerRequest.findUnique({ where: { id } })
      if (!req) return null
      // null, а не FORBIDDEN: код отказа подтвердил бы, что заявка с таким
      // идентификатором существует.
      if (!evaluateRequestAccess(context, req).allowed) return null
      return hydratePassengerRequest(req)
    }
  }
}

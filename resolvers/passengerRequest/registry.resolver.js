// Реестры услуг ФАП за период: список, чтение, подсказки формы, формирование,
// стадии. Диспетчер формирует и видит всё; авиакомпания видит свои отправленные
// и утверждает; гостиница и внешние — отказ.

import { prisma } from "../../prisma.js"
import { GraphQLError } from "graphql"
import logAction from "../../services/infra/logaction.js"
import { hydratePassengerRequest } from "../../services/passengerRequest/hydratePassengerRequest.js"
import { resolvePeriodBounds } from "../../services/analytics/passengerAnalyticsUtils.js"
import { buildRegistryRows } from "../../services/passengerRequest/registryRows.js"
import { registryStage } from "../../services/passengerRequest/registryStage.js"
import {
  scopeOf,
  assertDispatcherScope,
  assertAirlineOwnsRegistry,
  assertNotApproved,
  registryVisibleForScope,
  registryListWhere,
  maskRegistryRows,
  maskRegistryTotals
} from "../../services/passengerRequest/registryAccess.js"
import { getSubjectName } from "../../services/passengerRequest/envelope.js"
import {
  REGISTRY_ACTIONS,
  notifyRegistrySubmitted,
  notifyRegistryApproved,
  notifyRegistryRevoked
} from "../../services/passengerRequest/registryNotify.js"

const HEADER_KEYS = [
  "appendixLabel",
  "contractNumber",
  "contractDate",
  "executorName",
  "executorTitle",
  "executorSignatory",
  "customerName",
  "customerTitle",
  "customerSignatory"
]

const CONTRACT_SUBJECT = { BAGGAGE: "Доставка багажа", CATERING: "Пассажиры" }

const badInput = (message) =>
  new GraphQLError(message, { extensions: { code: "BAD_USER_INPUT" } })

// Состояние реестра не позволяет действие — это не кривой ввод, а запрет.
const forbidden = (message) =>
  new GraphQLError(message, { extensions: { code: "FORBIDDEN", http: { status: 403 } } })

const notFound = () =>
  new GraphQLError("Реестр не найден", { extensions: { code: "NOT_FOUND", http: { status: 404 } } })

// Шапка — снимок: только известные ключи, строки тримятся, пустое → null.
const normalizeHeader = (input = {}) => {
  const header = {}
  for (const key of HEADER_KEYS) {
    const raw = input?.[key]
    header[key] = typeof raw === "string" && raw.trim() ? raw.trim() : null
  }
  return header
}

const normalizeNumber = (value) => {
  const number = String(value ?? "").trim()
  if (!number) throw badInput("Укажите номер реестра")
  return number
}

// Границы периода: вход — YYYY-MM-DD (или ISO), считаем московские сутки как
// аналитика по пассажирам. Ошибку хелпера переводим в BAD_USER_INPUT.
const periodBounds = (periodStart, periodEnd) => {
  try {
    return resolvePeriodBounds(periodStart, periodEnd)
  } catch (error) {
    throw badInput(error.message)
  }
}

const loadRegistryOrThrow = async (id) => {
  const registry = await prisma.passengerServiceRegistry.findUnique({ where: { id } })
  if (!registry) throw notFound()
  return registry
}

// Заявки АК по аэропорту (все, кроме отменённых); отбор по датам факта — в
// buildRegistryRows: дата доставки может отстоять от даты рейса на дни, а
// заявок у одной АК в одном аэропорту сотни, не тысячи.
async function buildSnapshot({ kind, airlineId, airportId, bounds }) {
  const requests = await prisma.passengerRequest.findMany({
    where: { airlineId, airportId, status: { not: "CANCELLED" } }
  })
  return buildRegistryRows({
    kind,
    // Гидрация нужна только багажу: ФИО пассажиров поездки достаются из ростера
    // заявки. Вода и питание читают собственные поля услуги — сырой заявки хватает,
    // а гидрация сотен заявок на каждое формирование реестра не бесплатна.
    requests: kind === "BAGGAGE" ? requests.map(hydratePassengerRequest) : requests,
    bounds
  })
}

// В журнал — только реквизиты и итог для АК: Log.newData читает и авиакомпания
// (Airline.logs без маски), внутренние деньги туда попадать не должны.
const logSnapshot = (registry) =>
  registry
    ? {
        id: registry.id,
        kind: registry.kind,
        number: registry.number,
        airlineId: registry.airlineId,
        airportId: registry.airportId,
        periodStart: registry.periodStart,
        periodEnd: registry.periodEnd,
        submittedAt: registry.submittedAt ?? null,
        airlineApprovedAt: registry.airlineApprovedAt ?? null,
        stage: registryStage(registry),
        rowsCount: registry.totals?.rowsCount ?? null,
        airlineTotal: registry.totals?.airlineTotal ?? null
      }
    : null

async function logRegistry(context, registry, action, description, oldRegistry = null) {
  try {
    await logAction({
      context,
      action,
      description,
      fulldescription: `Пользователь ${getSubjectName(context)}: ${description} (реестр №${registry.number}, ${registry.kind})`,
      airlineId: registry.airlineId,
      oldData: logSnapshot(oldRegistry),
      newData: logSnapshot(registry)
    })
  } catch (error) {
    console.error("Ошибка логирования реестра:", error)
  }
}

export default {
  PassengerServiceRegistry: {
    rows: (parent, _args, context) => maskRegistryRows(scopeOf(context), parent.rows),
    totals: (parent, _args, context) => maskRegistryTotals(scopeOf(context), parent.totals),
    stage: (parent) => registryStage(parent),
    header: (parent) => normalizeHeader(parent.header),
    airline: (parent) => prisma.airline.findUnique({ where: { id: parent.airlineId } }),
    airport: (parent) =>
      parent.airportId ? prisma.airport.findUnique({ where: { id: parent.airportId } }) : null
  },

  Query: {
    // Скоуп применяется дважды — в where и в памяти. Второй раз — защита от
    // расхождения фильтра с правилом видимости (и то, что проверяет двойник).
    // Стадия в where не выражается (сравнение двух полей), поэтому при фильтре по
    // стадии читаем всё, что подошло под where, и режем страницу в памяти;
    // реестров десятки в месяц. Без стадии пагинация уходит в Prisma.
    passengerServiceRegistries: async (_, { filter, skip, take }, context) => {
      const scope = scopeOf(context)
      const where = registryListWhere(scope, filter)
      if (!where) return []
      const orderBy = { createdAt: "desc" }

      if (!filter?.stage) {
        const page = await prisma.passengerServiceRegistry.findMany({
          where,
          orderBy,
          skip: skip ?? undefined,
          take: take ?? undefined
        })
        return page.filter((registry) => registryVisibleForScope(scope, registry))
      }

      const list = await prisma.passengerServiceRegistry.findMany({ where, orderBy })
      const visible = list
        .filter((registry) => registryVisibleForScope(scope, registry))
        .filter((registry) => registryStage(registry) === filter.stage)
      const from = skip ?? 0
      return take != null ? visible.slice(from, from + take) : visible.slice(from)
    },

    passengerServiceRegistry: async (_, { id }, context) => {
      const registry = await prisma.passengerServiceRegistry.findUnique({ where: { id } })
      if (!registry) return null
      // null, а не FORBIDDEN: код отказа подтвердил бы существование чужого реестра.
      return registryVisibleForScope(scopeOf(context), registry) ? registry : null
    },

    passengerServiceRegistryDefaults: async (_, { kind, airlineId }, context) => {
      assertDispatcherScope(scopeOf(context))
      const [last, contract, airline] = await Promise.all([
        prisma.passengerServiceRegistry.findFirst({
          where: { airlineId, kind },
          orderBy: { createdAt: "desc" }
        }),
        prisma.airlineContract.findFirst({
          where: { airlineId, isArchived: false, applicationType: CONTRACT_SUBJECT[kind] },
          orderBy: { date: "desc" }
        }),
        prisma.airline.findUnique({ where: { id: airlineId } })
      ])
      const header = normalizeHeader(last?.header)
      // Заказчик в шапке — текущее имя АК из справочника; из предыдущего реестра
      // берём только если у АК имени нет (после переименования АК старое не тянется).
      header.customerName = airline?.nameFull || airline?.name || header.customerName || null
      return {
        lastNumber: last?.number ?? null,
        header,
        contract: contract
          ? { number: contract.contractNumber ?? null, date: contract.date ?? null }
          : null
      }
    }
  },

  Mutation: {
    createPassengerServiceRegistry: async (_, { input }, context) => {
      assertDispatcherScope(scopeOf(context))
      const number = normalizeNumber(input.number)
      const bounds = periodBounds(input.periodStart, input.periodEnd)
      const { rows, totals } = await buildSnapshot({
        kind: input.kind,
        airlineId: input.airlineId,
        airportId: input.airportId,
        bounds
      })
      const registry = await prisma.passengerServiceRegistry.create({
        data: {
          kind: input.kind,
          airlineId: input.airlineId,
          airportId: input.airportId,
          periodStart: bounds.dateFrom,
          periodEnd: bounds.dateTo,
          number,
          header: normalizeHeader(input.header),
          rows,
          totals,
          createdById: context.user?.id ?? null
        }
      })
      await logRegistry(context, registry, "create_passenger_service_registry", "Реестр услуг ФАП сформирован")
      return registry
    },

    updatePassengerServiceRegistry: async (_, { id, patch }, context) => {
      assertDispatcherScope(scopeOf(context))
      const registry = await loadRegistryOrThrow(id)
      assertNotApproved(registry)
      const data = {}
      if (patch?.number != null) data.number = normalizeNumber(patch.number)
      if (patch?.header != null) data.header = normalizeHeader(patch.header)
      const periodChanged = patch?.periodStart != null || patch?.periodEnd != null
      if (periodChanged) {
        const bounds = periodBounds(
          patch.periodStart ?? registry.periodStart,
          patch.periodEnd ?? registry.periodEnd
        )
        const snapshot = await buildSnapshot({
          kind: registry.kind,
          airlineId: registry.airlineId,
          airportId: registry.airportId,
          bounds
        })
        data.periodStart = bounds.dateFrom
        data.periodEnd = bounds.dateTo
        data.rows = snapshot.rows
        data.totals = snapshot.totals
      }
      if (Object.keys(data).length === 0) throw badInput("Пустой патч реестра")
      const updated = await prisma.passengerServiceRegistry.update({ where: { id }, data })
      await logRegistry(
        context,
        updated,
        "update_passenger_service_registry",
        periodChanged ? "Период реестра изменён, строки пересобраны" : "Шапка реестра изменена",
        registry
      )
      return updated
    },

    rebuildPassengerServiceRegistry: async (_, { id }, context) => {
      assertDispatcherScope(scopeOf(context))
      const registry = await loadRegistryOrThrow(id)
      assertNotApproved(registry)
      const { rows, totals } = await buildSnapshot({
        kind: registry.kind,
        airlineId: registry.airlineId,
        airportId: registry.airportId,
        bounds: { dateFrom: new Date(registry.periodStart), dateTo: new Date(registry.periodEnd) }
      })
      const updated = await prisma.passengerServiceRegistry.update({ where: { id }, data: { rows, totals } })
      await logRegistry(context, updated, "rebuild_passenger_service_registry", "Строки реестра пересобраны")
      return updated
    },

    deletePassengerServiceRegistry: async (_, { id }, context) => {
      assertDispatcherScope(scopeOf(context))
      const registry = await loadRegistryOrThrow(id)
      if (registry.submittedAt != null) {
        throw forbidden("Отправленный реестр не удаляется — сначала отзовите отправку")
      }
      await prisma.passengerServiceRegistry.delete({ where: { id } })
      await logRegistry(context, registry, "delete_passenger_service_registry", "Реестр услуг ФАП удалён")
      return true
    },

    submitPassengerServiceRegistry: async (_, { id }, context) => {
      assertDispatcherScope(scopeOf(context))
      const registry = await loadRegistryOrThrow(id)
      if (registry.submittedAt != null) return registry
      const updated = await prisma.passengerServiceRegistry.update({
        where: { id },
        data: { submittedAt: new Date() }
      })
      await logRegistry(context, updated, REGISTRY_ACTIONS.submit, "Реестр услуг ФАП отправлен авиакомпании")
      await notifyRegistrySubmitted({ registry: updated, actor: context.user ?? context.subject })
      return updated
    },

    unsubmitPassengerServiceRegistry: async (_, { id }, context) => {
      assertDispatcherScope(scopeOf(context))
      const registry = await loadRegistryOrThrow(id)
      assertNotApproved(registry)
      const updated = await prisma.passengerServiceRegistry.update({
        where: { id },
        data: { submittedAt: null }
      })
      await logRegistry(context, updated, "unsubmit_passenger_service_registry", "Отправка реестра авиакомпании отозвана")
      return updated
    },

    setPassengerServiceRegistryAirlineApproved: async (_, { id, approved, comment }, context) => {
      const scope = scopeOf(context)
      const registry = await loadRegistryOrThrow(id)
      assertAirlineOwnsRegistry(scope, registry)
      if (registry.submittedAt == null) throw forbidden("Реестр ещё не отправлен авиакомпании")
      // Отзыв без причины бесполезен: диспетчер узнает, что реестр вернули, но не
      // узнает, что править. При утверждении комментарий необязателен.
      const airlineComment = comment?.trim() || null
      if (!approved && !airlineComment) throw badInput("Укажите причину отзыва утверждения")

      // Было ли утверждение до этого решения — читаем ДО записи: отказ от
      // неутверждённого реестра это «вернула на доработку», а не «отозвала утверждение».
      const wasApproved = registry.airlineApprovedAt != null

      const now = new Date()
      const updated = await prisma.passengerServiceRegistry.update({
        where: { id },
        data: {
          airlineApprovedAt: approved ? now : null,
          // Комментарий перезаписывается каждым решением: он описывает последнее
          // слово авиакомпании (как у отчёта гостиницы).
          airlineComment,
          airlineCommentAt: airlineComment ? now : null
        }
      })
      const revokeDescription = wasApproved
        ? `Утверждение реестра отозвано авиакомпанией: ${airlineComment}`
        : `Реестр возвращён авиакомпанией на доработку: ${airlineComment}`
      await logRegistry(
        context,
        updated,
        approved ? REGISTRY_ACTIONS.approve : REGISTRY_ACTIONS.revoke,
        approved ? "Реестр утверждён авиакомпанией" : revokeDescription
      )
      const actor = context.user ?? context.subject
      if (approved) await notifyRegistryApproved({ registry: updated, actor, comment: airlineComment })
      else await notifyRegistryRevoked({ registry: updated, actor, comment: airlineComment, wasApproved })
      return updated
    }
  }
}

// Скоуп, маска и гейты реестров услуг ФАП.
//
// Диспетчер (resolveScope kind "all") видит всё и формирует; авиакомпания — только
// свои ОТПРАВЛЕННЫЕ реестры (черновик ей не показываем, как отчёт гостиницы);
// гостиница, внешние и denied — ничего: багаж от гостиницы скрыт целиком,
// воду и питание она не оказывает.

import { GraphQLError } from "graphql"
import { resolveScope } from "./fapScope.js"

// Ключи строк, которые авиакомпания не получает (registryRows.js).
export const INTERNAL_ROW_KEYS = ["driverName", "driverCost", "distanceKm", "supplierCost"]

const forbidden = (message) =>
  new GraphQLError(message, { extensions: { code: "FORBIDDEN", http: { status: 403 } } })

export { resolveScope as scopeOf }

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/

// Границы фильтра: YYYY-MM-DD — московские сутки (как resolvePeriodBounds в
// аналитике), полная ISO-строка — как есть. Невалидное — границы нет.
const filterBound = (value, endOfDay) => {
  if (!value) return null
  const date = DATE_ONLY_RE.test(value)
    ? new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}+03:00`)
    : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function assertDispatcherScope(scope) {
  if (scope?.kind === "all") return
  throw forbidden("Формировать реестры может только диспетчер")
}

export function assertAirlineOwnsRegistry(scope, registry) {
  if (scope?.kind === "airline" && scope.airlineId === registry?.airlineId) return
  throw forbidden("Утвердить реестр может только авиакомпания, которой он выставлен")
}

// Утверждённый реестр заморожен: правки и отзыв отправки — только после отзыва
// утверждения авиакомпанией.
export function assertNotApproved(registry) {
  if (registry?.airlineApprovedAt != null) {
    throw forbidden("Реестр утверждён авиакомпанией — сначала отзыв утверждения")
  }
}

export function registryVisibleForScope(scope, registry) {
  if (scope?.kind === "all") return true
  if (scope?.kind === "airline") {
    return registry?.airlineId === scope.airlineId && registry?.submittedAt != null
  }
  return false
}

// where для списка: фильтр пользователя + скоуп. null — субъекту список закрыт.
// Период фильтра пересекается с периодом реестра (не «вложен»): реестр за июнь
// найдётся и фильтром «с 15.06 по 15.07».
export function registryListWhere(scope, filter = {}) {
  if (scope?.kind !== "all" && scope?.kind !== "airline") return null
  const where = {}
  if (filter?.kind) where.kind = filter.kind
  if (filter?.airportId) where.airportId = filter.airportId
  if (filter?.airlineId) where.airlineId = filter.airlineId
  const to = filterBound(filter?.dateTo, true)
  if (to) where.periodStart = { lte: to }
  const from = filterBound(filter?.dateFrom, false)
  if (from) where.periodEnd = { gte: from }
  if (scope.kind === "airline") {
    where.airlineId = scope.airlineId
    where.submittedAt = { not: null }
  }
  return where
}

// Маска строк: снимок rows — Json, поэтому не-массив (старая запись, мусор) тоже
// нужно пережить — отдаём пустой список, а не падаем на .map.
export function maskRegistryRows(scope, rows) {
  const list = Array.isArray(rows) ? rows : []
  if (scope?.kind === "all") return list
  return list.map((row) => {
    const next = { ...row }
    for (const key of INTERNAL_ROW_KEYS) next[key] = null
    return next
  })
}

// Маска итогов: отсутствующий снимок — нули, чтобы схема получила объект, а не null.
export function maskRegistryTotals(scope, totals) {
  if (!totals) return { rowsCount: 0, airlineTotal: 0, internalCost: null }
  if (scope?.kind === "all") return totals
  return { ...totals, internalCost: null }
}

export function maskRegistryForScope(scope, registry) {
  if (scope?.kind === "all" || !registry) return registry
  return {
    ...registry,
    rows: maskRegistryRows(scope, registry.rows),
    totals: maskRegistryTotals(scope, registry.totals)
  }
}

// Стадия согласования отчёта по гостинице.
//
// Шаги идут строго по порядку: диспетчер отправил отчёт → согласовал цены →
// авиакомпания утвердила. Стадия — число пройденных ПОДРЯД шагов с первого,
// поэтому согласованные цены у неотправленного отчёта (на бэке отметки
// независимы, см. report.resolver.js) стадию не поднимают: черновик
// авиакомпания всё равно не видит.
//
// Зеркало фронтового kars-avia/src/Components/Blocks/FapV2/fapReportStages.js:
// чип стадии в карточке списка и фильтр списка обязаны говорить одно и то же.

import { hotelIndexesForScope } from "./fapScope.js"

// Имена стадий по порядку шагов: индекс имени и есть стадия.
export const PASSENGER_REPORT_STAGES = [
  "NOT_SUBMITTED",
  "SUBMITTED",
  "PRICING_APPROVED",
  "AIRLINE_APPROVED"
]

// -1 для неизвестного имени: такой стадии нет ни у одной заявки, и фильтр по
// нему честно вернёт пустую выдачу вместо молчаливого «показать всё».
export const passengerReportStageIndex = (name) =>
  PASSENGER_REPORT_STAGES.indexOf(name)

const stageDates = (report) => [
  report?.submittedAt ?? null,
  report?.pricingApprovedAt ?? null,
  report?.airlineApprovedAt ?? null
]

// Записи отчёта может не быть вовсе — она рождается только первым сохранением.
// Такая гостиница стоит на нулевой стадии, как и сохранённый, но не
// отправленный отчёт.
export function hotelReportStage(report) {
  const pending = stageDates(report).findIndex((date) => date == null)
  return pending === -1 ? PASSENGER_REPORT_STAGES.length - 1 : pending
}

export const reportsByHotelIndex = (reports) =>
  new Map((reports ?? []).map((report) => [report?.hotelIndex, report]))

// Индексы гостиниц, чью стадию зритель вправе видеть. Гостиница — только свои
// строки (hotelIndexesForScope), авиакомпания — только отправленные отчёты
// (черновик ей не показывают, то же правило, что в visibleHotelReports),
// остальные — все. Зеркало фронтового visibleHotelIndexes.
export function visibleReportHotelIndexes(scope, request, reportByIndex) {
  const own = hotelIndexesForScope(scope, request)
  const indexes =
    own ?? (request?.livingService?.hotels ?? []).map((_, index) => index)
  if (scope?.kind !== "airline") return indexes
  return indexes.filter((index) => reportByIndex.get(index)?.submittedAt != null)
}

// Стадия всей заявки — самая отстающая видимая гостиница. null означает «стадии
// нет»: видимых гостиниц у зрителя не осталось, и чипа в карточке тоже нет.
export function requestReportStage(scope, request, reports) {
  const byIndex = reportsByHotelIndex(reports)
  const indexes = visibleReportHotelIndexes(scope, request, byIndex)
  if (indexes.length === 0) return null
  return Math.min(...indexes.map((index) => hotelReportStage(byIndex.get(index))))
}

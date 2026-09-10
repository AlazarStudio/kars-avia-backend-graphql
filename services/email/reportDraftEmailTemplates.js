// Письма по решению авиакомпании о черновике отчёта эскадрильи: подтверждение
// и возврат на доработку. Формат — как у писем ФАП: короткий текст, комментарий
// отдельным блоком, ссылка в конце.

import {
  buildReportDraftUrl,
  buildSavedReportUrl
} from "./frontendEntityLinks.js"
import { escapeHtml as esc } from "./escapeHtml.js"

function span(text) {
  return `<span style='color:#545873'>${esc(text)}</span>`
}

function fmtDate(value) {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  const pad = (n) => String(n).padStart(2, "0")
  return `${pad(date.getUTCDate())}.${pad(date.getUTCMonth() + 1)}.${date.getUTCFullYear()}`
}

// Период отчёта — то, чем два отчёта одной авиакомпании различаются на вид:
// в теме письма он один и опознаёт отчёт до перехода по ссылке.
export function formatReportPeriod({ startDate, endDate }) {
  return `${fmtDate(startDate)} — ${fmtDate(endDate)}`
}

function reportLinkHtml(url, label) {
  if (!url) return ""
  const href = esc(url)
  return `<br><br>${label}:<br><a href="${href}">${href}</a>`
}

function airlineCommentHtml(comment) {
  const trimmed = String(comment ?? "").trim()
  if (!trimmed) return ""
  return `<br><br>Комментарий авиакомпании:<br>${span(trimmed)}`
}

export function buildAirlineReportDraftConfirmedEmail({
  airlineName,
  startDate,
  endDate,
  comment,
  draftId,
  savedReportId
}) {
  const airline = span(airlineName || "—")
  const period = span(formatReportPeriod({ startDate, endDate }))
  const subject = `Отчёт за ${formatReportPeriod({ startDate, endDate })} согласован авиакомпанией`
  // Ведём на выпущенный отчёт: черновик после подтверждения только читается, а
  // адресату письма нужен сам документ. На черновик падаем, если выпуск ещё не
  // связан с записью (SavedReport создаётся до отметки CONFIRMED).
  const link = savedReportId
    ? reportLinkHtml(buildSavedReportUrl(savedReportId), "Перейти к отчёту")
    : reportLinkHtml(buildReportDraftUrl(draftId), "Перейти к черновику отчёта")
  const html = `Отчёт авиакомпании ${airline} за период ${period} согласован и выпущен.${airlineCommentHtml(comment)}${link}`
  return { subject, html }
}

export function buildAirlineReportDraftRejectedEmail({
  airlineName,
  startDate,
  endDate,
  comment,
  draftId
}) {
  const airline = span(airlineName || "—")
  const period = span(formatReportPeriod({ startDate, endDate }))
  const subject = `Отчёт за ${formatReportPeriod({ startDate, endDate })} возвращён авиакомпанией на доработку`
  // Ведём на черновик: возврат вернул отчёт в DRAFT, править нужно именно его.
  const link = reportLinkHtml(
    buildReportDraftUrl(draftId),
    "Перейти к черновику отчёта"
  )
  const html = `Отчёт авиакомпании ${airline} за период ${period} возвращён на доработку. Отчёт нужно исправить и отправить заново.${airlineCommentHtml(comment)}${link}`
  return { subject, html }
}

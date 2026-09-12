// Письма по реестру услуг ФАП: отправка авиакомпании, утверждение и отзыв
// утверждения. Формат — как у писем черновиков отчётов (reportDraftEmailTemplates.js):
// короткий текст, комментарий отдельным блоком, ссылка в конце.

import { buildRegistryUrl } from "./frontendEntityLinks.js"
import { escapeHtml as esc } from "./escapeHtml.js"

const KIND_LABEL = {
  BAGGAGE: "по доставке багажа",
  CATERING: "по воде и питанию"
}

function span(text) {
  return `<span style='color:#545873'>${esc(text)}</span>`
}

function fmtDate(value) {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  // Границы периода хранятся как МСК-сутки; печатаем календарную дату по МСК.
  const msk = new Date(date.getTime() + 3 * 60 * 60 * 1000)
  const pad = (n) => String(n).padStart(2, "0")
  return `${pad(msk.getUTCDate())}.${pad(msk.getUTCMonth() + 1)}.${msk.getUTCFullYear()}`
}

export function formatRegistryPeriod({ periodStart, periodEnd }) {
  return `${fmtDate(periodStart)} — ${fmtDate(periodEnd)}`
}

// «Реестр №10 по доставке багажа за 01.06.2026 — 30.06.2026, г. Екатеринбург»
export function registryTitle(registry, city) {
  const kind = KIND_LABEL[registry?.kind] ?? "услуг"
  const where = city ? `, г. ${city}` : ""
  return `Реестр №${registry?.number ?? "—"} ${kind} за ${formatRegistryPeriod(registry)}${where}`
}

function linkHtml(registryId) {
  const url = buildRegistryUrl(registryId)
  if (!url) return ""
  const href = esc(url)
  return `<br><br>Перейти к реестру:<br><a href="${href}">${href}</a>`
}

function commentHtml(comment) {
  const trimmed = String(comment ?? "").trim()
  if (!trimmed) return ""
  return `<br><br>Комментарий авиакомпании:<br>${span(trimmed)}`
}

export function buildRegistrySubmittedEmail({ registry, airlineName, city }) {
  const title = registryTitle(registry, city)
  const subject = `${title} отправлен на утверждение`
  const html = `${span(title)} для авиакомпании ${span(airlineName || "—")} отправлен на утверждение.${linkHtml(registry.id)}`
  return { subject, html }
}

export function buildRegistryApprovedEmail({
  registry,
  airlineName,
  city,
  comment
}) {
  const title = registryTitle(registry, city)
  const subject = `${title} утверждён авиакомпанией`
  const html = `${span(title)} утверждён авиакомпанией ${span(airlineName || "—")}.${commentHtml(comment)}${linkHtml(registry.id)}`
  return { subject, html }
}

// wasApproved — было ли утверждение до отказа: у неутверждённого реестра
// авиакомпания ничего не отзывает, а возвращает его на доработку.
export function buildRegistryRevokedEmail({
  registry,
  airlineName,
  city,
  comment,
  wasApproved = true
}) {
  const title = registryTitle(registry, city)
  const subject = wasApproved
    ? `${title}: авиакомпания отозвала утверждение`
    : `${title}: авиакомпания вернула на доработку`
  const action = wasApproved ? "отозвала утверждение" : "вернула на доработку"
  const html = `Авиакомпания ${span(airlineName || "—")} ${action}: ${span(title)}. Реестр ждёт исправлений и повторного утверждения.${commentHtml(comment)}${linkHtml(registry.id)}`
  return { subject, html }
}

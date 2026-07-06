import { getFrontendUrl } from "../auth/appConfig.js"

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function span(text) {
  return `<span style='color:#545873'>${esc(text)}</span>`
}

function spanNo(text) {
  return span(`№${text}`)
}

function buildSupportChatUrl(chatId) {
  const base = getFrontendUrl()
  if (!base || !chatId) return ""
  return `${base}/support?chatId=${encodeURIComponent(chatId)}`
}

function supportChatLinkHtml(chatId) {
  const url = buildSupportChatUrl(chatId)
  if (!url) return ""
  const href = esc(url)
  return `<br><br>Перейти в чат поддержки:<br><a href="${href}">${href}</a>`
}

export function buildSupportClientMessageEmail({
  senderName,
  senderRole,
  textPreview,
  chatId,
  ticketNumber
}) {
  const name = senderName || "Пользователь"
  const subject = `Новое обращение в техподдержку от ${name}`

  const preview = span(
    textPreview?.length > 200 ? `${textPreview.slice(0, 200)}…` : textPreview
  )

  const roleLine = senderRole
    ? `<br>Роль: ${span(senderRole)}`
    : ""

  const ticketLine =
    ticketNumber != null
      ? `<br>Тикет: ${spanNo(ticketNumber)}`
      : ""

  const link = supportChatLinkHtml(chatId)

  const html = `Новое сообщение в техподдержку от ${span(name)}.${roleLine}${ticketLine}<br><br>${preview}${link}`

  return { subject, html }
}

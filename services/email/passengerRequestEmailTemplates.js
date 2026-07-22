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

function formatPassengerRequestLabel({ requestNumber, flightNumber }) {
  if (requestNumber) return spanNo(requestNumber)
  if (flightNumber) return span(flightNumber)
  return span("ФАП")
}

function buildPassengerRequestRelayUrl(passengerRequestId) {
  const base = getFrontendUrl()
  if (!base || !passengerRequestId) return ""
  return `${base}/far/${encodeURIComponent(passengerRequestId)}`
}

function passengerRequestRelayLinkHtml(passengerRequestId) {
  const url = buildPassengerRequestRelayUrl(passengerRequestId)
  if (!url) return ""
  const href = esc(url)
  return `<br><br>Перейти к ФАП:<br><a href="${href}">${href}</a>`
}

export function buildCreatePassengerRequestEmail({
  requestNumber,
  flightNumber,
  routeFrom,
  routeTo,
  airportName,
  airlineName,
  requestId
}) {
  const label = formatPassengerRequestLabel({ requestNumber, flightNumber })
  const routeParts = [routeFrom, routeTo].filter(Boolean)
  const route =
    routeParts.length > 0 ? span(routeParts.join(" → ")) : span("—")
  const airport = span(airportName || "—")
  const airline = span(airlineName || "—")
  const flight = span(flightNumber || "—")
  const link = passengerRequestRelayLinkHtml(requestId)
  const subject = requestNumber
    ? `Создан ФАП №${requestNumber}`
    : `Создан ФАП ${flightNumber || ""}`.trim()

  const html = `Создан ФАП ${label}, рейс ${flight}, маршрут ${route}, аэропорт ${airport}, авиакомпания ${airline}.<br>${link}`
  return { subject, html }
}

export function buildPassengerRequestDatesChangeEmail({
  requestNumber,
  flightNumber,
  oldFlightDate,
  newFlightDate,
  airlineName,
  requestId
}) {
  const label = formatPassengerRequestLabel({ requestNumber, flightNumber })
  const oldDate = span(oldFlightDate || "—")
  const newDate = span(newFlightDate || "—")
  const airline = span(airlineName || "—")
  const link = passengerRequestRelayLinkHtml(requestId)
  const noText = requestNumber || flightNumber || "ФАП"
  const subject = `Изменена дата рейса ФАП ${noText}`

  const html = `Дата рейса ФАП ${label} изменена с ${oldDate} на ${newDate}, авиакомпания ${airline}.<br>${link}`
  return { subject, html }
}

export function buildUpdatePassengerRequestEmail({
  requestNumber,
  flightNumber,
  description,
  requestId
}) {
  const label = formatPassengerRequestLabel({ requestNumber, flightNumber })
  const noText = requestNumber || flightNumber || "ФАП"
  const subject = `Обновлён ФАП ${noText}`
  const body = description ? esc(description) : "Данные ФАП обновлены."
  const link = passengerRequestRelayLinkHtml(requestId)
  const html = `ФАП ${label}: ${body}<br>${link}`
  return { subject, html }
}

export function buildCancelPassengerRequestEmail({
  requestNumber,
  flightNumber,
  cancelReason,
  requestId
}) {
  const label = formatPassengerRequestLabel({ requestNumber, flightNumber })
  const noText = requestNumber || flightNumber || "ФАП"
  const subject = `Отменён ФАП ${noText}`
  const reason = cancelReason ? span(cancelReason) : span("—")
  const link = passengerRequestRelayLinkHtml(requestId)
  const html = `ФАП ${label} отменён. Причина: ${reason}.<br>${link}`
  return { subject, html }
}

export function buildHotelChessPassengerRequestEmail({
  requestNumber,
  flightNumber,
  hotelName,
  personName,
  roomName,
  description,
  requestId
}) {
  const label = formatPassengerRequestLabel({ requestNumber, flightNumber })
  const noText = requestNumber || flightNumber || "ФАП"
  const subject = `Размещение по ФАП ${noText}`
  const link = passengerRequestRelayLinkHtml(requestId)

  if (hotelName && (personName || roomName)) {
    const person = personName ? span(personName) : span("—")
    const hotel = span(hotelName)
    const room = roomName ? span(roomName) : span("—")
    const html = `${person} — отель ${hotel}, номер ${room} по ФАП ${label}.<br>${link}`
    return { subject, html }
  }

  const body = description ? esc(description) : "Изменено размещение по ФАП."
  const html = `ФАП ${label}: ${body}<br>${link}`
  return { subject, html }
}

export function buildPassengerRequestActionEmail({
  requestNumber,
  flightNumber,
  description,
  fulldescription,
  requestId
}) {
  const noText = requestNumber || flightNumber || "ФАП"
  const short = description || "Изменение по ФАП"
  const subject = `ФАП ${noText}: ${short}`
  const body = fulldescription || description || short
  const label = formatPassengerRequestLabel({ requestNumber, flightNumber })
  const link = passengerRequestRelayLinkHtml(requestId)
  const html = `ФАП ${label}: ${esc(body)}<br>${link}`
  return { subject, html }
}

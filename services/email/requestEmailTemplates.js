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

function buildRequestRelayUrl(requestId) {
  const base = getFrontendUrl()
  if (!base || !requestId) return ""
  return `${base}/relay?id=${encodeURIComponent(requestId)}`
}

function requestRelayLinkHtml(requestId) {
  const url = buildRequestRelayUrl(requestId)
  if (!url) return ""
  const href = esc(url)
  return `<br><br>Перейти к заявке:<br><a href="${href}">${href}</a>`
}

function formatMealPlanLine(mealPlan) {
  if (!mealPlan?.included) {
    return span("не включено")
  }
  const yes = (v) => (v ? "да" : "нет")
  const parts = [
    `завтрак: ${yes(mealPlan.breakfastEnabled)}`,
    `обед: ${yes(mealPlan.lunchEnabled)}`,
    `ужин: ${yes(mealPlan.dinnerEnabled)}`
  ]
  return span(`включено (${parts.join(", ")})`)
}

export function buildCreateRequestEmail({
  requestNumber,
  personName,
  positionName,
  airportName,
  isPreliminary,
  airlineName,
  arrivalTime,
  departureTime,
  mealPlan,
  requestId
}) {
  const no = spanNo(requestNumber)
  const airport = span(airportName)
  const airline = span(airlineName)
  const arrival = span(arrivalTime)
  const departure = span(departureTime)
  const meal = formatMealPlanLine(mealPlan)
  const link = requestRelayLinkHtml(requestId)

  if (isPreliminary) {
    const subject = `Создана предварительная бронь №${requestNumber}`
    const html = `Поступила предварительная бронь ${no} в аэропорт ${airport} авиакомпания ${airline}.<br>
Заезд: ${arrival}, выезд: ${departure}.<br>
Питание: ${meal}.<br>
${link}`
    return { subject, html }
  }

  const subject = `Создана заявка №${requestNumber}`
  const person = span([positionName, personName].filter(Boolean).join(" "))
  const html = `Создана заявка ${no} для ${person} в аэропорт ${airport} авиакомпания ${airline}.<br>
Заезд: ${arrival}, выезд: ${departure}.<br>
Питание: ${meal}.<br>
${link}`
  return { subject, html }
}

function buildDateRangeEmail({
  requestNumber,
  oldArrival,
  oldDeparture,
  newArrival,
  newDeparture,
  subject,
  intro,
  airlineName,
  requestId
}) {
  const no = spanNo(requestNumber)
  const oldRange = span(`${oldArrival} — ${oldDeparture}`)
  const newRange = span(`${newArrival} — ${newDeparture}`)
  const airline = span(airlineName)
  const link = requestRelayLinkHtml(requestId)

  const html = `${intro} ${no} с ${oldRange} на ${newRange} авиакомпания ${airline}.<br>${link}`
  return { subject, html }
}

export function buildExtendRequestEmail({
  requestNumber,
  oldArrival,
  oldDeparture,
  newArrival,
  newDeparture,
  airlineName,
  requestId
}) {
  return buildDateRangeEmail({
    requestNumber,
    oldArrival,
    oldDeparture,
    newArrival,
    newDeparture,
    subject: `Запрос на изменение дат заявки №${requestNumber}`,
    intro: "Запрошено изменение дат заявки",
    airlineName,
    requestId
  })
}

export function buildUpdateRequestEmail({
  requestNumber,
  oldArrival,
  oldDeparture,
  newArrival,
  newDeparture
}) {
  const no = spanNo(requestNumber)
  const oldRange = span(`${oldArrival} — ${oldDeparture}`)
  const newRange = span(`${newArrival} — ${newDeparture}`)
  const subject = `Изменены даты заявки №${requestNumber}`
  const html = `Даты заявки ${no} обновлены с ${oldRange} до ${newRange}.`
  // add link to request in kars-frontend
  return { subject, html }
}

export function buildCancelRequestRequestEmail({ requestNumber, requestId }) {
  const subject = `Запрос на отмену заявки №${requestNumber}`
  const link = requestRelayLinkHtml(requestId)
  const html = `Запрошена отмена заявки ${spanNo(requestNumber)}.<br>${link}`
  return { subject, html }
}

export function buildCancelRequestDoneEmail({ requestNumber }) {
  const subject = `Заявка №${requestNumber} отменена`
  const html = `Заявка ${spanNo(requestNumber)} отменена.`
  return { subject, html }
}

export function buildHotelChessTransferEmail({
  requestNumber,
  roomName,
  requestId
}) {
  const subject = `Изменено размещение по заявке №${requestNumber}`
  const link = requestRelayLinkHtml(requestId)
  const html = `Размещение по заявке ${spanNo(requestNumber)} изменено: номер ${span(roomName)}.<br>${link}`
  return { subject, html }
}

export function buildHotelChessPlacementEmail({
  requestNumber,
  hotelName,
  roomName,
  personName,
  requestId
}) {
  const subject = `Заявка №${requestNumber} размещена в отеле`
  const person = personName
    ? span(personName)
    : span("Предварительная бронь")
  const link = requestRelayLinkHtml(requestId)
  const html = `${person} размещён(а) в отеле ${span(hotelName)} в номер ${span(roomName)} по заявке ${spanNo(requestNumber)}.<br>${link}`
  return { subject, html }
}

export function buildNewMessageEmail({
  requestNumber,
  reserveNumber,
  senderName,
  textPreview,
  requestId,
  reserveId
}) {
  const entityLabel = requestNumber
    ? `заявке ${spanNo(requestNumber)}`
    : reserveNumber
      ? `брони ${spanNo(reserveNumber)}`
      : "чате"
  const subject = requestNumber
    ? `Новое сообщение по заявке №${requestNumber}`
    : reserveNumber
      ? `Новое сообщение по брони №${reserveNumber}`
      : "Новое сообщение в чате"
  const preview = span(
    textPreview?.length > 200 ? `${textPreview.slice(0, 200)}…` : textPreview
  )
  const link = requestRelayLinkHtml(requestId || reserveId)
  const html = `Новое сообщение от ${span(senderName)} в ${entityLabel}:<br>${preview}<br>${link}`
  return { subject, html }
}

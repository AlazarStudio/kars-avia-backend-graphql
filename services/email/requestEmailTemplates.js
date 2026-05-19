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

export function buildCreateRequestEmail({
  requestNumber,
  personName,
  positionName,
  airportName,
  isPreliminary
}) {
  const no = spanNo(requestNumber)
  const airport = span(airportName)

  if (isPreliminary) {
    const subject = `Создана предварительная бронь №${requestNumber}`
    const html = `Поступила предварительная бронь ${no} в аэропорт ${airport}.`
    return { subject, html }
  }

  const subject = `Создана заявка №${requestNumber}`
  const person = span([positionName, personName].filter(Boolean).join(" "))
  const html = `Поступила заявка ${no} для ${person} в аэропорт ${airport}.`
  return { subject, html }
}

function buildDateRangeEmail({
  requestNumber,
  oldArrival,
  oldDeparture,
  newArrival,
  newDeparture,
  subject,
  intro
}) {
  const no = spanNo(requestNumber)
  const oldRange = span(`${oldArrival} — ${oldDeparture}`)
  const newRange = span(`${newArrival} — ${newDeparture}`)
  const html = `${intro} ${no} с ${oldRange} на ${newRange}.`
  return { subject, html }
}

export function buildExtendRequestEmail({
  requestNumber,
  oldArrival,
  oldDeparture,
  newArrival,
  newDeparture
}) {
  return buildDateRangeEmail({
    requestNumber,
    oldArrival,
    oldDeparture,
    newArrival,
    newDeparture,
    subject: `Запрос на изменение дат заявки №${requestNumber}`,
    intro: "Запрошено изменение дат заявки"
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
  return { subject, html }
}

export function buildCancelRequestRequestEmail({ requestNumber }) {
  const subject = `Запрос на отмену заявки №${requestNumber}`
  const html = `Запрошена отмена заявки ${spanNo(requestNumber)}.`
  return { subject, html }
}

export function buildCancelRequestDoneEmail({ requestNumber }) {
  const subject = `Заявка №${requestNumber} отменена`
  const html = `Заявка ${spanNo(requestNumber)} отменена.`
  return { subject, html }
}

export function buildHotelChessTransferEmail({ requestNumber, roomName }) {
  const subject = `Изменено размещение по заявке №${requestNumber}`
  const html = `Размещение по заявке ${spanNo(requestNumber)} изменено: номер ${span(roomName)}.`
  return { subject, html }
}

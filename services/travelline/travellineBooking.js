// Чистые хелперы логики бронирования TravelLine (тестируются node:test).

// Извлекает "HH:MM" из ISO-датавремени ("...T07:30") или строки времени ("07:30").
function timePart(dt) {
  if (!dt) return "00:00"
  const s = String(dt)
  const tIdx = s.indexOf("T")
  if (tIdx !== -1) return s.slice(tIdx + 1, tIdx + 6)
  if (/^\d{2}:\d{2}/.test(s)) return s.slice(0, 5)
  return "00:00"
}

// Строит stayDates + extraStay для РЗПВ (требование сертификации TravelLine №6).
// ВАЖНО: чтобы TravelLine применил доплату за ранний заезд/поздний выезд, нужно
// (1) выставить stayDates.arrivalDateTime/departureDateTime на фактическое
// (расширенное) время и (2) передать объект extraStay с earlyArrival/lateDeparture,
// где overriddenDateTime СОВПАДАЕТ со stayDates. Без extraStay TravelLine отвечает
// 400 "Check-in time should be the default time", а additionalServices он молча
// игнорирует (доплата не начисляется — extraStayCharge остаётся null).
export function buildStayDatesWithExtras(opts) {
  const arrivalDate = String(opts.arrival).slice(0, 10)
  const departureDate = String(opts.departure).slice(0, 10)

  const defaultArrival = `${arrivalDate}T${timePart(opts.checkInTime)}`
  const defaultDeparture = `${departureDate}T${timePart(opts.checkOutTime)}`

  const earlyArrival = opts.earlyCheckInDateTime
    ? `${arrivalDate}T${timePart(opts.earlyCheckInDateTime)}`
    : null
  const lateDeparture = opts.lateCheckOutDateTime
    ? `${departureDate}T${timePart(opts.lateCheckOutDateTime)}`
    : null

  const stayDates = {
    arrivalDateTime: earlyArrival ?? defaultArrival,
    departureDateTime: lateDeparture ?? defaultDeparture
  }

  let extraStay = null
  if (earlyArrival || lateDeparture) {
    extraStay = {}
    if (earlyArrival) extraStay.earlyArrival = { overriddenDateTime: earlyArrival }
    if (lateDeparture) extraStay.lateDeparture = { overriddenDateTime: lateDeparture }
  }

  return { stayDates, extraStay }
}

// Разбирает ответ POST /bookings/verify. При изменении цены/доступности TravelLine
// возвращает пустой booking и заполненный alternativeBooking (требование №7).
export function parseVerifyResponse(data) {
  const booking = data?.booking ?? null
  const alt = data?.alternativeBooking ?? null

  const bookingToken =
    booking?.createBookingToken ?? data?.createBookingToken ?? data?.token ?? null

  const bookingHasContent = !!(
    booking &&
    (booking.createBookingToken || (booking.roomStays && booking.roomStays.length))
  )

  const conditionChange =
    data?.conditionChange === true ||
    data?.isConditionChanged === true ||
    (!!alt && !bookingHasContent)

  let alternative = null
  if (conditionChange && alt) {
    const altStay = alt.roomStays?.[0] ?? alt.placements?.[0] ?? {}
    const total = altStay.total ?? alt.total ?? {}
    const priceBeforeTax = total.priceBeforeTax ?? null
    const tax = total.taxAmount ?? null
    const cp = alt.cancellationPolicy ?? altStay.cancellationPolicy ?? null
    alternative = {
      newPriceBeforeTax: priceBeforeTax,
      newTax: tax,
      newTotalPrice:
        priceBeforeTax != null ? priceBeforeTax + (tax ?? 0) : alt.totalPrice ?? null,
      newPenaltyAmount: cp?.penaltyAmount ?? null,
      newChecksum: altStay.checksum ?? alt.checksum ?? null,
      cancellationPolicy: cp,
      message: data?.message ?? "Цена или доступность изменились"
    }
  }

  return {
    conditionChange,
    createBookingToken: conditionChange ? null : bookingToken,
    alternative,
    booking
  }
}

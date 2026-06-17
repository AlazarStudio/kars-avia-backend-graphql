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

// Строит stayDates + additionalServices так, чтобы время РЗПВ строго совпадало
// со временем заезда/выезда в stayDates (требование сертификации TravelLine №6).
export function buildStayDatesWithExtras(opts) {
  const arrivalDate = String(opts.arrival).slice(0, 10)
  const departureDate = String(opts.departure).slice(0, 10)

  const additionalServices = []

  let arrivalTime = timePart(opts.checkInTime)
  if (opts.earlyCheckInDateTime) {
    arrivalTime = timePart(opts.earlyCheckInDateTime)
    additionalServices.push({
      type: "EarlyCheckIn",
      dateTimeLocal: `${arrivalDate}T${arrivalTime}`
    })
  }

  let departureTime = timePart(opts.checkOutTime)
  if (opts.lateCheckOutDateTime) {
    departureTime = timePart(opts.lateCheckOutDateTime)
    additionalServices.push({
      type: "LateCheckOut",
      dateTimeLocal: `${departureDate}T${departureTime}`
    })
  }

  return {
    stayDates: {
      arrivalDateTime: `${arrivalDate}T${arrivalTime}`,
      departureDateTime: `${departureDate}T${departureTime}`
    },
    additionalServices
  }
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

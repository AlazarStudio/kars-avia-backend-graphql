const TRANSFER_FIELDS = [
  "transferService",
  "departureTransferService",
  "intercityTransferService",
  "baggageDeliveryService"
]

const roundMoney = (v) => Math.round((Number(v) || 0) * 100) / 100

// Проживание/питание: суммируем ТОЛЬКО гостевые строки (fullName непустой);
// ghost/тарифные строки (пустой fullName) исключаем — иначе двойной счёт.
function sumHotelReportsCost(hotelReports) {
  let living = 0
  let meal = 0
  let hasGuestRow = false
  for (const rep of hotelReports || []) {
    const rows = Array.isArray(rep?.reportRows) ? rep.reportRows : []
    for (const row of rows) {
      const name = (row?.fullName ?? "").toString().trim()
      if (!name) continue
      hasGuestRow = true
      living += Number(row.accommodationCost) || 0
      meal += Number(row.foodCost) || 0
    }
  }
  return { living: roundMoney(living), meal: roundMoney(meal), hasGuestRow }
}

function sumTransferCost(request) {
  let sum = 0
  for (const field of TRANSFER_FIELDS) {
    const drivers = request?.[field]?.drivers || []
    for (const d of drivers) sum += Number(d?.reportCost) || 0
  }
  return roundMoney(sum)
}

function extractHotelNames(request) {
  const hotels = request?.livingService?.hotels || []
  return [...new Set(hotels.map((h) => (h?.name || "").trim()).filter(Boolean))]
}

function countRequestPeople(request) {
  if (Number.isFinite(request?.plannedPassengersCount) && request.plannedPassengersCount > 0) {
    return request.plannedPassengersCount
  }
  const hotels = request?.livingService?.hotels || []
  return hotels.reduce((acc, h) => acc + (h?.people?.length || 0), 0)
}

function countLinkedPeople(request) {
  const ids = new Set()
  for (const g of request?.passengerGroups || []) {
    for (const pid of g?.memberPersonIds || []) {
      if (pid) ids.add(pid)
    }
  }
  return ids.size
}

function computeCostMissing(request, hasGuestRow) {
  const hasLivingPlanned = (request?.livingService?.hotels || []).length > 0
  return hasLivingPlanned && !hasGuestRow
}

export function aggregatePassengerRequest(request) {
  const { living, meal, hasGuestRow } = sumHotelReportsCost(request?.hotelReports)
  const transfer = sumTransferCost(request)
  const costMissing = computeCostMissing(request, hasGuestRow)
  const total = roundMoney(living + meal + transfer)
  const roomNights = sumRoomNights(request?.hotelReports)
  const water = serviceCounts(request?.waterService)
  const mealSvc = serviceCounts(request?.mealService)
  return {
    requestId: request.id,
    requestNumber: request.requestNumber || null,
    flightNumber: request.flightNumber || null,
    flightDate: request.flightDate || null,
    airportId: request.airport?.id || request.airportId || null,
    airportName: request.airport?.name || null,
    airportCode: request.airport?.code || null,
    airlineId: request.airline?.id || request.airlineId || null,
    airlineName: request.airline?.name || null,
    hotelNames: extractHotelNames(request),
    peopleCount: countRequestPeople(request),
    groupsCount: (request?.passengerGroups ?? []).length,
    linkedPeopleCount: countLinkedPeople(request),
    ...countPersonCategories(request),
    crewCount: (request?.crewMembers || []).length,
    roomNights,
    avgPricePerNight: roomNights > 0 ? roundMoney(living / roomNights) : 0,
    transferArrival: sumTransferField(request, "transferService"),
    transferDeparture: sumTransferField(request, "departureTransferService"),
    transferBaggage: sumTransferField(request, "baggageDeliveryService"),
    transferIntercity: sumTransferField(request, "intercityTransferService"),
    ...countMeals(request?.hotelReports),
    waterPlanned: water.planned,
    waterServed: water.served,
    mealServicePlanned: mealSvc.planned,
    mealServiceServed: mealSvc.served,
    hotels: buildHotelsBreakdown(request),
    living,
    meal,
    transfer,
    total,
    status: request.status || null,
    costMissing
  }
}

export function buildPassengerAnalyticsTotals(rows) {
  const counted = rows.filter((r) => !r.costMissing)
  const sum = (k) => roundMoney(counted.reduce((a, r) => a + (Number(r[k]) || 0), 0))
  return {
    requestsCount: rows.length,
    peopleCount: counted.reduce((a, r) => a + (Number(r.peopleCount) || 0), 0),
    linkedPeopleCount: rows.reduce((a, r) => a + (Number(r.linkedPeopleCount) || 0), 0),
    adultsCount: counted.reduce((a, r) => a + (Number(r.adultsCount) || 0), 0),
    childrenCount: counted.reduce((a, r) => a + (Number(r.childrenCount) || 0), 0),
    infantsCount: counted.reduce((a, r) => a + (Number(r.infantsCount) || 0), 0),
    roomNights: sum("roomNights"),
    transferArrival: sum("transferArrival"),
    transferDeparture: sum("transferDeparture"),
    transferBaggage: sum("transferBaggage"),
    transferIntercity: sum("transferIntercity"),
    living: sum("living"),
    meal: sum("meal"),
    transfer: sum("transfer"),
    total: sum("total"),
    missingCostCount: rows.filter((r) => r.costMissing).length
  }
}

// Границы периода аналитики. Date-only строки ("YYYY-MM-DD") трактуем как
// московские календарные сутки (UTC+3; в РФ нет сезонного перевода времени):
// dateFrom — начало суток, dateTo — конец суток. flightDate пишется фронтом как
// локальная полночь МСК → UTC, поэтому UTC-границы теряли рейсы 1-го числа периода.
// Полные ISO-строки проходят как есть (совместимость с будущими вызовами).
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/

export function resolvePeriodBounds(dateFromInput, dateToInput) {
  const dateFrom = DATE_ONLY_RE.test(dateFromInput)
    ? new Date(`${dateFromInput}T00:00:00.000+03:00`)
    : new Date(dateFromInput)
  const dateTo = DATE_ONLY_RE.test(dateToInput)
    ? new Date(`${dateToInput}T23:59:59.999+03:00`)
    : new Date(dateToInput)
  if (Number.isNaN(dateFrom.getTime()) || Number.isNaN(dateTo.getTime())) {
    throw new Error("Некорректный период (dateFrom/dateTo)")
  }
  if (dateFrom > dateTo) {
    throw new Error("dateFrom не может быть позже dateTo")
  }
  return { dateFrom, dateTo }
}

function isGuestRow(row) {
  return ((row?.fullName ?? "").toString().trim()) !== ""
}

function guestRows(hotelReports) {
  const out = []
  for (const rep of hotelReports || []) {
    const rows = Array.isArray(rep?.reportRows) ? rep.reportRows : []
    for (const row of rows) {
      if (isGuestRow(row)) out.push(row)
    }
  }
  return out
}

function countPersonCategories(request) {
  const counts = { adultsCount: 0, childrenCount: 0, infantsCount: 0 }
  for (const h of request?.livingService?.hotels || []) {
    for (const p of h?.people || []) {
      const cat = p?.personCategory || "ADULT"
      if (cat === "CHILD") counts.childrenCount += 1
      else if (cat === "INFANT") counts.infantsCount += 1
      else counts.adultsCount += 1
    }
  }
  return counts
}

function sumTransferField(request, field) {
  const drivers = request?.[field]?.drivers || []
  return roundMoney(drivers.reduce((acc, d) => acc + (Number(d?.reportCost) || 0), 0))
}

function sumRoomNights(hotelReports) {
  return roundMoney(guestRows(hotelReports).reduce((acc, r) => acc + (Number(r?.daysCount) || 0), 0))
}

// Легаси-правило: счётчика нет (null/undefined), но цена приёма > 0 → 1 порция; явный 0 = 0.
function mealCount(row, meal) {
  const raw = row?.[meal + "Count"]
  if (raw == null) return Number(row?.[meal]) > 0 ? 1 : 0
  const n = Number(raw)
  return Number.isFinite(n) ? n : 0
}

function countMeals(hotelReports) {
  const counts = { breakfastsCount: 0, lunchesCount: 0, dinnersCount: 0, lunchboxesCount: 0 }
  for (const row of guestRows(hotelReports)) {
    counts.breakfastsCount += mealCount(row, "breakfast")
    counts.lunchesCount += mealCount(row, "lunch")
    counts.dinnersCount += mealCount(row, "dinner")
    if (row?.breakfastLunchbox) counts.lunchboxesCount += 1
    if (row?.lunchLunchbox) counts.lunchboxesCount += 1
    if (row?.dinnerLunchbox) counts.lunchboxesCount += 1
  }
  return counts
}

function serviceCounts(svc) {
  return {
    planned: Number(svc?.plan?.peopleCount) || 0,
    served: (svc?.people || []).length
  }
}

function buildHotelsBreakdown(request) {
  const reports = request?.hotelReports || []
  return (request?.livingService?.hotels || []).map((h, i) => {
    const rep = reports.find((r) => r?.hotelIndex === i)
    const rows = Array.isArray(rep?.reportRows) ? rep.reportRows.filter(isGuestRow) : []
    return {
      hotelName: h?.name || "",
      peopleCount: h?.people?.length || 0,
      roomNights: roundMoney(rows.reduce((acc, r) => acc + (Number(r?.daysCount) || 0), 0)),
      living: roundMoney(rows.reduce((acc, r) => acc + (Number(r?.accommodationCost) || 0), 0)),
      meal: roundMoney(rows.reduce((acc, r) => acc + (Number(r?.foodCost) || 0), 0)),
      reportSaved: rows.length > 0
    }
  })
}

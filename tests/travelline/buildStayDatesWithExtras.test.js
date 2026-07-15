import test from "node:test"
import assert from "node:assert/strict"
import { buildStayDatesWithExtras } from "../../services/travelline/travellineBooking.js"

const base = {
  arrival: "2026-07-15T13:00",
  departure: "2026-07-17T10:00",
  checkInTime: "13:00",
  checkOutTime: "10:00"
}

test("без РЗПВ: stayDates из checkInTime/checkOutTime, extraStay = null", () => {
  const r = buildStayDatesWithExtras(base)
  assert.equal(r.stayDates.arrivalDateTime, "2026-07-15T13:00")
  assert.equal(r.stayDates.departureDateTime, "2026-07-17T10:00")
  assert.equal(r.extraStay, null)
})

test("ранний заезд: stayDates.arrival на время РЗПВ + extraStay.earlyArrival", () => {
  const r = buildStayDatesWithExtras({
    ...base,
    earlyCheckInDateTime: "2026-07-15T07:30"
  })
  assert.equal(r.stayDates.arrivalDateTime, "2026-07-15T07:30")
  assert.equal(r.stayDates.departureDateTime, "2026-07-17T10:00")
  assert.deepEqual(r.extraStay, {
    earlyArrival: { overriddenDateTime: "2026-07-15T07:30" }
  })
})

test("поздний выезд: stayDates.departure на время РЗПВ + extraStay.lateDeparture", () => {
  const r = buildStayDatesWithExtras({
    ...base,
    lateCheckOutDateTime: "2026-07-17T19:30"
  })
  assert.equal(r.stayDates.arrivalDateTime, "2026-07-15T13:00")
  assert.equal(r.stayDates.departureDateTime, "2026-07-17T19:30")
  assert.deepEqual(r.extraStay, {
    lateDeparture: { overriddenDateTime: "2026-07-17T19:30" }
  })
})

test("оба РЗПВ: stayDates на расширенные времена + обе ветки extraStay с совпадающим overriddenDateTime", () => {
  const r = buildStayDatesWithExtras({
    ...base,
    earlyCheckInDateTime: "2026-07-15T07:30",
    lateCheckOutDateTime: "2026-07-17T19:30"
  })
  assert.equal(r.stayDates.arrivalDateTime, "2026-07-15T07:30")
  assert.equal(r.stayDates.departureDateTime, "2026-07-17T19:30")
  assert.deepEqual(r.extraStay, {
    earlyArrival: { overriddenDateTime: "2026-07-15T07:30" },
    lateDeparture: { overriddenDateTime: "2026-07-17T19:30" }
  })
  // overriddenDateTime обязан совпадать со stayDates, иначе TL вернёт 400
  assert.equal(r.extraStay.earlyArrival.overriddenDateTime, r.stayDates.arrivalDateTime)
  assert.equal(r.extraStay.lateDeparture.overriddenDateTime, r.stayDates.departureDateTime)
})

test("checkInTime как полное датавремя тоже даёт корректное время", () => {
  const r = buildStayDatesWithExtras({
    ...base,
    checkInTime: "2026-07-15T14:00"
  })
  assert.equal(r.stayDates.arrivalDateTime, "2026-07-15T14:00")
})

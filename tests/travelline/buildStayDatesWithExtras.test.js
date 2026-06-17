import test from "node:test"
import assert from "node:assert/strict"
import { buildStayDatesWithExtras } from "../../services/travelline/travellineBooking.js"

const base = {
  arrival: "2026-07-15T13:00",
  departure: "2026-07-17T10:00",
  checkInTime: "13:00",
  checkOutTime: "10:00"
}

test("без РЗПВ: stayDates из checkInTime/checkOutTime, services пуст", () => {
  const r = buildStayDatesWithExtras(base)
  assert.equal(r.stayDates.arrivalDateTime, "2026-07-15T13:00")
  assert.equal(r.stayDates.departureDateTime, "2026-07-17T10:00")
  assert.deepEqual(r.additionalServices, [])
})

test("ранний заезд: время stayDates совпадает с дополнительной услугой", () => {
  const r = buildStayDatesWithExtras({
    ...base,
    earlyCheckInDateTime: "2026-07-15T07:30"
  })
  assert.equal(r.stayDates.arrivalDateTime, "2026-07-15T07:30")
  assert.equal(r.additionalServices.length, 1)
  assert.deepEqual(r.additionalServices[0], {
    type: "EarlyCheckIn",
    dateTimeLocal: "2026-07-15T07:30"
  })
})

test("поздний выезд: время stayDates совпадает с услугой", () => {
  const r = buildStayDatesWithExtras({
    ...base,
    lateCheckOutDateTime: "2026-07-17T19:30"
  })
  assert.equal(r.stayDates.departureDateTime, "2026-07-17T19:30")
  assert.deepEqual(r.additionalServices[0], {
    type: "LateCheckOut",
    dateTimeLocal: "2026-07-17T19:30"
  })
})

test("оба РЗПВ одновременно — обе услуги и оба времени совпадают", () => {
  const r = buildStayDatesWithExtras({
    ...base,
    earlyCheckInDateTime: "2026-07-15T07:30",
    lateCheckOutDateTime: "2026-07-17T19:30"
  })
  assert.equal(r.stayDates.arrivalDateTime, "2026-07-15T07:30")
  assert.equal(r.stayDates.departureDateTime, "2026-07-17T19:30")
  assert.equal(r.additionalServices.length, 2)
})

test("checkInTime как полное датавремя тоже даёт корректное время", () => {
  const r = buildStayDatesWithExtras({
    ...base,
    checkInTime: "2026-07-15T14:00"
  })
  assert.equal(r.stayDates.arrivalDateTime, "2026-07-15T14:00")
})

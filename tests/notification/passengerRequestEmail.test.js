import test from "node:test"
import assert from "node:assert/strict"
import {
  getDispatcherFallbackForPassengerEmail,
  resolveEmailActionForLog
} from "../../services/notification/passengerRequestEmailActions.js"
import {
  buildCreatePassengerRequestEmail,
  buildHotelReportPricingApprovedEmail,
  buildPassengerRequestActionEmail
} from "../../services/email/passengerRequestEmailTemplates.js"

test("resolveEmailActionForLog maps hotel actions to placement", () => {
  assert.equal(
    resolveEmailActionForLog("add_passenger_request_hotel"),
    "update_hotel_chess_passenger_request"
  )
  assert.equal(
    resolveEmailActionForLog("add_passenger_request_driver"),
    "update_passenger_request"
  )
  assert.equal(
    resolveEmailActionForLog("create_passenger_request"),
    "create_passenger_request"
  )
  assert.equal(
    resolveEmailActionForLog("approve_passenger_request_hotel_report_pricing"),
    "approve_passenger_request_hotel_report_pricing"
  )
})

test("getDispatcherFallbackForPassengerEmail", () => {
  assert.equal(
    getDispatcherFallbackForPassengerEmail("create_passenger_request"),
    "EMAIL_KARS"
  )
  assert.equal(
    getDispatcherFallbackForPassengerEmail("update_passenger_request"),
    "EMAIL_RECEIVER"
  )
})

test("buildCreatePassengerRequestEmail includes flight and route", () => {
  const { subject, html } = buildCreatePassengerRequestEmail({
    requestNumber: "0001SVO0526f",
    flightNumber: "SU100",
    routeFrom: "SVO",
    routeTo: "LED",
    airportName: "Шереметьево",
    airlineName: "Аэрофлот",
    requestId: "abc"
  })
  assert.match(subject, /0001SVO0526f/)
  assert.match(html, /SU100/)
  assert.match(html, /SVO/)
})

test("buildCreatePassengerRequestEmail link uses far path", () => {
  const prev = process.env.FRONTEND_URL
  process.env.FRONTEND_URL = "https://karsavia.ru"
  try {
    const { html } = buildCreatePassengerRequestEmail({
      requestNumber: "0001",
      requestId: "6a1d29c2810501c3600f2572"
    })
    assert.match(html, /https:\/\/karsavia\.ru\/far\/6a1d29c2810501c3600f2572/)
    assert.doesNotMatch(html, /chatId/)
    assert.match(html, /Перейти к ФАП/)
  } finally {
    if (prev === undefined) delete process.env.FRONTEND_URL
    else process.env.FRONTEND_URL = prev
  }
})

test("buildPassengerRequestActionEmail uses description in subject", () => {
  const { subject } = buildPassengerRequestActionEmail({
    requestNumber: "0001SVO0526f",
    flightNumber: "SU100",
    description: "Водитель добавлен",
    requestId: "abc"
  })
  assert.match(subject, /Водитель добавлен/)
})

test("buildHotelReportPricingApprovedEmail names hotel and FAP", () => {
  const prev = process.env.FRONTEND_URL
  process.env.FRONTEND_URL = "https://karsavia.ru"
  try {
    const { subject, html } = buildHotelReportPricingApprovedEmail({
      requestNumber: "0001SVO0526f",
      flightNumber: "SU100",
      hotelName: "Азия",
      requestId: "abc123"
    })
    assert.match(subject, /Согласовано ценообразование/)
    assert.match(subject, /0001SVO0526f/)
    assert.match(html, /Азия/)
    assert.match(html, /https:\/\/karsavia\.ru\/far\/abc123/)
  } finally {
    if (prev === undefined) delete process.env.FRONTEND_URL
    else process.env.FRONTEND_URL = prev
  }
})

import test from "node:test"
import assert from "node:assert/strict"
import {
  getDispatcherFallbackForPassengerEmail,
  resolveEmailActionForLog
} from "../../services/notification/passengerRequestEmailActions.js"
import {
  buildCreatePassengerRequestEmail,
  buildHotelReportAirlineApprovedEmail,
  buildHotelReportAirlineRevokedEmail,
  buildHotelReportPricingApprovedEmail,
  buildHotelReportPricingRevokedEmail,
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
  // Отзыв утверждения — своё почтовое действие: без него письмо ушло бы общим
  // шаблоном «заявка обновлена», без причины и без флага меню отзыва.
  assert.equal(
    resolveEmailActionForLog("revoke_passenger_request_hotel_report_airline"),
    "revoke_passenger_request_hotel_report_airline"
  )
  assert.equal(
    resolveEmailActionForLog("revoke_passenger_request_hotel_report_pricing"),
    "revoke_passenger_request_hotel_report_pricing"
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

test("buildHotelReportAirlineRevokedEmail: причина и ссылка на ФАП в письме", () => {
  const prev = process.env.FRONTEND_URL
  process.env.FRONTEND_URL = "https://karsavia.ru"
  try {
    const { subject, html } = buildHotelReportAirlineRevokedEmail({
      requestNumber: "0001SVO0526f",
      flightNumber: "SU100",
      hotelName: "Азия",
      comment: "Завышены сутки у Иванова",
      requestId: "abc123"
    })
    assert.match(subject, /отозвала утверждение/)
    assert.match(subject, /0001SVO0526f/)
    assert.match(html, /Азия/)
    assert.match(html, /Комментарий авиакомпании/)
    assert.match(html, /Завышены сутки у Иванова/)
    assert.match(html, /https:\/\/karsavia\.ru\/far\/abc123/)
  } finally {
    if (prev === undefined) delete process.env.FRONTEND_URL
    else process.env.FRONTEND_URL = prev
  }
})

test("buildHotelReportAirlineApprovedEmail: комментарий необязателен", () => {
  const withComment = buildHotelReportAirlineApprovedEmail({
    requestNumber: "0001",
    hotelName: "Азия",
    comment: "Принято",
    requestId: "abc"
  })
  assert.match(withComment.html, /Комментарий авиакомпании/)
  assert.match(withComment.html, /Принято/)

  const without = buildHotelReportAirlineApprovedEmail({
    requestNumber: "0001",
    hotelName: "Азия",
    requestId: "abc"
  })
  assert.doesNotMatch(without.html, /Комментарий авиакомпании/)
})

test("комментарий авиакомпании экранируется в письме", () => {
  const { html } = buildHotelReportAirlineRevokedEmail({
    requestNumber: "0001",
    hotelName: "Азия",
    comment: "<script>alert(1)</script>",
    requestId: "abc"
  })
  assert.doesNotMatch(html, /<script>/)
  assert.match(html, /&lt;script&gt;/)
})

test("buildHotelReportPricingRevokedEmail: говорит о скрытии цен и ссылается на ФАП", () => {
  const prev = process.env.FRONTEND_URL
  process.env.FRONTEND_URL = "https://karsavia.ru"
  try {
    const { subject, html } = buildHotelReportPricingRevokedEmail({
      requestNumber: "0001SVO0526f",
      hotelName: "Азия",
      requestId: "abc123"
    })
    assert.match(subject, /Снято согласование ценообразования/)
    assert.match(subject, /0001SVO0526f/)
    assert.match(html, /Азия/)
    assert.match(html, /без цен/)
    assert.match(html, /https:\/\/karsavia\.ru\/far\/abc123/)
    // Подпись АК не гасилась — приписки о ней быть не должно.
    assert.doesNotMatch(html, /Утверждение отчёта авиакомпанией снято/)
  } finally {
    if (prev === undefined) delete process.env.FRONTEND_URL
    else process.env.FRONTEND_URL = prev
  }
})

test("buildHotelReportPricingRevokedEmail: погашенная подпись АК названа явно", () => {
  const { html } = buildHotelReportPricingRevokedEmail({
    requestNumber: "0001",
    hotelName: "Азия",
    airlineApprovalDropped: true,
    requestId: "abc"
  })
  assert.match(html, /Утверждение отчёта авиакомпанией снято вместе с ним/)
})

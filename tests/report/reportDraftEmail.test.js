// Письма по решению авиакомпании о черновике отчёта эскадрильи.

import test from "node:test"
import assert from "node:assert/strict"
import {
  buildAirlineReportDraftConfirmedEmail,
  buildAirlineReportDraftRejectedEmail,
  formatReportPeriod
} from "../../services/email/reportDraftEmailTemplates.js"

const period = {
  startDate: new Date("2026-07-01T00:00:00.000Z"),
  endDate: new Date("2026-07-31T00:00:00.000Z")
}

const withFrontendUrl = (url, fn) => {
  const prev = process.env.FRONTEND_URL
  process.env.FRONTEND_URL = url
  try {
    return fn()
  } finally {
    if (prev === undefined) delete process.env.FRONTEND_URL
    else process.env.FRONTEND_URL = prev
  }
}

test("formatReportPeriod печатает период, пустые даты не роняют", () => {
  assert.equal(formatReportPeriod(period), "01.07.2026 — 31.07.2026")
  assert.equal(formatReportPeriod({}), "— — —")
})

test("buildAirlineReportDraftRejectedEmail: причина и ссылка на черновик", () => {
  const { subject, html } = withFrontendUrl("https://karsavia.ru", () =>
    buildAirlineReportDraftRejectedEmail({
      airlineName: "Аэрофлот",
      ...period,
      comment: "Не тот тариф в строках 4–7",
      draftId: "draft-1"
    })
  )

  assert.match(subject, /возвращён авиакомпанией на доработку/)
  assert.match(subject, /01\.07\.2026/)
  assert.match(html, /Аэрофлот/)
  assert.match(html, /Комментарий авиакомпании/)
  assert.match(html, /Не тот тариф в строках 4–7/)
  assert.match(html, /Перейти к черновику отчёта/)
  assert.match(
    html,
    /https:\/\/karsavia\.ru\/reports\?reportdraftid=draft-1/
  )
})

test("buildAirlineReportDraftConfirmedEmail: ведёт на выпущенный отчёт", () => {
  const { subject, html } = withFrontendUrl("https://karsavia.ru", () =>
    buildAirlineReportDraftConfirmedEmail({
      airlineName: "Аэрофлот",
      ...period,
      draftId: "draft-1",
      savedReportId: "saved-9"
    })
  )

  assert.match(subject, /согласован авиакомпанией/)
  assert.match(html, /выпущен/)
  assert.doesNotMatch(html, /Комментарий авиакомпании/)
  assert.match(html, /Перейти к отчёту/)
  assert.match(html, /https:\/\/karsavia\.ru\/reports\?reportid=saved-9/)
  assert.doesNotMatch(html, /reportdraftid/)
})

test("buildAirlineReportDraftConfirmedEmail: без выпущенного отчёта падает на черновик", () => {
  const { html } = withFrontendUrl("https://karsavia.ru", () =>
    buildAirlineReportDraftConfirmedEmail({
      airlineName: "Аэрофлот",
      ...period,
      draftId: "draft-1"
    })
  )

  assert.match(
    html,
    /https:\/\/karsavia\.ru\/reports\?reportdraftid=draft-1/
  )
})

test("комментарий экранируется", () => {
  const { html } = buildAirlineReportDraftRejectedEmail({
    airlineName: "Аэрофлот",
    ...period,
    comment: "<b>fix</b>"
  })
  assert.doesNotMatch(html, /<b>fix<\/b>/)
  assert.match(html, /&lt;b&gt;fix/)
})

test("без FRONTEND_URL письмо остаётся без ссылки, но собирается", () => {
  const { html } = withFrontendUrl("", () =>
    buildAirlineReportDraftRejectedEmail({
      airlineName: "Аэрофлот",
      ...period,
      comment: "Не тот тариф",
      draftId: "draft-1"
    })
  )
  assert.doesNotMatch(html, /Перейти к/)
  assert.match(html, /Не тот тариф/)
})

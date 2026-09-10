// Ссылки раздела отчётов: выпущенный отчёт и черновик различаются параметром
// запроса, а не маршрутом.

import test from "node:test"
import assert from "node:assert/strict"
import {
  buildReportDraftUrl,
  buildSavedReportUrl
} from "../../services/email/frontendEntityLinks.js"

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

test("buildSavedReportUrl и buildReportDraftUrl различаются параметром", () => {
  withFrontendUrl("https://karsavia.ru", () => {
    assert.equal(
      buildSavedReportUrl("68f0"),
      "https://karsavia.ru/reports?reportid=68f0"
    )
    assert.equal(
      buildReportDraftUrl("68f0"),
      "https://karsavia.ru/reports?reportdraftid=68f0"
    )
  })
})

test("хвостовой слэш базы не удваивается", () => {
  withFrontendUrl("https://karsavia.ru/", () => {
    assert.equal(
      buildSavedReportUrl("68f0"),
      "https://karsavia.ru/reports?reportid=68f0"
    )
  })
})

test("идентификатор экранируется", () => {
  withFrontendUrl("https://karsavia.ru", () => {
    assert.equal(
      buildReportDraftUrl("a b&c"),
      "https://karsavia.ru/reports?reportdraftid=a%20b%26c"
    )
  })
})

test("без базы или без id ссылки нет", () => {
  withFrontendUrl("", () => {
    assert.equal(buildSavedReportUrl("68f0"), "")
    assert.equal(buildReportDraftUrl("68f0"), "")
  })
  withFrontendUrl("https://karsavia.ru", () => {
    assert.equal(buildSavedReportUrl(null), "")
    assert.equal(buildReportDraftUrl(undefined), "")
  })
})

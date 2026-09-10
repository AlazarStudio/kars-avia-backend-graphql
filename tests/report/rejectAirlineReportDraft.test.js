// Возврат отчёта эскадрильи авиакомпанией: гейт по субъекту, статусу и
// обязательному комментарию, гашение отметки возврата повторной отправкой.

import test from "node:test"
import assert from "node:assert/strict"
import resolvers from "../../resolvers/report/report.resolver.js"
import { installPrismaDouble } from "../helpers/prismaDouble.js"
import {
  installPubsubSpy,
  releasePubsubAfterTests
} from "../helpers/fapHarness.js"

releasePubsubAfterTests()

const makeDraft = (overrides = {}) => ({
  id: "draft-1",
  type: "AIRLINE",
  status: "SUBMITTED",
  airlineId: "airline-1",
  hotelId: null,
  startDate: new Date("2026-07-01T00:00:00.000Z"),
  endDate: new Date("2026-07-31T00:00:00.000Z"),
  filterJson: {},
  rows: [],
  submittedAt: new Date("2026-08-01T09:00:00.000Z"),
  confirmedAt: null,
  rejectedAt: null,
  airlineComment: null,
  airlineCommentAt: null,
  ...overrides
})

const airlineUser = {
  id: "u-air",
  name: "Админ АК",
  role: "AIRLINEADMIN",
  airlineId: "airline-1"
}

const dispatcherUser = {
  id: "u-disp",
  name: "Диспетчер",
  role: "SUPERADMIN",
  dispatcher: true
}

const makeContext = (user) => ({
  subjectType: "USER",
  subject: user,
  user
})

async function runDraft(name, args, { draft = makeDraft(), context } = {}) {
  const double = installPrismaDouble({
    documents: { reportDraft: draft, airline: { id: "airline-1", name: "АК-1" } }
  })
  const spy = installPubsubSpy()
  let result = null
  let error = null
  try {
    result = await resolvers.Mutation[name](null, args, context)
  } catch (e) {
    error = e
  } finally {
    spy.restore()
    double.restore()
  }

  return {
    result,
    error,
    updated: double.callsTo("reportDraft", "update").map((c) => c.args),
    notified: double.callsTo("notification", "create").map((c) => c.args.data),
    topics: spy.published.map((p) => p.topic)
  }
}

test("rejectAirlineReportDraft: возвращает черновик в DRAFT с комментарием и отметкой", async () => {
  const run = await runDraft(
    "rejectAirlineReportDraft",
    { id: "draft-1", comment: "  Не тот тариф в строках 4–7  " },
    { context: makeContext(airlineUser) }
  )

  assert.equal(run.error, null)
  const data = run.updated[0].data
  assert.equal(data.status, "DRAFT")
  assert.equal(data.submittedAt, null)
  assert.ok(data.rejectedAt instanceof Date)
  assert.equal(data.airlineComment, "Не тот тариф в строках 4–7")
  assert.equal(data.airlineCommentAt.getTime(), data.rejectedAt.getTime())
})

test("rejectAirlineReportDraft: уведомляет сайт и публикует событие", async () => {
  const run = await runDraft(
    "rejectAirlineReportDraft",
    { id: "draft-1", comment: "Не тот тариф" },
    { context: makeContext(airlineUser) }
  )

  assert.equal(run.notified.length, 1)
  assert.equal(
    run.notified[0].description.action,
    "reject_airline_report_draft"
  )
  assert.deepEqual(run.topics, ["NOTIFICATION"])
})

test("rejectAirlineReportDraft: без комментария отбивается и не пишет", async () => {
  for (const comment of ["", "   "]) {
    const run = await runDraft(
      "rejectAirlineReportDraft",
      { id: "draft-1", comment },
      { context: makeContext(airlineUser) }
    )

    const label = JSON.stringify(comment)
    assert.match(run.error.message, /Укажите причину возврата/, label)
    assert.equal(run.error.extensions.code, "BAD_USER_INPUT", label)
    assert.equal(run.updated.length, 0, `${label}: записи нет`)
    assert.equal(run.notified.length, 0, `${label}: уведомления нет`)
  }
})

test("rejectAirlineReportDraft: диспетчер вернуть отчёт не может — у него unsubmit", async () => {
  const run = await runDraft(
    "rejectAirlineReportDraft",
    { id: "draft-1", comment: "Не тот тариф" },
    { context: makeContext(dispatcherUser) }
  )

  assert.match(run.error.message, /только авиакомпания/)
  assert.equal(run.error.extensions.code, "FORBIDDEN")
  assert.equal(run.updated.length, 0)
})

test("rejectAirlineReportDraft: чужая авиакомпания отбивается", async () => {
  const run = await runDraft(
    "rejectAirlineReportDraft",
    { id: "draft-1", comment: "Не тот тариф" },
    {
      context: makeContext({ ...airlineUser, airlineId: "airline-2" })
    }
  )

  assert.equal(run.error.extensions.code, "FORBIDDEN")
  assert.equal(run.updated.length, 0)
})

test("rejectAirlineReportDraft: выпущенный и неотправленный отчёты не возвращаются", async () => {
  for (const status of ["DRAFT", "CONFIRMED"]) {
    const run = await runDraft(
      "rejectAirlineReportDraft",
      { id: "draft-1", comment: "Не тот тариф" },
      { draft: makeDraft({ status }), context: makeContext(airlineUser) }
    )

    assert.match(run.error.message, /Only SUBMITTED/, status)
    assert.equal(run.updated.length, 0, `${status}: записи нет`)
  }
})

test("rejectAirlineReportDraft: гостиничный черновик не возвращается", async () => {
  const run = await runDraft(
    "rejectAirlineReportDraft",
    { id: "draft-1", comment: "Не тот тариф" },
    {
      draft: makeDraft({ type: "HOTEL" }),
      context: makeContext(airlineUser)
    }
  )

  assert.match(run.error.message, /Only airline reports/)
  assert.equal(run.updated.length, 0)
})

test("submitAirlineReportDraft: повторная отправка гасит отметку возврата, комментарий оставляет", async () => {
  const run = await runDraft(
    "submitAirlineReportDraft",
    { id: "draft-1" },
    {
      draft: makeDraft({
        status: "DRAFT",
        submittedAt: null,
        rejectedAt: new Date("2026-08-02T10:00:00.000Z"),
        airlineComment: "Не тот тариф"
      }),
      context: makeContext(dispatcherUser)
    }
  )

  assert.equal(run.error, null)
  const data = run.updated[0].data
  assert.equal(data.status, "SUBMITTED")
  assert.equal(data.rejectedAt, null)
  assert.equal("airlineComment" in data, false)
})

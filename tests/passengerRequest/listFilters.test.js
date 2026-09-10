// Два фильтра списка ФАП, добавленные поверх плоских: вид услуг и
// согласованность отчёта.
//
// Вид услуг уходит в where обычным ИЛИ, а стадия отчёта считается в памяти —
// поэтому у неё проверяются не только вердикты, но и обращения в базу: ветка
// обязана оставаться двумя запросами и честно нарезать страницу ПОСЛЕ отбора.

import test from "node:test"
import assert from "node:assert/strict"
import resolvers from "../../resolvers/passengerRequest/passengerRequest.resolver.js"
import { installPrismaDouble } from "../helpers/prismaDouble.js"
import { releasePubsubAfterTests } from "../helpers/fapHarness.js"
import {
  makeContext,
  makeHotelContext
} from "./fixtures/passengerRequest.js"
import { passengerServiceFields } from "../../services/passengerRequest/serviceTable.js"
import {
  hotelReportStage,
  requestReportStage
} from "../../services/passengerRequest/hotelReportStage.js"
import { resolveScope } from "../../services/passengerRequest/fapScope.js"

releasePubsubAfterTests()

const DATE = "2026-09-01T10:00:00.000Z"

const report = (hotelIndex, { submitted, priced, approved } = {}) => ({
  hotelIndex,
  submittedAt: submitted ? DATE : null,
  pricingApprovedAt: priced ? DATE : null,
  airlineApprovedAt: approved ? DATE : null
})

const candidate = (id, hotelIds, hotelReports = []) => ({
  id,
  livingService: { hotels: hotelIds.map((hotelId) => ({ hotelId })) },
  hotelReports
})

const stageOf = (request, context = makeContext()) =>
  requestReportStage(resolveScope(context), request, request.hotelReports)

// --------- стадия отчёта: чистый счёт шагов ---------

test("стадия — число пройденных ПОДРЯД шагов, отсутствующий отчёт даёт ноль", () => {
  assert.equal(hotelReportStage(undefined), 0)
  assert.equal(hotelReportStage(report(0)), 0)
  assert.equal(hotelReportStage(report(0, { submitted: true })), 1)
  assert.equal(hotelReportStage(report(0, { submitted: true, priced: true })), 2)
  assert.equal(
    hotelReportStage(report(0, { submitted: true, priced: true, approved: true })),
    3
  )
})

test("отметки без отправки стадию не поднимают: черновик авиакомпании не виден", () => {
  // На бэке согласование цен от отправки независимо, и такое сочетание в базе
  // возможно. Шаги считаются подряд с первого, поэтому стадия остаётся нулевой.
  assert.equal(hotelReportStage(report(0, { priced: true, approved: true })), 0)
})

// --------- стадия заявки: самая отстающая ВИДИМАЯ гостиница ---------

test("стадия заявки равна самой отстающей гостинице, а не самой продвинутой", () => {
  const request = candidate("req-1", ["hotel-1", "hotel-2"], [
    report(0, { submitted: true, priced: true, approved: true })
  ])
  // У второй гостиницы записи отчёта нет вовсе — она и тянет заявку на ноль.
  assert.equal(stageOf(request), 0)
})

test("гостиница видит только свою строку, соседняя заявку не отстаёт", () => {
  const request = candidate("req-1", ["hotel-1", "hotel-2"], [
    report(0),
    report(1, { submitted: true, priced: true })
  ])
  assert.equal(stageOf(request), 0, "диспетчеру видны обе строки")
  assert.equal(stageOf(request, makeHotelContext("hotel-2")), 2)
})

test("авиакомпании неотправленные отчёты не видны и стадию не занижают", () => {
  const airline = makeContext({
    subject: { id: "u-2", role: "AIRLINEADMIN", airlineId: "airline-1" },
    user: { id: "u-2", role: "AIRLINEADMIN", airlineId: "airline-1" }
  })
  const request = candidate("req-1", ["hotel-1", "hotel-2"], [
    report(0),
    report(1, { submitted: true, priced: true })
  ])
  assert.equal(stageOf(request), 0)
  assert.equal(stageOf(request, airline), 2)
})

test("без видимых гостиниц стадии нет вовсе — это null, а не ноль", () => {
  assert.equal(stageOf(candidate("req-1", [])), null)
  assert.equal(
    stageOf(candidate("req-1", ["hotel-1"]), makeHotelContext("hotel-9")),
    null
  )
})

// --------- вид услуг ---------

test("виды услуг разворачиваются в поля документа, неизвестное имя выпадает", () => {
  assert.deepEqual(passengerServiceFields(["WATER", "BAGGAGE_DELIVERY"]), [
    "waterService",
    "baggageDeliveryService"
  ])
  assert.deepEqual(passengerServiceFields(["WATER", "WATER"]), ["waterService"])
  assert.deepEqual(passengerServiceFields(["НЕТ_ТАКОЙ"]), [])
  assert.deepEqual(passengerServiceFields(undefined), [])
})

async function runList(args, context = makeContext()) {
  const double = installPrismaDouble({ documents: {} })
  try {
    await resolvers.Query.passengerRequests(null, args, context)
    return double.callsTo("passengerRequest", "findMany")[0]?.args?.where ?? null
  } finally {
    double.restore()
  }
}

test("услуги ложатся в AND одним ИЛИ по включённым планам", async () => {
  const where = await runList({ filter: { services: ["LIVING", "TRANSFER"] } })
  assert.deepEqual(where, {
    AND: [
      {
        OR: [
          { livingService: { is: { plan: { is: { enabled: true } } } } },
          { transferService: { is: { plan: { is: { enabled: true } } } } }
        ]
      }
    ]
  })
})

test("пустой список услуг фильтр не сужает", async () => {
  assert.deepEqual(await runList({ filter: { services: [] } }), {})
})

// --------- согласованность отчёта в списке ---------

// Двойник отдаёт один и тот же массив на любой findMany, поэтому ветку стадии
// обслуживаем вручную: первый вызов — кандидаты, второй — страница по id.
async function runStageList(args, { candidates, context = makeContext() } = {}) {
  let seen = 0
  const double = installPrismaDouble({
    overrides: {
      passengerRequest: {
        findMany: async (callArgs) => {
          seen += 1
          if (seen === 1) return candidates
          const ids = callArgs.where.id.in
          return candidates.filter((item) => ids.includes(item.id))
        }
      }
    }
  })
  try {
    const result = await resolvers.Query.passengerRequests(null, args, context)
    const calls = double.callsTo("passengerRequest", "findMany")
    return { ids: result.map((item) => item.id), calls }
  } finally {
    double.restore()
  }
}

const STAGE_SET = [
  candidate("req-none", []),
  candidate("req-draft", ["hotel-1"], [report(0)]),
  candidate("req-sent", ["hotel-1"], [report(0, { submitted: true })]),
  candidate("req-priced", ["hotel-1"], [
    report(0, { submitted: true, priced: true })
  ]),
  candidate("req-approved", ["hotel-1"], [
    report(0, { submitted: true, priced: true, approved: true })
  ])
]

test("каждая стадия отбирает ровно свои заявки", async () => {
  const byStage = {
    NOT_SUBMITTED: ["req-draft"],
    SUBMITTED: ["req-sent"],
    PRICING_APPROVED: ["req-priced"],
    AIRLINE_APPROVED: ["req-approved"]
  }
  for (const [stage, expected] of Object.entries(byStage)) {
    const run = await runStageList(
      { filter: { reportStage: stage } },
      { candidates: STAGE_SET }
    )
    assert.deepEqual(run.ids, expected, stage)
  }
})

test("заявка без гостиниц не попадает ни в одну стадию", async () => {
  for (const stage of [
    "NOT_SUBMITTED",
    "SUBMITTED",
    "PRICING_APPROVED",
    "AIRLINE_APPROVED"
  ]) {
    const run = await runStageList(
      { filter: { reportStage: stage } },
      { candidates: STAGE_SET }
    )
    assert.ok(!run.ids.includes("req-none"), stage)
  }
})

test("страница нарезается ПОСЛЕ отбора, а не вместо него", async () => {
  const candidates = [
    candidate("a", ["hotel-1"], [report(0, { submitted: true })]),
    candidate("b", ["hotel-1"], [report(0)]),
    candidate("c", ["hotel-1"], [report(0, { submitted: true })]),
    candidate("d", ["hotel-1"], [report(0, { submitted: true })])
  ]
  const run = await runStageList(
    { filter: { reportStage: "SUBMITTED" }, skip: 1, take: 1 },
    { candidates }
  )
  // skip/take в базу не уходят: пропусти база строку «b», страница из одного
  // элемента вернула бы «d» вместо «c».
  assert.deepEqual(run.ids, ["c"])
  assert.equal(run.calls[0].args.skip, undefined)
  assert.equal(run.calls[0].args.take, undefined)
})

test("ветка стадии стоит ровно два обращения, а пустой отбор — одно", async () => {
  const full = await runStageList(
    { filter: { reportStage: "SUBMITTED" } },
    { candidates: STAGE_SET }
  )
  assert.equal(full.calls.length, 2)

  const empty = await runStageList(
    { filter: { reportStage: "SUBMITTED" } },
    { candidates: [candidate("req-none", [])] }
  )
  assert.deepEqual(empty.ids, [])
  assert.equal(empty.calls.length, 1, "за пустой страницей в базу не ходим")
})

test("кандидаты сужаются наличием гостиниц, а отправка требуется со второй стадии", async () => {
  const hotelsPresent = { livingService: { is: { hotels: { isEmpty: false } } } }
  const someSubmitted = { hotelReports: { some: { submittedAt: { not: null } } } }

  const draft = await runStageList(
    { filter: { reportStage: "NOT_SUBMITTED" } },
    { candidates: STAGE_SET }
  )
  assert.deepEqual(draft.calls[0].args.where, { AND: [{}, hotelsPresent] })

  const sent = await runStageList(
    { filter: { reportStage: "SUBMITTED" } },
    { candidates: STAGE_SET }
  )
  assert.deepEqual(sent.calls[0].args.where, {
    AND: [{}, hotelsPresent, someSubmitted]
  })
})

test("остальные фильтры и скоуп доживают до ветки стадии целиком", async () => {
  const run = await runStageList(
    {
      filter: {
        reportStage: "SUBMITTED",
        airlineId: "airline-1",
        search: "TS001"
      }
    },
    { candidates: STAGE_SET }
  )
  const where = run.calls[0].args.where
  assert.deepEqual(where.AND[0].airlineId, "airline-1")
  assert.equal(where.AND[0].AND.length, 1, "поиск остался в исходном AND")
})

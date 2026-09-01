// Видимость отчёта по гостинице: два независимых правила.
//
// 1. Авиакомпания видит только ОТПРАВЛЕННЫЙ на проверку отчёт (submittedAt
//    заполнен). До правки оно жило серверно только в аналитике, а для самого
//    отчёта было клиентским — строки уезжали в браузер авиакомпании целиком.
// 2. Гостиница видит только СВОЙ отчёт: заявка общая, рядом в ней стоят
//    гостиницы других организаций, и их отчёт — чужие деньги. Зеркало
//    фронтового visibleHotelIndexes (kars-avia, FapV2/fapReportAccess.js).
//
// Здесь закрепляется серверная сторона обоих.

import test from "node:test"
import assert from "node:assert/strict"
import resolvers from "../../resolvers/passengerRequest/passengerRequest.resolver.js"
import { installPrismaDouble } from "../helpers/prismaDouble.js"
import { releasePubsubAfterTests } from "../helpers/fapHarness.js"
import {
  makeContext,
  makeHotelContext,
  makeHotelRoleContext
} from "./fixtures/passengerRequest.js"

releasePubsubAfterTests()

const airlineContext = () => ({
  subjectType: "USER",
  subject: { id: "u-air", name: "АК Тестовая", role: "AIRLINEADMIN", airlineId: "airline-1" },
  user: { id: "u-air", name: "АК Тестовая", role: "AIRLINEADMIN", airlineId: "airline-1" }
})

const DRAFT = { id: "rep-0", passengerRequestId: "req-1", hotelIndex: 0, submittedAt: null, reportRows: [{ fullName: "Черновик" }] }
const SENT = { id: "rep-1", passengerRequestId: "req-1", hotelIndex: 1, submittedAt: new Date("2026-08-01T10:00:00.000Z"), reportRows: [{ fullName: "Отправлен" }] }

const parent = { id: "req-1" }

async function reports(context, documents) {
  const double = installPrismaDouble({ documents })
  try {
    return await resolvers.PassengerRequest.hotelReports(parent, {}, context)
  } finally {
    double.restore()
  }
}

async function oneReport(context, documents, hotelIndex) {
  const double = installPrismaDouble({ documents })
  try {
    return await resolvers.PassengerRequest.hotelReport(parent, { hotelIndex }, context)
  } finally {
    double.restore()
  }
}

test("авиакомпании отдаётся только отправленный отчёт", async () => {
  const list = await reports(airlineContext(), {
    passengerRequestHotelReportMany: [DRAFT, SENT]
  })
  assert.deepEqual(
    list.map((r) => r.id),
    ["rep-1"],
    "черновик до авиакомпании не доезжает"
  )
})

test("диспетчеру отдаются оба отчёта", async () => {
  // Обратная проверка: правило режет ТОЛЬКО авиакомпанию. Диспетчер заполняет
  // отчёт и обязан видеть его до отправки, иначе отправлять будет нечего.
  const list = await reports(makeContext(), {
    passengerRequestHotelReportMany: [DRAFT, SENT]
  })
  assert.deepEqual(list.map((r) => r.id), ["rep-0", "rep-1"])
})

test("одиночный hotelReport закрыт тем же правилом", async () => {
  // Иначе черновик достаётся в обход списка — просто по индексу гостиницы.
  const draft = await oneReport(airlineContext(), { passengerRequestHotelReport: DRAFT }, 0)
  assert.equal(draft, null, "черновик по индексу авиакомпании не отдаётся")

  const sent = await oneReport(airlineContext(), { passengerRequestHotelReport: SENT }, 1)
  assert.equal(sent?.id, "rep-1", "отправленный отдаётся")

  const forDispatcher = await oneReport(makeContext(), { passengerRequestHotelReport: DRAFT }, 0)
  assert.equal(forDispatcher?.id, "rep-0", "диспетчеру черновик виден")
})

test("отсутствующий отчёт остаётся null, а не падает", async () => {
  const missing = await oneReport(airlineContext(), {}, 0)
  assert.equal(missing, null)
})

// ─────────────────────── гостиница видит только свой отчёт ───────────────────────

// Заявка с двумя гостиницами: индекс 0 принадлежит hotel-1, индекс 1 —
// hotel-2. Именно по этому массиву считается «своя строка»: у самой записи
// отчёта организации нет, есть только номер гостиницы в заявке.
const sharedParent = {
  id: "req-1",
  livingService: {
    hotels: [
      { hotelId: "hotel-1", name: "Азия" },
      { hotelId: "hotel-2", name: "Чаплан" }
    ]
  }
}

async function scopedReports(context, documents, parent = sharedParent) {
  const double = installPrismaDouble({ documents })
  try {
    return await resolvers.PassengerRequest.hotelReports(parent, {}, context)
  } finally {
    double.restore()
  }
}

async function scopedReport(context, documents, hotelIndex, parent = sharedParent) {
  const double = installPrismaDouble({ documents })
  let result = null
  try {
    result = await resolvers.PassengerRequest.hotelReport(
      parent,
      { hotelIndex },
      context
    )
  } finally {
    double.restore()
  }
  return { result, double }
}

test("список отчётов гостинице сужается до её собственного", async () => {
  const documents = { passengerRequestHotelReportMany: [DRAFT, SENT] }

  const first = await scopedReports(makeHotelContext("hotel-1"), documents)
  assert.deepEqual(first.map((r) => r.id), ["rep-0"], "чужой отчёт не отдаётся")

  const second = await scopedReports(makeHotelContext("hotel-2"), documents)
  assert.deepEqual(second.map((r) => r.id), ["rep-1"])

  // Правило про submittedAt тут ни при чём: свой отчёт гостиница видит и
  // черновиком (rep-0 не отправлен) — она его и заполняет.
  assert.equal(first[0].submittedAt, null)
})

test("ролевая учётка гостиницы в CRM сужается так же, как магик-линк", async () => {
  const documents = { passengerRequestHotelReportMany: [DRAFT, SENT] }
  const list = await scopedReports(makeHotelRoleContext("hotel-2"), documents)
  assert.deepEqual(list.map((r) => r.id), ["rep-1"])
})

test("одиночный hotelReport по чужому индексу не ходит в базу вовсе", async () => {
  // Отказ ДО запроса: иначе разница между «null, потому что нет» и «null,
  // потому что чужой» подтверждала бы существование чужого отчёта, да и
  // лишний запрос на каждое поле не нужен.
  const foreign = await scopedReport(
    makeHotelContext("hotel-2"),
    { passengerRequestHotelReport: DRAFT },
    0
  )
  assert.equal(foreign.result, null)
  assert.equal(
    foreign.double.callsTo("passengerRequestHotelReport").length,
    0,
    "чужой индекс до базы не доходит"
  )

  const own = await scopedReport(
    makeHotelContext("hotel-1"),
    { passengerRequestHotelReport: DRAFT },
    0
  )
  assert.equal(own.result?.id, "rep-0")
})

test("гостиница без своей строки в заявке не видит ни одного отчёта", async () => {
  // Такой субъект до полей заявки в бою не доходит (assertCanAccessRequest
  // режет гостиницу вне заявки), но правило обязано быть замкнутым и здесь:
  // «нет своих индексов» значит пустой список, а не полный.
  const list = await scopedReports(makeHotelContext("hotel-999"), {
    passengerRequestHotelReportMany: [DRAFT, SENT]
  })
  assert.deepEqual(list, [])
})

test("негостиничным зрителям сужение по гостинице не применяется", async () => {
  const documents = { passengerRequestHotelReportMany: [DRAFT, SENT] }

  const dispatcher = await scopedReports(makeContext(), documents)
  assert.deepEqual(dispatcher.map((r) => r.id), ["rep-0", "rep-1"])

  // Авиакомпании по-прежнему режет ТОЛЬКО правило submittedAt.
  const airline = await scopedReports(airlineContext(), documents)
  assert.deepEqual(airline.map((r) => r.id), ["rep-1"])
})

const pricedRow = {
  fullName: "Иванов",
  roomNumber: "101",
  accommodationCost: 3500,
  foodCost: 200,
  pricePerDay: 3500,
  tariffName: "стандарт"
}

test("АК видит состав без цен, пока ценообразование не согласовано", () => {
  const rows = resolvers.PassengerRequestHotelReport.reportRows(
    { submittedAt: new Date(), pricingApprovedAt: null, reportRows: [pricedRow] },
    {},
    airlineContext()
  )
  assert.equal(rows[0].fullName, "Иванов")
  assert.equal(rows[0].roomNumber, "101")
  assert.equal(rows[0].accommodationCost, null)
  assert.equal(rows[0].foodCost, null)
  assert.equal(rows[0].pricePerDay, null)
  assert.equal(rows[0].tariffName, null)
})

test("после согласования АК видит цены; диспетчер — всегда", () => {
  const approved = resolvers.PassengerRequestHotelReport.reportRows(
    {
      submittedAt: new Date(),
      pricingApprovedAt: new Date(),
      reportRows: [pricedRow]
    },
    {},
    airlineContext()
  )
  assert.equal(approved[0].accommodationCost, 3500)

  const dispatcher = resolvers.PassengerRequestHotelReport.reportRows(
    { submittedAt: null, pricingApprovedAt: null, reportRows: [pricedRow] },
    {},
    makeContext()
  )
  assert.equal(dispatcher[0].accommodationCost, 3500)
})

test("pricingApproved считается по pricingApprovedAt", () => {
  assert.equal(
    resolvers.PassengerRequestHotelReport.pricingApproved({
      pricingApprovedAt: null
    }),
    false
  )
  assert.equal(
    resolvers.PassengerRequestHotelReport.pricingApproved({
      pricingApprovedAt: new Date()
    }),
    true
  )
})

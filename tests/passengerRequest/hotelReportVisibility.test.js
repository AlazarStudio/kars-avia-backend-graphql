// Видимость отчёта по гостинице для авиакомпании.
//
// Правило: авиакомпания видит только ОТПРАВЛЕННЫЙ на проверку отчёт
// (submittedAt заполнен). До правки оно жило серверно только в аналитике, а
// для самого отчёта было клиентским — строки уезжали в браузер авиакомпании
// целиком. Здесь закрепляется серверная сторона.

import test from "node:test"
import assert from "node:assert/strict"
import resolvers from "../../resolvers/passengerRequest/passengerRequest.resolver.js"
import { installPrismaDouble } from "../helpers/prismaDouble.js"
import { releasePubsubAfterTests } from "../helpers/fapHarness.js"
import { makeContext } from "./fixtures/passengerRequest.js"

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

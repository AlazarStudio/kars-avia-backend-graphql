// Резолвер passengerAnalytics: кому отдаём аналитику и с какими деньгами.
//
// Регрессия ревью 2026-10-05: персонал АК из приложения (context.user === null),
// водитель и учётка с неизвестной ролью проходили allMiddleware и получали
// заявки ВСЕХ авиакомпаний с деньгами диспетчера (неутверждённые отчёты
// гостиниц и поставка воды/питания).

import test from "node:test"
import assert from "node:assert/strict"
import analyticsResolver from "../../resolvers/analytics/analytics.resolver.js"
import { installPrismaDouble } from "../helpers/prismaDouble.js"
import { releasePubsubAfterTests } from "../helpers/fapHarness.js"

releasePubsubAfterTests()

const INPUT = { dateFrom: "2026-09-01", dateTo: "2026-09-30" }

// Отчёт гостиницы не отправлен АК, поставка с ценой — обе суммы диспетчерские.
const REQUEST = {
  id: "req-1",
  requestNumber: "0001ABA0926f",
  flightNumber: "TEST001",
  flightDate: "2026-09-10T00:00:00.000Z",
  status: "COMPLETED",
  airlineId: "airline-1",
  airline: { id: "airline-1", name: "АК-1" },
  airport: { id: "airport-1", name: "Абакан", code: "ABA" },
  livingService: {
    hotels: [{ name: "Азия", people: [{ fullName: "Иванов Иван" }] }]
  },
  waterService: {
    plan: { enabled: true },
    quantity: 10,
    unitPrice: 50,
    deliveryCost: 100
  },
  hotelReports: [
    {
      submittedAt: null,
      pricingApprovedAt: null,
      reportRows: [{ fullName: "Иванов Иван", accommodationCost: 3500, foodCost: 0 }]
    }
  ]
}

const userContext = (role, extra = {}) => {
  const subject = { id: `user-${role}`, role, refreshToken: "s", ...extra }
  return { subjectType: "USER", subject, user: subject, decoded: { role } }
}

// Форма из middlewares/authContext.js: запись персонала лежит в subject, user — null.
// Роль из базы — @default(USER), поэтому allMiddleware его пропускает.
const personalContext = () => {
  const subject = { id: "p1", role: "USER", airlineId: "airline-1", refreshToken: "s" }
  return {
    subjectType: "AIRLINE_PERSONAL",
    subject,
    user: null,
    personal: subject,
    decoded: { role: "AIRLINE_PERSONAL" }
  }
}

const driverContext = () => {
  const subject = { id: "d1", refreshToken: "s" }
  return {
    subjectType: "DRIVER",
    subject,
    user: null,
    driver: subject,
    decoded: { role: "DRIVER" }
  }
}

async function runAnalytics(context, input = INPUT) {
  const queries = []
  const prismaDouble = installPrismaDouble({
    overrides: {
      passengerRequest: {
        findMany: (args) => {
          queries.push(args)
          return [structuredClone(REQUEST)]
        }
      }
    }
  })
  try {
    const result = await analyticsResolver.Query.passengerAnalytics(
      null,
      { input },
      context
    )
    return { result, queries, prismaDouble }
  } catch (error) {
    return { error, queries, prismaDouble }
  } finally {
    prismaDouble.restore()
  }
}

const assertForbidden = ({ error, queries }) => {
  assert.equal(error?.extensions?.code, "FORBIDDEN")
  assert.equal(queries.length, 0, "заявки не читаются")
}

test("персонал АК из приложения получает отказ, даже со своей airlineId", async () => {
  assertForbidden(await runAnalytics(personalContext()))
  assertForbidden(await runAnalytics(personalContext(), { ...INPUT, airlineId: "airline-2" }))
})

test("водитель получает отказ", async () => {
  assertForbidden(await runAnalytics(driverContext()))
})

test("учётки с ролью вне fapScope получают отказ", async () => {
  // USER — публичная саморегистрация, остальные фронту неизвестны.
  for (const role of ["USER", "DISPATCHERUSER", "REPRESENTATIVE"]) {
    assertForbidden(await runAnalytics(userContext(role)))
  }
  assertForbidden(await runAnalytics(userContext("AIRLINEUSER", { airlineId: "airline-1" })))
})

test("гостиница получает отказ", async () => {
  assertForbidden(await runAnalytics(userContext("HOTELADMIN", { hotelId: "hotel-1" })))
})

test("АК видит только свою авиакомпанию и в маске денег", async () => {
  const { result, queries, error } = await runAnalytics(
    userContext("AIRLINEADMIN", { airlineId: "airline-1" }),
    { ...INPUT, airlineId: "airline-2" }
  )
  assert.equal(error, undefined)
  assert.equal(queries[0].where.airlineId, "airline-1", "чужая input.airlineId игнорируется")
  assert.equal(result.totals.waterMeal, 0)
  assert.equal(result.totals.living, 0, "неотправленный отчёт гостиницы скрыт")
})

test("диспетчер видит все АК или фильтр по input.airlineId, с деньгами", async () => {
  const all = await runAnalytics(userContext("DISPATCHERADMIN"))
  assert.equal(all.error, undefined)
  assert.equal(all.queries[0].where.airlineId, undefined)
  assert.equal(all.result.totals.waterMeal, 600)
  assert.equal(all.result.totals.living, 3500)

  const filtered = await runAnalytics(userContext("DISPATCHERADMIN"), {
    ...INPUT,
    airlineId: "airline-2"
  })
  assert.equal(filtered.queries[0].where.airlineId, "airline-2")
  assert.equal(filtered.result.totals.waterMeal, 600, "фильтр по АК не включает маску")
})

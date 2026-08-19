import test from "node:test"
import assert from "node:assert/strict"
import {
  resolveScope,
  buildScopeFilter,
  canAccessRequest,
  isHotelSubjectScope
} from "../../services/passengerRequest/fapScope.js"

const userCtx = (role, extra = {}) => ({
  subjectType: "USER",
  subject: { id: "u1", role, ...extra }
})
const extCtx = (scope, extra = {}) => ({
  subjectType: "EXTERNAL_USER",
  subject: { id: "e1", scope, ...extra }
})

test("диспетчерские роли не ограничены", () => {
  for (const role of ["SUPERADMIN", "DISPATCHERADMIN", "DISPATCHERMODERATOR"]) {
    assert.equal(resolveScope(userCtx(role)).kind, "all")
  }
})

test("роли авиакомпании ограничены своей авиакомпанией", () => {
  const scope = resolveScope(userCtx("AIRLINEADMIN", { airlineId: "a1" }))
  assert.deepEqual(scope, { kind: "airline", airlineId: "a1" })
})

test("роль авиакомпании без airlineId получает отказ, а не полный доступ", () => {
  assert.equal(resolveScope(userCtx("AIRLINEMODERATOR")).kind, "denied")
})

test("гостиничные роли ограничены своей гостиницей", () => {
  const scope = resolveScope(userCtx("HOTELADMIN", { hotelId: "h1" }))
  assert.deepEqual(scope, { kind: "hotel", hotelId: "h1" })
})

test("AIRLINE_PERSONAL ограничен своей авиакомпанией", () => {
  const scope = resolveScope({
    subjectType: "AIRLINE_PERSONAL",
    subject: { id: "p1", airlineId: "a2" }
  })
  assert.deepEqual(scope, { kind: "airline", airlineId: "a2" })
})

test("внешний пользователь scope HOTEL ограничен своей гостиницей", () => {
  assert.deepEqual(resolveScope(extCtx("HOTEL", { hotelId: "h9" })), {
    kind: "hotel",
    hotelId: "h9"
  })
})

test("внешний пользователь scope DRIVER ограничен одной заявкой", () => {
  assert.deepEqual(
    resolveScope(extCtx("DRIVER", { passengerRequestId: "r1" })),
    { kind: "request", requestId: "r1" }
  )
})

test("внешний пользователь scope REPRESENTATIVE ограничен парой авиакомпания+аэропорт", () => {
  assert.deepEqual(
    resolveScope(extCtx("REPRESENTATIVE", { airlineId: "a3", airportId: "p3" })),
    { kind: "airlineAirport", airlineId: "a3", airportId: "p3" }
  )
})

test("незаполненные поля внешнего пользователя дают отказ, а не полный доступ", () => {
  assert.equal(resolveScope(extCtx("DRIVER")).kind, "denied")
  assert.equal(resolveScope(extCtx("REPRESENTATIVE", { airlineId: "a3" })).kind, "denied")
  assert.equal(resolveScope(extCtx("HOTEL")).kind, "denied")
})

test("белый список, а не чёрный: неизвестные тип, роль и scope получают отказ", () => {
  assert.equal(resolveScope({ subjectType: "WHAT", subject: { id: "x" } }).kind, "denied")
  assert.equal(resolveScope(userCtx("NEW_ROLE")).kind, "denied")
  assert.equal(resolveScope(extCtx("NEW_SCOPE")).kind, "denied")
  assert.equal(resolveScope(null).kind, "denied")
  assert.equal(resolveScope({ subjectType: "USER", subject: null }).kind, "denied")
})

test("субъект DRIVER в ФАП не поддержан и получает отказ", () => {
  assert.equal(
    resolveScope({ subjectType: "DRIVER", subject: { id: "d1" } }).kind,
    "denied"
  )
})

test("buildScopeFilter: без ограничения возвращает null", () => {
  assert.equal(buildScopeFilter({ kind: "all" }), null)
})

test("buildScopeFilter: гостиница ищется внутри встроенного массива", () => {
  assert.deepEqual(buildScopeFilter({ kind: "hotel", hotelId: "h1" }), {
    livingService: { is: { hotels: { some: { hotelId: "h1" } } } }
  })
})

test("buildScopeFilter: остальные виды скоупа", () => {
  assert.deepEqual(buildScopeFilter({ kind: "airline", airlineId: "a1" }), {
    airlineId: "a1"
  })
  assert.deepEqual(buildScopeFilter({ kind: "request", requestId: "r1" }), {
    id: "r1"
  })
  assert.deepEqual(
    buildScopeFilter({ kind: "airlineAirport", airlineId: "a1", airportId: "p1" }),
    { airlineId: "a1", airportId: "p1" }
  )
})

// Фильтр в базе и проверка в памяти обязаны совпадать на любом наборе.
// Расхождение между ними — самый опасный дефект этой работы: список показал бы
// одно, а точечный доступ разрешал бы другое.
test("canAccessRequest согласован с buildScopeFilter на общем наборе", () => {
  const requests = [
    { id: "r1", airlineId: "a1", airportId: "p1", livingService: { hotels: [{ hotelId: "h1" }] } },
    { id: "r2", airlineId: "a2", airportId: "p1", livingService: { hotels: [{ hotelId: "h2" }] } },
    { id: "r3", airlineId: "a1", airportId: "p2", livingService: { hotels: [] } },
    { id: "r4", airlineId: "a1", airportId: "p1", livingService: null }
  ]
  const scopes = [
    { kind: "all" },
    { kind: "airline", airlineId: "a1" },
    { kind: "hotel", hotelId: "h1" },
    { kind: "request", requestId: "r2" },
    { kind: "airlineAirport", airlineId: "a1", airportId: "p1" }
  ]
  // Эмуляция фильтра Prisma на тех же данных.
  const applyFilter = (f, r) => {
    if (f === null) return true
    if (f.livingService) {
      const wanted = f.livingService.is.hotels.some.hotelId
      return (r.livingService?.hotels ?? []).some((h) => h?.hotelId === wanted)
    }
    return Object.entries(f).every(([k, v]) => r[k] === v)
  }
  for (const scope of scopes) {
    for (const r of requests) {
      assert.equal(
        canAccessRequest(scope, r),
        applyFilter(buildScopeFilter(scope), r),
        `расхождение: scope ${scope.kind}, заявка ${r.id}`
      )
    }
  }
})

test("canAccessRequest при отказе не пускает никого", () => {
  assert.equal(
    canAccessRequest({ kind: "denied", reason: "x" }, { id: "r1", airlineId: "a1" }),
    false
  )
})

test("buildScopeFilter на отказном и неизвестном скоупе бросает, а не отдаёт «без ограничения»", () => {
  assert.throws(() => buildScopeFilter({ kind: "denied", reason: "x" }), /не строится/)
  assert.throws(() => buildScopeFilter({ kind: "brand-new" }), /не строится/)
})

test("isHotelSubjectScope: гостиничные скоупы и их отказы — да, остальные — нет", () => {
  assert.equal(isHotelSubjectScope({ kind: "hotel", hotelId: "h1" }), true)
  assert.equal(
    isHotelSubjectScope({ kind: "denied", reason: "hotel-role-without-hotel" }),
    true
  )
  assert.equal(
    isHotelSubjectScope({ kind: "denied", reason: "hotel-external-without-hotel" }),
    true
  )
  assert.equal(isHotelSubjectScope({ kind: "all" }), false)
  assert.equal(isHotelSubjectScope({ kind: "airline", airlineId: "a1" }), false)
  assert.equal(isHotelSubjectScope({ kind: "request", requestId: "r1" }), false)
  assert.equal(
    isHotelSubjectScope({ kind: "denied", reason: "driver-external-without-request" }),
    false
  )
})

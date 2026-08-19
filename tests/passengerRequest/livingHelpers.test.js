import test from "node:test"
import assert from "node:assert/strict"
import { GraphQLError } from "graphql"
import {
  applyServiceRecalc,
  assertHotelScopeAccess,
  countLivingPeople,
  withHotelPeople
} from "../../services/passengerRequest/livingHelpers.js"
import { recomputeServiceStatus } from "../../services/passengerRequest/serviceStatus.js"

const hotel = (name, people = []) => ({
  hotelId: `id-${name}`,
  name,
  peopleCount: 2,
  people
})

// Гость, созданный до появления personType/personCategory/accommodationChesses:
// именно на нём видно, прошла нормализация или нет.
const legacyGuest = (fullName = "Легаси Гость") => ({ fullName })

// ───────────────────────────── countLivingPeople ─────────────────────────────

test("countLivingPeople: пустой список даёт ноль", () => {
  assert.equal(countLivingPeople([]), 0)
  assert.equal(countLivingPeople(null), 0)
  assert.equal(countLivingPeople(undefined), 0)
})

test("countLivingPeople: гостиницы без людей дают ноль", () => {
  assert.equal(countLivingPeople([hotel("Азия"), hotel("Чаплан")]), 0)
  // people отсутствует вовсе — не то же самое, что пустой массив.
  assert.equal(countLivingPeople([{ name: "Азия" }, { name: "Чаплан" }]), 0)
  // people не массив — тоже ноль, а не падение.
  assert.equal(countLivingPeople([{ name: "Азия", people: null }]), 0)
})

test("countLivingPeople: считает людей ВСЕХ гостиниц, а не одной", () => {
  const hotels = [
    hotel("Азия", [legacyGuest("A"), legacyGuest("B")]),
    hotel("Чаплан", []),
    hotel("Сибирь", [legacyGuest("C")])
  ]

  assert.equal(countLivingPeople(hotels), 3)
})

// ───────────────────────────── withHotelPeople ─────────────────────────────

test("withHotelPeople правит состав ТОЛЬКО целевой гостиницы", () => {
  const hotels = [hotel("Азия", [legacyGuest("A")]), hotel("Чаплан", [legacyGuest("B")])]

  const next = withHotelPeople(hotels, 1, (h, index, people) => [
    ...people,
    { fullName: "Новый", hotelIndex: index, hotelName: h.name }
  ])

  assert.equal(next[0].people.length, 1, "чужая гостиница состава не меняет")
  assert.equal(next[1].people.length, 2)
  assert.equal(next[1].people[1].fullName, "Новый")
  assert.equal(next[1].people[1].hotelIndex, 1, "в колбэк уходит индекс гостиницы")
  assert.equal(next[1].people[1].hotelName, "Чаплан", "в колбэк уходит сырая гостиница")
})

test("withHotelPeople: остальные поля гостиниц уносятся как есть", () => {
  const hotels = [hotel("Азия", []), hotel("Чаплан", [])]

  const next = withHotelPeople(hotels, 0, () => [])

  assert.equal(next.length, 2)
  assert.equal(next[0].hotelId, "id-Азия")
  assert.equal(next[0].peopleCount, 2)
  assert.equal(next[1].name, "Чаплан")
})

test("СКРЫТАЯ МИГРАЦИЯ: люди ВСЕХ остальных гостиниц проходят нормализацию", () => {
  // Правим первую гостиницу, а нормализованным оказывается и легаси-гость
  // второй. Побочная запись данных, закреплённая характеризационным тестом
  // группы «Проживание», — сузить обход до целевой гостиницы нельзя.
  const hotels = [hotel("Азия", []), hotel("Чаплан", [legacyGuest()])]

  const next = withHotelPeople(hotels, 0, () => [])

  const migrated = next[1].people[0]
  assert.equal(migrated.fullName, "Легаси Гость")
  assert.equal(migrated.personType, "PASSENGER")
  assert.equal(migrated.personCategory, "ADULT")
  assert.equal(migrated.arrival, null)
  assert.equal(migrated.departure, null)
  assert.equal(migrated.roomCategory, null)
  assert.equal(migrated.roomKind, null)
  assert.equal(migrated.airlinePersonalId, null)
  assert.equal(migrated.accommodationChesses.length, 1)
  assert.equal(migrated.accommodationChesses[0].hotelIndex, 1)
  assert.equal(migrated.accommodationChesses[0].hotelName, "Чаплан")
})

test("withHotelPeople: колбэк получает уже нормализованных людей целевой гостиницы", () => {
  const hotels = [hotel("Азия", [legacyGuest()])]

  const next = withHotelPeople(hotels, 0, (_h, _index, people) => people)

  assert.equal(next[0].people[0].personType, "PASSENGER")
  assert.equal(next[0].people[0].accommodationChesses[0].hotelName, "Азия")
})

test("withHotelPeople: гостиница без имени не роняет нормализацию", () => {
  const hotels = [{ people: [legacyGuest()] }]

  const next = withHotelPeople(hotels, 1, () => [])

  assert.equal(next[0].people[0].accommodationChesses[0].hotelName, null)
})

test("withHotelPeople: исходный массив и гостиницы не мутируются", () => {
  const guest = legacyGuest()
  const target = hotel("Азия", [guest])
  const neighbour = hotel("Чаплан", [legacyGuest("Сосед")])
  const hotels = [target, neighbour]

  withHotelPeople(hotels, 0, (_h, _index, people) => [...people, legacyGuest("Новый")])

  assert.equal(hotels.length, 2)
  assert.equal(hotels[0], target, "элемент подменён не был")
  assert.equal(target.people.length, 1, "состав целевой гостиницы не изменился")
  assert.deepEqual(target.people[0], { fullName: "Легаси Гость" }, "гость не нормализован на месте")
  assert.deepEqual(neighbour.people[0], { fullName: "Сосед" })
})

test("withHotelPeople: пустой и отсутствующий список гостиниц не падают", () => {
  assert.deepEqual(withHotelPeople([], 0, () => []), [])
  assert.deepEqual(withHotelPeople(null, 0, () => []), [])
  assert.deepEqual(withHotelPeople(undefined, 0, () => []), [])
})

// ──────────────────────────── applyServiceRecalc ────────────────────────────

test("applyServiceRecalc отдаёт status и times ровно от recomputeServiceStatus", () => {
  const living = {
    plan: { peopleCount: 4 },
    status: "IN_PROGRESS",
    times: { acceptedAt: "2026-08-01T10:00:00.000Z" }
  }
  const before = [hotel("Азия", [legacyGuest("A")])]
  const after = [hotel("Азия", [legacyGuest("A"), legacyGuest("B")])]

  const recalc = applyServiceRecalc(living, before, after)

  // Сравнение с повторным вызовом безопасно ТОЛЬКО здесь: план 4 не достигнут,
  // статус остаётся IN_PROGRESS, и updateTimes ни одной отметки не ставит.
  // В тестах автозавершения так делать нельзя — там штампуется new Date().
  assert.deepEqual(recalc, recomputeServiceStatus(living, 1, 2))
  assert.deepEqual(Object.keys(recalc), ["status", "times"])
})

test("applyServiceRecalc автозавершает услугу при достижении плана", () => {
  const living = {
    plan: { peopleCount: 2 },
    status: "IN_PROGRESS",
    times: { acceptedAt: "2026-08-01T10:00:00.000Z" }
  }
  const before = [hotel("Азия", [legacyGuest("A")]), hotel("Чаплан", [])]
  const after = [hotel("Азия", [legacyGuest("A")]), hotel("Чаплан", [legacyGuest("B")])]

  const recalc = applyServiceRecalc(living, before, after)

  assert.equal(recalc.status, "COMPLETED")
  // Сравнивать результат с ПОВТОРНЫМ вызовом recomputeServiceStatus целиком
  // нельзя: updateTimes штампует finishedAt как new Date(), и два независимых
  // вызова расходятся на границе миллисекунды. Сверяем статус и набор
  // проставленных отметок, а не сами значения времени.
  assert.deepEqual(Object.keys(recalc), ["status", "times"])
  assert.deepEqual(Object.keys(recalc.times).sort(), ["acceptedAt", "finishedAt"])
  assert.equal(
    recalc.times.acceptedAt,
    "2026-08-01T10:00:00.000Z",
    "прежние отметки не тронуты"
  )
  assert.ok(recalc.times.finishedAt instanceof Date, "finishedAt проставлен")
})

test("applyServiceRecalc считает факт по ВСЕМ гостиницам, а не по изменённой", () => {
  const living = { plan: { peopleCount: 3 }, status: "NEW", times: {} }
  const before = [hotel("Азия", [legacyGuest("A")]), hotel("Чаплан", [legacyGuest("B")])]
  const after = [
    hotel("Азия", [legacyGuest("A")]),
    hotel("Чаплан", [legacyGuest("B"), legacyGuest("C")])
  ]

  const recalc = applyServiceRecalc(living, before, after)

  // План 3, факт по ВСЕМ гостиницам 2 → 3, значит услуга автозавершается.
  // Если бы считалась только изменённая гостиница (1 → 2), плана бы не достигли
  // и статус остался бы IN_PROGRESS — именно это тест и различает.
  assert.equal(recalc.status, "COMPLETED")
  // Время с повторным вызовом не сверяем: updateTimes штампует new Date().
  assert.deepEqual(Object.keys(recalc.times).sort(), ["finishedAt", "inProgressAt"])
})

test("applyServiceRecalc не трогает отменённую услугу", () => {
  const living = {
    status: "CANCELLED",
    times: { cancelledAt: "2026-08-02T10:00:00.000Z" }
  }

  const recalc = applyServiceRecalc(living, [], [hotel("Азия", [legacyGuest()])])

  assert.equal(recalc.status, "CANCELLED")
  assert.deepEqual(recalc.times, { cancelledAt: "2026-08-02T10:00:00.000Z" })
})

// ─────────────────────────── assertHotelScopeAccess ───────────────────────────

const hotels = [
  { hotelId: "hotel-1", name: "Азия" },
  { hotelId: "hotel-2", name: "Чаплан" }
]

const externalHotel = (hotelId) => ({
  subjectType: "EXTERNAL_USER",
  subject: { id: "ext-1", scope: "HOTEL", hotelId }
})

const crmHotel = (hotelId, role = "HOTELADMIN") => ({
  subjectType: "USER",
  subject: { id: "u-1", role, hotelId }
})

test("assertHotelScopeAccess пропускает гостиницу к её собственному индексу", () => {
  assert.doesNotThrow(() =>
    assertHotelScopeAccess(externalHotel("hotel-1"), hotels, 0)
  )
  assert.doesNotThrow(() =>
    assertHotelScopeAccess(externalHotel("hotel-2"), hotels, 1)
  )
})

test("assertHotelScopeAccess отбивает чужой индекс с FORBIDDEN и статусом 403", () => {
  try {
    assertHotelScopeAccess(externalHotel("hotel-2"), hotels, 0)
    assert.fail("должно было бросить")
  } catch (error) {
    // Тип важен: обычный Error с тем же extensions Apollo превратит в
    // INTERNAL_SERVER_ERROR со статусом 500.
    assert.ok(error instanceof GraphQLError)
    assert.equal(error.extensions.code, "FORBIDDEN")
    assert.equal(error.extensions.http.status, 403)
  }
})

test("assertHotelScopeAccess видит ролевые учётки CRM, а не только магик-линк", () => {
  // Прежняя редакция сверяла subjectType === "EXTERNAL_USER" руками и
  // HOTELADMIN/HOTELMODERATOR не гейтила вовсе, хотя hotelId у них заполнен
  // так же. Скоуп теперь берётся из resolveScope — определение «гостиничного
  // субъекта» в модуле одно.
  for (const role of ["HOTELADMIN", "HOTELMODERATOR"]) {
    assert.doesNotThrow(() =>
      assertHotelScopeAccess(crmHotel("hotel-1", role), hotels, 0)
    )
    assert.throws(
      () => assertHotelScopeAccess(crmHotel("hotel-2", role), hotels, 0),
      /you can only manage your own hotel/
    )
  }
})

test("assertHotelScopeAccess молчит для негостиничных субъектов", () => {
  const others = [
    { subjectType: "USER", subject: { id: "u-1", role: "SUPERADMIN" } },
    { subjectType: "USER", subject: { id: "u-2", role: "DISPATCHERADMIN" } },
    {
      subjectType: "USER",
      subject: { id: "u-3", role: "AIRLINEADMIN", airlineId: "airline-1" }
    },
    {
      subjectType: "AIRLINE_PERSONAL",
      subject: { id: "p-1", airlineId: "airline-1" }
    },
    {
      subjectType: "EXTERNAL_USER",
      subject: { id: "d-1", scope: "DRIVER", passengerRequestId: "req-1" }
    },
    {
      subjectType: "EXTERNAL_USER",
      subject: {
        id: "r-1",
        scope: "REPRESENTATIVE",
        airlineId: "airline-1",
        airportId: "airport-1"
      }
    }
  ]
  for (const context of others) {
    assert.doesNotThrow(
      () => assertHotelScopeAccess(context, hotels, 0),
      JSON.stringify(context.subject)
    )
    assert.doesNotThrow(
      () => assertHotelScopeAccess(context, hotels, 99),
      "негостиничный субъект не получает отказа даже на битом индексе"
    )
  }
})

test("assertHotelScopeAccess отбивает гостиницу на несуществующем индексе", () => {
  // Индекс вне диапазона у части мутаций не проверяется вовсе (submit/hide
  // отчёта). Своей гостиницы под ним нет — значит отказ, а не проход.
  assert.throws(
    () => assertHotelScopeAccess(externalHotel("hotel-1"), hotels, 99),
    /you can only manage your own hotel/
  )
  assert.throws(
    () => assertHotelScopeAccess(externalHotel("hotel-1"), [], 0),
    /you can only manage your own hotel/
  )
  assert.throws(
    () => assertHotelScopeAccess(externalHotel("hotel-1"), undefined, 0),
    /you can only manage your own hotel/
  )
})

test("гостиничная учётка БЕЗ hotelId сюда не доходит: её режет проверка уровня заявки", () => {
  // resolveScope отдаёт такой учётке отказной скоуп (kind "denied"), а не
  // "hotel", поэтому здесь она проходит насквозь. Замкнуто это раньше:
  // isHotelSubjectScope относит отказ hotel-role-without-hotel к гостиничным, и
  // assertCanAccessRequest режет его безусловно, не дожидаясь FAP_SCOPE_ENFORCE.
  // Тест фиксирует границу ответственности, а не дыру.
  assert.doesNotThrow(() =>
    assertHotelScopeAccess(crmHotel(null), hotels, 0)
  )
  assert.doesNotThrow(() =>
    assertHotelScopeAccess(externalHotel(undefined), hotels, 0)
  )
})

test("assertHotelScopeAccess не пускает гостиницу к строке без hotelId", () => {
  // Гостиница, добавленная в заявку текстом (hotelId не проставлен), ничьей
  // не считается: undefined === undefined склеил бы её с учёткой без привязки.
  assert.throws(
    () => assertHotelScopeAccess(externalHotel("hotel-1"), [{ name: "Без id" }], 0),
    /you can only manage your own hotel/
  )
})

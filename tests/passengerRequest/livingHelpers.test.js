import test from "node:test"
import assert from "node:assert/strict"
import {
  applyServiceRecalc,
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
    times: { createdAt: "2026-08-01T10:00:00.000Z" }
  }
  const before = [hotel("Азия", [legacyGuest("A")])]
  const after = [hotel("Азия", [legacyGuest("A"), legacyGuest("B")])]

  const recalc = applyServiceRecalc(living, before, after)

  assert.deepEqual(recalc, recomputeServiceStatus(living, 1, 2))
  assert.deepEqual(Object.keys(recalc), ["status", "times"])
})

test("applyServiceRecalc автозавершает услугу при достижении плана", () => {
  const living = {
    plan: { peopleCount: 2 },
    status: "IN_PROGRESS",
    times: { createdAt: "2026-08-01T10:00:00.000Z" }
  }
  const before = [hotel("Азия", [legacyGuest("A")]), hotel("Чаплан", [])]
  const after = [hotel("Азия", [legacyGuest("A")]), hotel("Чаплан", [legacyGuest("B")])]

  const recalc = applyServiceRecalc(living, before, after)

  assert.equal(recalc.status, "COMPLETED")
  assert.deepEqual(recalc, recomputeServiceStatus(living, 1, 2))
})

test("applyServiceRecalc считает факт по ВСЕМ гостиницам, а не по изменённой", () => {
  const living = { plan: { peopleCount: 3 }, status: "NEW", times: {} }
  const before = [hotel("Азия", [legacyGuest("A")]), hotel("Чаплан", [legacyGuest("B")])]
  const after = [
    hotel("Азия", [legacyGuest("A")]),
    hotel("Чаплан", [legacyGuest("B"), legacyGuest("C")])
  ]

  assert.deepEqual(
    applyServiceRecalc(living, before, after),
    recomputeServiceStatus(living, 2, 3)
  )
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

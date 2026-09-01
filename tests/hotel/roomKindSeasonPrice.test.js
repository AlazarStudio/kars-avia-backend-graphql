import test from "node:test"
import assert from "node:assert/strict"

// Запуск: node --test tests/hotel/roomKindSeasonPrice.test.js

import {
  assertNoSeasonOverlap,
  assertValidSeasonRange,
  calculateSeasonalLivingForStay,
  findSeasonForNight,
  isValidOnDay,
  listStayNights,
  resolvePriceForNight,
  resolveWeightedPricePerDay,
  seasonsOverlap,
  validityDateFields
} from "../../services/hotel/roomKindSeasonPrice.js"

test("listStayNights returns nights [start, end)", () => {
  const nights = listStayNights("2026-06-01", "2026-06-04")
  assert.equal(nights.length, 3)
  assert.equal(nights[0].toISOString().slice(0, 10), "2026-06-01")
  assert.equal(nights[2].toISOString().slice(0, 10), "2026-06-03")
})

test("listStayNights same-day stay yields one night", () => {
  const nights = listStayNights("2026-06-01", "2026-06-01")
  assert.equal(nights.length, 1)
})

test("assertValidSeasonRange rejects inverted range", () => {
  assert.throws(
    () => assertValidSeasonRange("2026-08-01", "2026-06-01"),
    /не позже/
  )
})

test("seasonsOverlap detects inclusive overlap", () => {
  assert.equal(
    seasonsOverlap("2026-06-01", "2026-06-30", "2026-06-30", "2026-07-15"),
    true
  )
  assert.equal(
    seasonsOverlap("2026-06-01", "2026-06-30", "2026-07-01", "2026-07-15"),
    false
  )
})

test("assertNoSeasonOverlap rejects overlapping periods", () => {
  const existing = [
    { id: "s1", startDate: "2026-06-01", endDate: "2026-08-31" }
  ]
  assert.throws(
    () => assertNoSeasonOverlap(existing, "2026-08-01", "2026-09-15"),
    /пересекается/
  )
  assert.doesNotThrow(() =>
    assertNoSeasonOverlap(existing, "2026-09-01", "2026-09-30")
  )
  assert.doesNotThrow(() =>
    assertNoSeasonOverlap(existing, "2026-08-01", "2026-09-15", "s1")
  )
})

test("findSeasonForNight and resolvePriceForNight with fallback", () => {
  const roomKind = { price: 1000, priceForAirline: 1200 }
  const seasons = [
    {
      startDate: "2026-06-01",
      endDate: "2026-08-31",
      price: 2000,
      priceForAirline: 2500
    }
  ]

  assert.equal(findSeasonForNight("2026-06-15", seasons)?.price, 2000)
  assert.equal(findSeasonForNight("2026-05-15", seasons), null)

  assert.equal(
    resolvePriceForNight(roomKind, seasons, "2026-06-15", "price"),
    2000
  )
  assert.equal(
    resolvePriceForNight(roomKind, seasons, "2026-05-15", "price"),
    1000
  )
  assert.equal(
    resolvePriceForNight(roomKind, seasons, "2026-06-15", "priceForAirline"),
    2500
  )
  assert.equal(
    resolvePriceForNight(roomKind, seasons, "2026-05-15", "priceForAirline"),
    1200
  )
})

test("priceSingleOccupancy uses season then falls back to base price", () => {
  const roomKind = { price: 4000, priceSingleOccupancy: 2500 }
  const seasons = [
    {
      startDate: "2026-06-01",
      endDate: "2026-06-30",
      price: 5000,
      priceSingleOccupancy: 3000
    }
  ]
  assert.equal(
    resolvePriceForNight(roomKind, seasons, "2026-06-15", "priceSingleOccupancy"),
    3000
  )
  assert.equal(
    resolvePriceForNight(roomKind, seasons, "2026-05-15", "priceSingleOccupancy"),
    2500
  )
})

test("multi-season stay sums night prices", () => {
  const roomKind = { price: 1000 }
  const seasons = [
    { startDate: "2026-06-01", endDate: "2026-06-30", price: 2000 },
    { startDate: "2026-07-01", endDate: "2026-07-31", price: 3000 }
  ]

  // 30.05, 31.05, 01.06, 02.06 → nights until 03.06 exclusive end
  const result = calculateSeasonalLivingForStay(
    roomKind,
    seasons,
    "2026-05-30",
    "2026-06-03",
    "price"
  )

  assert.equal(result.nights, 4)
  // 30.05 base 1000, 31.05 base 1000, 01.06 season 2000, 02.06 season 2000
  assert.equal(result.livingCost, 6000)
  assert.equal(result.pricePerDay, 1500)
})

test("resolveWeightedPricePerDay respects filter window", () => {
  const roomKind = { price: 1000 }
  const seasons = [
    { startDate: "2026-06-01", endDate: "2026-06-30", price: 2000 }
  ]

  const full = resolveWeightedPricePerDay(
    roomKind,
    seasons,
    "2026-05-30",
    "2026-06-03"
  )
  assert.equal(full, 1500)

  const juneOnly = resolveWeightedPricePerDay(
    roomKind,
    seasons,
    "2026-05-30",
    "2026-06-03",
    "2026-06-01",
    "2026-06-30"
  )
  assert.equal(juneOnly, 2000)
})

test("isValidOnDay: без даты или без окна — всегда валиден", () => {
  assert.equal(isValidOnDay("2026-06-01", "2026-06-30", null), true)
  assert.equal(isValidOnDay(null, null, "2026-06-15"), true)
  assert.equal(isValidOnDay("2026-06-01", null, "2026-06-15"), true)
  assert.equal(isValidOnDay(null, "2026-06-30", "2026-06-15"), true)
})

test("isValidOnDay: границы включительно", () => {
  assert.equal(isValidOnDay("2026-06-01", "2026-06-30", "2026-06-01"), true)
  assert.equal(isValidOnDay("2026-06-01", "2026-06-30", "2026-06-30"), true)
  assert.equal(isValidOnDay("2026-06-01", "2026-06-30", "2026-05-31"), false)
  assert.equal(isValidOnDay("2026-06-01", "2026-06-30", "2026-07-01"), false)
})

test("validityDateFields отклоняет перевёрнутый интервал", () => {
  assert.throws(
    () =>
      validityDateFields({
        startDate: "2026-08-01",
        endDate: "2026-06-01"
      }),
    /не позже/
  )
})

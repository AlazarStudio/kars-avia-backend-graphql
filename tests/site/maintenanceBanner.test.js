import test from "node:test"
import assert from "node:assert/strict"
import {
  computeIsVisible,
  toMaintenanceBannerResponse,
  validateMaintenanceBannerInput
} from "../../services/site/maintenanceBannerUtils.js"

const now = new Date("2026-05-20T12:00:00.000Z")

test("computeIsVisible returns false when disabled", () => {
  assert.equal(
    computeIsVisible({ enabled: false, endsAt: null }, now),
    false
  )
})

test("computeIsVisible returns true when enabled without endsAt", () => {
  assert.equal(
    computeIsVisible({ enabled: true, endsAt: null }, now),
    true
  )
})

test("computeIsVisible returns false when endsAt is in the past", () => {
  const endsAt = new Date("2026-05-20T11:00:00.000Z")
  assert.equal(computeIsVisible({ enabled: true, endsAt }, now), false)
})

test("computeIsVisible returns true when endsAt is in the future", () => {
  const endsAt = new Date("2026-05-20T13:00:00.000Z")
  assert.equal(computeIsVisible({ enabled: true, endsAt }, now), true)
})

test("toMaintenanceBannerResponse returns defaults when record is null", () => {
  const result = toMaintenanceBannerResponse(null, now)
  assert.deepEqual(result, {
    enabled: false,
    message: null,
    endsAt: null,
    isVisible: false
  })
})

test("validateMaintenanceBannerInput requires message when enabled", () => {
  assert.throws(
    () => validateMaintenanceBannerInput({ enabled: true, message: "  " }),
    /обязателен/
  )
})

test("validateMaintenanceBannerInput allows empty message when disabled", () => {
  assert.doesNotThrow(() =>
    validateMaintenanceBannerInput({ enabled: false, message: "" })
  )
})

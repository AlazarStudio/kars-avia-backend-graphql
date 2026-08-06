import test from "node:test"
import assert from "node:assert/strict"
import {
  getDefaultPartialDayRules,
  rulesToCalcConfig,
  parseHhMmToMinutes
} from "../../services/report/partialDaySettings.js"
import { calculateEffectiveCostDaysWithPartial } from "../../services/report/reportUtils.js"

test("parseHhMmToMinutes parses HH:mm", () => {
  assert.equal(parseHhMmToMinutes("06:00"), 360)
  assert.equal(parseHhMmToMinutes("14:00"), 840)
  assert.equal(parseHhMmToMinutes("18:30"), 1110)
  assert.equal(parseHhMmToMinutes("bad"), null)
})

test("default rules match legacy thresholds", () => {
  const cfg = rulesToCalcConfig(getDefaultPartialDayRules())
  assert.equal(cfg.arrivalFullBeforeMin, 6 * 60)
  assert.equal(cfg.arrivalHalfBeforeMin, 14 * 60)
  assert.equal(cfg.departureHalfAfterMin, 12 * 60)
  assert.equal(cfg.departureFullAfterMin, 18 * 60)
})

test("calculateEffectiveCostDaysWithPartial uses custom rules", () => {
  // Same calendar day stay 10:00 → 16:00
  // Default: arrival <14:00 → +0.5; departure >12 and <18 → +0.5 ⇒ 1.0
  const defaults = calculateEffectiveCostDaysWithPartial(
    "2026-07-01 10:00:00",
    "2026-07-01 16:00:00"
  )
  assert.equal(defaults, 1)

  // Custom: half-before moved to 09:00 → no arrival adjust; full after 15:00 → +1
  const custom = calculateEffectiveCostDaysWithPartial(
    "2026-07-01 10:00:00",
    "2026-07-01 16:00:00",
    null,
    null,
    {
      arrivalFullBefore: "06:00",
      arrivalHalfBefore: "09:00",
      departureHalfAfter: "12:00",
      departureFullAfter: "15:00",
      arrivalFullDays: 1,
      arrivalHalfDays: 0.5,
      departureHalfDays: 0.5,
      departureFullDays: 1
    }
  )
  assert.equal(custom, 1)
})

test("sentinel 00:10 arrival skips early adjust", () => {
  const days = calculateEffectiveCostDaysWithPartial(
    "2026-07-01 00:10:00",
    "2026-07-02 10:00:00"
  )
  // base 1 day + no arrival + no departure (10:00 <= 12:00) = 1
  assert.equal(days, 1)
})

import test from "node:test"
import assert from "node:assert/strict"
import { parseVerifyResponse } from "../../services/travelline/travellineBooking.js"

test("успешный verify: токен есть, изменений нет", () => {
  const r = parseVerifyResponse({
    booking: { createBookingToken: "TOK123", roomStays: [{ checksum: "C" }] },
    alternativeBooking: null,
    warnings: []
  })
  assert.equal(r.conditionChange, false)
  assert.equal(r.createBookingToken, "TOK123")
  assert.equal(r.alternative, null)
})

test("изменение цены: пустой booking + alternativeBooking", () => {
  const r = parseVerifyResponse({
    booking: null,
    alternativeBooking: {
      roomStays: [
        {
          checksum: "NEWSUM",
          total: { priceBeforeTax: 6000, taxAmount: 100 },
          cancellationPolicy: { penaltyAmount: 6000 }
        }
      ]
    }
  })
  assert.equal(r.conditionChange, true)
  assert.equal(r.createBookingToken, null)
  assert.equal(r.alternative.newChecksum, "NEWSUM")
  assert.equal(r.alternative.newPriceBeforeTax, 6000)
  assert.equal(r.alternative.newTax, 100)
  assert.equal(r.alternative.newTotalPrice, 6100)
  assert.equal(r.alternative.newPenaltyAmount, 6000)
})

test("legacy-флаг conditionChange:true тоже распознаётся", () => {
  const r = parseVerifyResponse({
    conditionChange: true,
    booking: { createBookingToken: "X" }
  })
  assert.equal(r.conditionChange, true)
  assert.equal(r.createBookingToken, null)
})

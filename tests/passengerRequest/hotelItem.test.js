import test from "node:test"
import assert from "node:assert/strict"
import { ensurePassengerServiceHotelItemId } from "../../services/passengerRequest/hotelItem.js"

test("passenger service hotel: keeps existing itemId", () => {
  const hotel = {
    itemId: "fixed-item-id",
    name: "Hotel Alpha",
    peopleCount: 10
  }

  const result = ensurePassengerServiceHotelItemId(hotel)
  assert.equal(result.itemId, "fixed-item-id")
})

test("passenger service hotel: generates new itemId when absent", () => {
  const hotel = {
    name: "Hotel Beta",
    peopleCount: 20
  }

  const result = ensurePassengerServiceHotelItemId(hotel)
  assert.equal(typeof result.itemId, "string")
  assert.ok(result.itemId.length > 10)
  assert.equal(result.name, "Hotel Beta")
  assert.equal(result.peopleCount, 20)
})

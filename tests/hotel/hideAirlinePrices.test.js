import test from "node:test"
import assert from "node:assert/strict"
import {
  hiddenAirlineFlag,
  hiddenAirlinePrice,
  omitAirlinePriceWrites,
  shouldHideAirlinePrices
} from "../../services/hotel/hideAirlinePrices.js"

const hotelContext = {
  subjectType: "USER",
  subject: { role: "HOTELADMIN", hotelId: "h1" }
}

const dispatcherContext = {
  subjectType: "USER",
  subject: { role: "SUPERADMIN" }
}

test("shouldHideAirlinePrices: гостиница — да, диспетчер — нет", () => {
  assert.equal(shouldHideAirlinePrices(hotelContext), true)
  assert.equal(shouldHideAirlinePrices(dispatcherContext), false)
  assert.equal(
    shouldHideAirlinePrices({
      subjectType: "EXTERNAL_USER",
      subject: { scope: "HOTEL", hotelId: "h1" }
    }),
    true
  )
  assert.equal(
    shouldHideAirlinePrices({
      subjectType: "HOTEL_PREVIEW",
      subject: { hotelId: "h1" }
    }),
    false
  )
})

test("omitAirlinePriceWrites: гостиница не может затереть наценку Kars", () => {
  const input = {
    mealPrice: { breakfast: 100 },
    mealPriceForAir: { breakfast: 999 },
    transferPriceForAir: { arrival: 500 },
    roomKind: [{ price: 2000, priceForAirline: 3000, priceForAirReq: true }],
    rooms: [{ price: 2000, priceForAirline: 1 }]
  }
  const stripped = omitAirlinePriceWrites(input, hotelContext)
  assert.equal("mealPriceForAir" in stripped, false)
  assert.equal("transferPriceForAir" in stripped, false)
  assert.equal(stripped.mealPrice.breakfast, 100)
  assert.equal(stripped.roomKind[0].price, 2000)
  assert.equal("priceForAirline" in stripped.roomKind[0], false)
  assert.equal("priceForAirline" in stripped.rooms[0], false)

  const kept = omitAirlinePriceWrites(input, dispatcherContext)
  assert.equal(kept.mealPriceForAir.breakfast, 999)
  assert.equal(kept.roomKind[0].priceForAirline, 3000)
})

test("hiddenAirlinePrice/Flag прячут значения только гостинице", () => {
  assert.equal(hiddenAirlinePrice(1200, hotelContext), null)
  assert.equal(hiddenAirlinePrice(1200, dispatcherContext), 1200)
  assert.equal(hiddenAirlineFlag(true, hotelContext), false)
  assert.equal(hiddenAirlineFlag(true, dispatcherContext), true)
})

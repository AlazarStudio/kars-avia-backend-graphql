import test, { mock } from "node:test"
import assert from "node:assert/strict"

// Запуск: node --experimental-test-module-mocks --test tests/airline/buildPriceSearchLocation.test.js

const cityFindUnique = mock.fn()
const cityFindFirst = mock.fn()

mock.module("../../prisma.js", {
  namedExports: {
    prisma: {
      city: {
        findUnique: cityFindUnique,
        findFirst: cityFindFirst
      }
    }
  }
})

const { buildPriceSearchLocation } = await import(
  "../../services/airline/resolvePriceByHotelLocation.js"
)

test.beforeEach(() => {
  cityFindUnique.mock.resetCalls()
  cityFindFirst.mock.resetCalls()
})

test("enriches region from hotel.location.cityId", async () => {
  cityFindUnique.mock.mockImplementation(async () => ({
    id: "city-1",
    city: "Барнаул",
    regionId: "reg-altai",
    regionRef: { name: "Алтайский край" }
  }))

  const result = await buildPriceSearchLocation(
    {
      location: { cityId: "city-1", city: "", region: "" }
    },
    null
  )

  assert.equal(result.city, "Барнаул")
  assert.equal(result.region, "Алтайский край")
  assert.equal(result.cityId, "city-1")
  assert.equal(result.regionId, "reg-altai")
})

test("enriches region from airport.city when hotel has no region", async () => {
  cityFindFirst.mock.mockImplementation(async () => ({
    id: "city-1",
    city: "Барнаул",
    regionId: "reg-altai",
    regionRef: { name: "Алтайский край" }
  }))

  const result = await buildPriceSearchLocation(null, { city: "Барнаул" })

  assert.equal(result.city, "Барнаул")
  assert.equal(result.region, "Алтайский край")
  assert.equal(result.cityId, "city-1")
  assert.equal(result.regionId, "reg-altai")
})

test("keeps hotel region without db lookup", async () => {
  const result = await buildPriceSearchLocation(
    {
      location: { region: "Москва", city: "Москва" }
    },
    { city: "Барнаул" }
  )

  assert.equal(result.region, "Москва")
  assert.equal(cityFindUnique.mock.callCount(), 0)
  assert.equal(cityFindFirst.mock.callCount(), 0)
})

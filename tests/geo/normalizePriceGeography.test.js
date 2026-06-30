import test, { mock } from "node:test"
import assert from "node:assert/strict"

// Запуск: node --experimental-test-module-mocks --test tests/geo/normalizePriceGeography.test.js

const cityFindUnique = mock.fn()
const regionFindUnique = mock.fn()
const regionFindFirst = mock.fn()

mock.module("../../prisma.js", {
  namedExports: {
    prisma: {
      city: { findUnique: cityFindUnique },
      region: {
        findUnique: regionFindUnique,
        findFirst: regionFindFirst
      }
    }
  }
})

const {
  normalizePriceGeography,
  normalizePriceGeographyList,
  toPriceGeoCreateData
} = await import("../../services/geo/normalizeGeography.js")

test.beforeEach(() => {
  cityFindUnique.mock.resetCalls()
  regionFindUnique.mock.resetCalls()
  regionFindFirst.mock.resetCalls()
})

test("regionId resolves to region name and empty city", async () => {
  regionFindUnique.mock.mockImplementation(async () => ({
    id: "reg-1",
    name: "Алтайский край"
  }))

  const result = await normalizePriceGeography({ regionId: "reg-1" })

  assert.equal(result.regionId, "reg-1")
  assert.equal(result.region, "Алтайский край")
  assert.equal(result.city, "")
  assert.equal(result.cityId, null)
})

test("cityId resolves city and denormalized region without regionId", async () => {
  cityFindUnique.mock.mockImplementation(async () => ({
    id: "city-1",
    city: "Барнаул",
    regionRef: { name: "Алтайский край" }
  }))

  const result = await normalizePriceGeography({ cityId: "city-1" })

  assert.equal(result.cityId, "city-1")
  assert.equal(result.city, "Барнаул")
  assert.equal(result.region, "Алтайский край")
  assert.equal(result.regionId, null)
})

test("invalid regionId throws BAD_USER_INPUT", async () => {
  regionFindUnique.mock.mockImplementation(async () => null)

  await assert.rejects(
    () => normalizePriceGeography({ regionId: "missing" }),
    (err) => {
      assert.equal(err.extensions?.code, "BAD_USER_INPUT")
      assert.match(err.message, /Регион не найден/)
      return true
    }
  )
})

test("legacy region string resolves regionId from Region table", async () => {
  regionFindFirst.mock.mockImplementation(async () => ({
    id: "reg-2",
    name: "Красноярский край"
  }))

  const result = await normalizePriceGeography({
    region: "Красноярский край"
  })

  assert.equal(result.regionId, "reg-2")
  assert.equal(result.region, "Красноярский край")
  assert.equal(result.cityId, null)
})

test("cityId has priority over regionId", async () => {
  cityFindUnique.mock.mockImplementation(async () => ({
    id: "city-1",
    city: "Барнаул",
    regionRef: { name: "Алтайский край" }
  }))

  const result = await normalizePriceGeography({
    cityId: "city-1",
    regionId: "reg-ignored"
  })

  assert.equal(result.cityId, "city-1")
  assert.equal(regionFindUnique.mock.callCount(), 0)
})

test("normalizePriceGeographyList supports multiple cities and regions", async () => {
  cityFindUnique.mock.mockImplementation(async ({ where }) => {
    if (where.id === "city-a") {
      return {
        id: "city-a",
        city: "Барнаул",
        regionRef: { name: "Алтайский край" }
      }
    }
    if (where.id === "city-b") {
      return {
        id: "city-b",
        city: "Бийск",
        regionRef: { name: "Алтайский край" }
      }
    }
    return null
  })

  regionFindUnique.mock.mockImplementation(async ({ where }) => {
    if (where.id === "reg-1") {
      return { id: "reg-1", name: "Алтайский край" }
    }
    if (where.id === "reg-2") {
      return { id: "reg-2", name: "Красноярский край" }
    }
    return null
  })

  const list = await normalizePriceGeographyList([
    { cityId: "city-a" },
    { cityId: "city-b" },
    { regionId: "reg-1" },
    { regionId: "reg-2" }
  ])

  assert.equal(list.length, 4)
  assert.deepEqual(
    list.map((g) => g.cityId || g.regionId),
    ["city-a", "city-b", "reg-1", "reg-2"]
  )
})

test("normalizePriceGeographyList rejects duplicate cityId", async () => {
  cityFindUnique.mock.mockImplementation(async () => ({
    id: "city-1",
    city: "Барнаул",
    regionRef: { name: "Алтайский край" }
  }))

  await assert.rejects(
    () =>
      normalizePriceGeographyList([
        { cityId: "city-1" },
        { cityId: "city-1" }
      ]),
    (err) => {
      assert.equal(err.extensions?.code, "BAD_USER_INPUT")
      assert.match(err.message, /Город уже добавлен/)
      return true
    }
  )
})

test("normalizePriceGeographyList rejects duplicate regionId", async () => {
  regionFindUnique.mock.mockImplementation(async () => ({
    id: "reg-1",
    name: "Алтайский край"
  }))

  await assert.rejects(
    () =>
      normalizePriceGeographyList([
        { regionId: "reg-1" },
        { regionId: "reg-1" }
      ]),
    (err) => {
      assert.equal(err.extensions?.code, "BAD_USER_INPUT")
      assert.match(err.message, /Регион уже добавлен/)
      return true
    }
  )
})

test("toPriceGeoCreateData includes regionId", () => {
  assert.deepEqual(
    toPriceGeoCreateData({
      country: "Россия",
      region: "Алтайский край",
      city: "",
      cityId: null,
      regionId: "reg-1"
    }),
    {
      country: "Россия",
      region: "Алтайский край",
      city: "",
      cityId: null,
      regionId: "reg-1"
    }
  )
})

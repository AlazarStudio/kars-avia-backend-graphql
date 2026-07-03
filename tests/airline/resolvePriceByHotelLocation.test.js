import test from "node:test"
import assert from "node:assert/strict"
import { resolvePriceByHotelLocation } from "../../services/airline/resolvePriceByHotelLocation.js"

const location = {
  country: "россия",
  region: "алтайский край",
  city: "барнаул",
  address: ""
}

test("airport contract wins over regional geography", () => {
  const airportPrice = {
    id: "airport",
    name: "SVO",
    createdAt: "2024-02-01",
    airports: [{ airportId: "apt-1" }],
    geography: [{ region: "Москва", city: "", country: "" }]
  }
  const regionPrice = {
    id: "region",
    name: "Altai region",
    createdAt: "2024-01-01",
    airports: [],
    geography: [{ region: "Алтайский край", city: "", country: "" }]
  }

  const result = resolvePriceByHotelLocation({
    airlinePrices: [regionPrice, airportPrice],
    hotelLocation: location,
    airportId: "apt-1"
  })

  assert.equal(result?.id, "airport")
})

test("city geography wins over region when airport does not match", () => {
  const cityPrice = {
    id: "city",
    name: "Barnaul",
    createdAt: "2024-02-01",
    airports: [],
    geography: [{ city: "Барнаул", region: "Алтайский край", country: "" }]
  }
  const regionPrice = {
    id: "region",
    name: "Altai region",
    createdAt: "2024-01-01",
    airports: [],
    geography: [{ region: "Алтайский край", city: "", country: "" }]
  }

  const result = resolvePriceByHotelLocation({
    airlinePrices: [regionPrice, cityPrice],
    hotelLocation: location,
    airportId: null
  })

  assert.equal(result?.id, "city")
})

test("region geography used when hotel has no city", () => {
  const regionPrice = {
    id: "region",
    name: "Altai region",
    createdAt: "2024-01-01",
    airports: [],
    geography: [{ region: "Алтайский край", city: "", country: "" }]
  }
  const cityPrice = {
    id: "city",
    name: "Barnaul",
    createdAt: "2024-02-01",
    airports: [],
    geography: [{ city: "Барнаул", region: "Алтайский край", country: "" }]
  }

  const result = resolvePriceByHotelLocation({
    airlinePrices: [cityPrice, regionPrice],
    hotelLocation: { ...location, city: "" },
    airportId: null
  })

  assert.equal(result?.id, "region")
})

test("returns null when nothing matches", () => {
  const result = resolvePriceByHotelLocation({
    airlinePrices: [
      {
        id: "other",
        airports: [],
        geography: [{ region: "Москва", city: "", country: "" }]
      }
    ],
    hotelLocation: location,
    airportId: "unknown"
  })

  assert.equal(result, null)
})

test("picks oldest contract among same-level geographic matches", () => {
  const older = {
    id: "older",
    createdAt: "2024-01-01",
    airports: [],
    geography: [{ region: "Алтайский край", city: "", country: "" }]
  }
  const newer = {
    id: "newer",
    createdAt: "2024-06-01",
    airports: [],
    geography: [{ region: "Алтайский край", city: "", country: "" }]
  }

  const result = resolvePriceByHotelLocation({
    airlinePrices: [newer, older],
    hotelLocation: { ...location, city: "" },
    airportId: null
  })

  assert.equal(result?.id, "older")
})

test("matches when any city in geography array fits", () => {
  const multiCityPrice = {
    id: "multi",
    createdAt: "2024-01-01",
    airports: [],
    geography: [
      { city: "Москва", region: "", country: "" },
      { city: "Барнаул", region: "Алтайский край", country: "" }
    ]
  }

  const result = resolvePriceByHotelLocation({
    airlinePrices: [multiCityPrice],
    hotelLocation: location,
    airportId: null
  })

  assert.equal(result?.id, "multi")
})

test("prefers city entry over region in same contract when hotel has city", () => {
  const mixedPrice = {
    id: "mixed",
    createdAt: "2024-01-01",
    airports: [],
    geography: [
      { region: "Алтайский край", city: "", country: "" },
      { city: "Барнаул", region: "Алтайский край", country: "" }
    ]
  }

  const result = resolvePriceByHotelLocation({
    airlinePrices: [mixedPrice],
    hotelLocation: location,
    airportId: null
  })

  assert.equal(result?.id, "mixed")
})

test("supports legacy single geography object", () => {
  const legacyPrice = {
    id: "legacy",
    createdAt: "2024-01-01",
    airports: [],
    geography: { region: "Алтайский край", city: "", country: "" }
  }

  const result = resolvePriceByHotelLocation({
    airlinePrices: [legacyPrice],
    hotelLocation: { ...location, city: "" },
    airportId: null
  })

  assert.equal(result?.id, "legacy")
})

test("region geography used when airportId has no airport contract but location has region", () => {
  const regionPrice = {
    id: "region",
    name: "Altai region",
    createdAt: "2024-01-01",
    airports: [],
    geography: [{ region: "Алтайский край", city: "", country: "" }]
  }

  const result = resolvePriceByHotelLocation({
    airlinePrices: [regionPrice],
    hotelLocation: {
      country: "",
      region: "Алтайский край",
      city: "Барнаул",
      address: ""
    },
    airportId: "apt-barnaul"
  })

  assert.equal(result?.id, "region")
})

test("returns null when city is set but region is missing for regional tariff", () => {
  const regionPrice = {
    id: "region",
    name: "Altai region",
    createdAt: "2024-01-01",
    airports: [],
    geography: [{ region: "Алтайский край", city: "", country: "" }]
  }

  const result = resolvePriceByHotelLocation({
    airlinePrices: [regionPrice],
    hotelLocation: {
      country: "",
      region: "",
      city: "Барнаул",
      address: ""
    },
    airportId: "apt-barnaul"
  })

  assert.equal(result, null)
})

test("matches region geography by regionId", () => {
  const regionPrice = {
    id: "region",
    name: "Altai region",
    createdAt: "2024-01-01",
    airports: [],
    geography: [
      {
        region: "Алтайский край",
        regionId: "reg-altai",
        city: "",
        country: ""
      }
    ]
  }

  const result = resolvePriceByHotelLocation({
    airlinePrices: [regionPrice],
    hotelLocation: {
      country: "",
      region: "",
      city: "",
      regionId: "reg-altai",
      address: ""
    },
    airportId: "apt-barnaul"
  })

  assert.equal(result?.id, "region")
})

test("matches city geography by cityId", () => {
  const cityPrice = {
    id: "city",
    name: "Barnaul",
    createdAt: "2024-01-01",
    airports: [],
    geography: [
      {
        city: "Барнаул",
        cityId: "city-barnaul",
        region: "Алтайский край",
        country: ""
      }
    ]
  }

  const result = resolvePriceByHotelLocation({
    airlinePrices: [cityPrice],
    hotelLocation: {
      country: "",
      region: "",
      city: "",
      cityId: "city-barnaul",
      address: ""
    },
    airportId: null
  })

  assert.equal(result?.id, "city")
})

test("strict priority: airport then city then region", () => {
  const airportPrice = {
    id: "airport",
    createdAt: "2024-03-01",
    airports: [{ airportId: "apt-1" }],
    geography: []
  }
  const cityPrice = {
    id: "city",
    createdAt: "2024-02-01",
    airports: [],
    geography: [{ city: "Барнаул", region: "", country: "" }]
  }
  const regionPrice = {
    id: "region",
    createdAt: "2024-01-01",
    airports: [],
    geography: [{ region: "Алтайский край", city: "", country: "" }]
  }
  const prices = [regionPrice, cityPrice, airportPrice]
  const hotelLocation = {
    country: "",
    region: "Алтайский край",
    city: "Барнаул",
    address: ""
  }

  assert.equal(
    resolvePriceByHotelLocation({
      airlinePrices: prices,
      hotelLocation,
      airportId: "apt-1"
    })?.id,
    "airport"
  )

  assert.equal(
    resolvePriceByHotelLocation({
      airlinePrices: prices,
      hotelLocation,
      airportId: "other-airport"
    })?.id,
    "city"
  )

  assert.equal(
    resolvePriceByHotelLocation({
      airlinePrices: prices,
      hotelLocation: { ...hotelLocation, city: "Новосибирск" },
      airportId: null
    })?.id,
    "region"
  )
})

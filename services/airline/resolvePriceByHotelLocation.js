import { prisma } from "../../prisma.js"

export const normalizeGeoValue = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")

const hasGeoValue = (value) => normalizeGeoValue(value).length > 0

export const getHotelLocation = (hotel, airport) => {
  if (!hotel && !airport) {
    return {
      country: "",
      region: "",
      city: "",
      cityId: null,
      regionId: null,
      address: ""
    }
  }

  const loc = hotel?.location || {}
  const info = hotel?.information || {}

  const city = loc.city || info.city || airport?.city || ""

  return {
    country: loc.country || info.country || "",
    region: loc.region || "",
    city,
    cityId: loc.cityId || null,
    regionId: null,
    address: loc.address || info.address || ""
  }
}

const applyCityRecord = (location, cityRecord) => {
  if (!cityRecord) return
  if (!hasGeoValue(location.city)) location.city = cityRecord.city
  if (!hasGeoValue(location.region)) {
    location.region = cityRecord.regionRef?.name ?? ""
  }
  if (!location.cityId) location.cityId = cityRecord.id
  if (!location.regionId && cityRecord.regionId) {
    location.regionId = cityRecord.regionId
  }
}

export const buildPriceSearchLocation = async (hotel, airport) => {
  const location = { ...getHotelLocation(hotel, airport) }

  if (!hasGeoValue(location.region) && hotel?.location?.cityId) {
    const cityRecord = await prisma.city.findUnique({
      where: { id: hotel.location.cityId },
      include: { regionRef: true }
    })
    applyCityRecord(location, cityRecord)
  }

  if (!hasGeoValue(location.region) && airport?.city) {
    const cityRecord = await prisma.city.findFirst({
      where: { city: { equals: airport.city, mode: "insensitive" } },
      include: { regionRef: true }
    })
    applyCityRecord(location, cityRecord)
  }

  return location
}

const getPriceGeographies = (contract) => {
  const geo = contract?.geography
  if (Array.isArray(geo)) {
    return geo.length ? geo : [{}]
  }
  if (geo && typeof geo === "object") {
    return [geo]
  }
  return [{}]
}

const sortByCreatedAtAsc = (contracts) =>
  [...contracts].sort((a, b) => {
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0
    return aTime - bTime
  })

const pickFirst = (candidates) => {
  const sorted = sortByCreatedAtAsc(candidates)
  return sorted[0] ?? null
}

const resolveByAirportContract = (airlinePrices, airportId) => {
  if (!airportId || !Array.isArray(airlinePrices)) return null

  const candidates = airlinePrices.filter((contract) =>
    contract?.airports?.some(
      (item) => item.airportId && item.airportId === airportId
    )
  )
  return pickFirst(candidates)
}

const matchesCityLevel = (geography, location) => {
  if (geography.cityId && location.cityId && geography.cityId === location.cityId) {
    return true
  }
  const cityOnPrice = normalizeGeoValue(geography.city)
  if (!cityOnPrice) return false
  if (!hasGeoValue(location.city)) return false
  return cityOnPrice === normalizeGeoValue(location.city)
}

const matchesRegionLevel = (geography, location) => {
  if (
    geography.regionId &&
    location.regionId &&
    geography.regionId === location.regionId &&
    !hasGeoValue(geography.city)
  ) {
    return true
  }
  const regionOnPrice = normalizeGeoValue(geography.region)
  if (!regionOnPrice) return false
  if (hasGeoValue(geography.city)) return false
  if (!hasGeoValue(location.region)) return false
  return regionOnPrice === normalizeGeoValue(location.region)
}

const matchesCountryLevel = (geography, location) => {
  const countryOnPrice = normalizeGeoValue(geography.country)
  if (!countryOnPrice) return false
  if (hasGeoValue(geography.city) || hasGeoValue(geography.region)) return false
  if (!hasGeoValue(location.country)) return false
  return countryOnPrice === normalizeGeoValue(location.country)
}

const resolveGeographicLevel = (prices, location, matcher) => {
  const candidates = prices.filter((contract) =>
    getPriceGeographies(contract).some((geo) => matcher(geo, location))
  )
  return pickFirst(candidates)
}

export const resolvePriceByHotelLocation = ({
  airlinePrices,
  hotelLocation,
  airportId
}) => {
  const prices = Array.isArray(airlinePrices) ? airlinePrices : []
  const location = hotelLocation || {}

  const airportContract = resolveByAirportContract(prices, airportId)
  if (airportContract) return airportContract

  if (hasGeoValue(location.city) || location.cityId) {
    const cityContract = resolveGeographicLevel(
      prices,
      location,
      matchesCityLevel
    )
    if (cityContract) return cityContract
  }

  if (hasGeoValue(location.region) || location.regionId) {
    const regionContract = resolveGeographicLevel(
      prices,
      location,
      matchesRegionLevel
    )
    if (regionContract) return regionContract
  }

  if (hasGeoValue(location.country)) {
    const countryContract = resolveGeographicLevel(
      prices,
      location,
      matchesCountryLevel
    )
    if (countryContract) return countryContract
  }

  return null
}

export const getCategoryPriceFromContract = (contract, category) => {
  if (!contract?.prices) return 0

  const priceMap = {
    studio: contract.prices.priceStudio,
    apartment: contract.prices.priceApartment,
    luxe: contract.prices.priceLuxe,
    comfort: contract.prices.priceComfort,
    improvedComfort: contract.prices.priceImprovedComfort,
    onePlace: contract.prices.priceOneCategory,
    twoPlace: contract.prices.priceTwoCategory,
    threePlace: contract.prices.priceThreeCategory,
    fourPlace: contract.prices.priceFourCategory,
    fivePlace: contract.prices.priceFiveCategory,
    sixPlace: contract.prices.priceSixCategory,
    sevenPlace: contract.prices.priceSevenCategory,
    eightPlace: contract.prices.priceEightCategory,
    ninePlace: contract.prices.priceNineCategory,
    tenPlace: contract.prices.priceTenCategory
  }

  return Number(priceMap[category]) || 0
}

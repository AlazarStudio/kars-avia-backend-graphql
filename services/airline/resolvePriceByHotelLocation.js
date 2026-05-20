const GEO_LEVELS = ["city", "district", "republic", "region", "country"]

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
      republic: "",
      district: "",
      city: "",
      address: ""
    }
  }

  const loc = hotel?.location || {}
  const info = hotel?.information || {}

  const city = loc.city || info.city || airport?.city || ""

  return {
    country: loc.country || info.country || "",
    region: loc.region || "",
    republic: loc.republic || "",
    district: loc.district || "",
    city,
    address: loc.address || info.address || ""
  }
}

const getPriceGeography = (contract) => contract?.geography || {}

const geographyHasAnyField = (geography) =>
  GEO_LEVELS.some((level) => hasGeoValue(geography?.[level]))

const priceMatchesHotelLocation = (geography, hotelLocation) => {
  if (!geographyHasAnyField(geography)) return false

  for (const level of GEO_LEVELS) {
    const priceValue = normalizeGeoValue(geography[level])
    if (!priceValue) continue
    if (priceValue !== normalizeGeoValue(hotelLocation[level])) {
      return false
    }
  }
  return true
}

const getMostSpecificLevelIndex = (geography) => {
  for (let i = 0; i < GEO_LEVELS.length; i += 1) {
    if (hasGeoValue(geography[GEO_LEVELS[i]])) {
      return i
    }
  }
  return GEO_LEVELS.length
}

const resolveByAirportFallback = (airlinePrices, airportId) => {
  if (!airportId || !Array.isArray(airlinePrices)) return null

  for (const contract of airlinePrices) {
    if (!contract?.airports?.length) continue
    const match = contract.airports.find(
      (item) => item.airportId && item.airportId === airportId
    )
    if (match) return contract
  }
  return null
}

export const resolvePriceByHotelLocation = ({
  airlinePrices,
  hotelLocation,
  airportId
}) => {
  const prices = Array.isArray(airlinePrices) ? airlinePrices : []
  const location = hotelLocation || {}

  const geographicCandidates = prices
    .filter((contract) =>
      priceMatchesHotelLocation(getPriceGeography(contract), location)
    )
    .sort((a, b) => {
      const tierDiff =
        getMostSpecificLevelIndex(getPriceGeography(a)) -
        getMostSpecificLevelIndex(getPriceGeography(b))
      if (tierDiff !== 0) return tierDiff

      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0
      return aTime - bTime
    })

  if (geographicCandidates.length > 0) {
    return geographicCandidates[0]
  }

  return resolveByAirportFallback(prices, airportId)
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

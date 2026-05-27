import { GraphQLError } from "graphql"
import { prisma } from "../../prisma.js"

const emptyGeo = {
  country: "",
  region: "",
  city: "",
  cityId: null
}

const emptyHotelLocation = {
  ...emptyGeo,
  address: ""
}

const throwInvalid = (message) => {
  throw new GraphQLError(message, {
    extensions: { code: "BAD_USER_INPUT" }
  })
}

const loadCityById = async (cityId) => {
  const record = await prisma.city.findUnique({
    where: { id: cityId },
    select: { id: true, city: true, region: true }
  })
  if (!record) {
    throwInvalid("Город не найден в справочнике")
  }
  return record
}

const validateRegion = async (region) => {
  const trimmed = String(region ?? "").trim()
  if (!trimmed) return ""

  const exists = await prisma.city.findFirst({
    where: { region: trimmed },
    select: { id: true }
  })
  if (!exists) {
    throwInvalid("Регион не найден в справочнике")
  }
  return trimmed
}

export const normalizePriceGeography = async (input) => {
  if (!input) return emptyGeo

  const cityId = input.cityId?.trim() || null

  if (cityId) {
    const record = await loadCityById(cityId)
    return {
      country: String(input.country ?? "").trim(),
      region: record.region,
      city: record.city,
      cityId: record.id
    }
  }

  const region = await validateRegion(input.region)
  if (!region) return emptyGeo

  return {
    country: String(input.country ?? "").trim(),
    region,
    city: "",
    cityId: null
  }
}

export const normalizeHotelLocation = async (input) => {
  if (!input) return emptyHotelLocation

  const cityId = input.cityId?.trim() || null

  if (cityId) {
    const record = await loadCityById(cityId)
    return {
      country: String(input.country ?? "").trim(),
      region: record.region,
      city: record.city,
      cityId: record.id,
      address: String(input.address ?? "").trim()
    }
  }

  return {
    country: String(input.country ?? "").trim(),
    region: "",
    city: "",
    cityId: null,
    address: String(input.address ?? "").trim()
  }
}

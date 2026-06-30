import { GraphQLError } from "graphql"
import { prisma } from "../../prisma.js"

const emptyGeo = {
  country: "",
  region: "",
  city: "",
  cityId: null,
  regionId: null
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
    select: {
      id: true,
      city: true,
      regionRef: { select: { name: true } }
    }
  })
  if (!record) {
    throwInvalid("Город не найден в справочнике")
  }
  return {
    id: record.id,
    city: record.city,
    region: record.regionRef?.name ?? ""
  }
}

const loadRegionById = async (regionId) => {
  const record = await prisma.region.findUnique({
    where: { id: regionId },
    select: { id: true, name: true }
  })
  if (!record) {
    throwInvalid("Регион не найден в справочнике")
  }
  return record
}

const resolveRegionByName = async (regionName) => {
  const trimmed = String(regionName ?? "").trim()
  if (!trimmed) return null

  const record = await prisma.region.findFirst({
    where: { name: trimmed },
    select: { id: true, name: true }
  })
  if (!record) {
    throwInvalid("Регион не найден в справочнике")
  }
  return record
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
      cityId: record.id,
      regionId: null
    }
  }

  const regionId = input.regionId?.trim() || null

  if (regionId) {
    const record = await loadRegionById(regionId)
    return {
      country: String(input.country ?? "").trim(),
      region: record.name,
      city: "",
      cityId: null,
      regionId: record.id
    }
  }

  const regionInput = String(input.region ?? "").trim()
  if (!regionInput) return emptyGeo

  const record = await resolveRegionByName(regionInput)
  return {
    country: String(input.country ?? "").trim(),
    region: record.name,
    city: "",
    cityId: null,
    regionId: record.id
  }
}

const isEmptyGeo = (geo) =>
  !geo.city?.trim() &&
  !geo.region?.trim() &&
  !geo.country?.trim() &&
  !geo.cityId &&
  !geo.regionId

const assertNoDuplicateGeography = (list) => {
  const cityIds = new Set()
  const regionIds = new Set()

  for (const geo of list) {
    if (geo.cityId) {
      if (cityIds.has(geo.cityId)) {
        throwInvalid("Город уже добавлен в географию тарифа")
      }
      cityIds.add(geo.cityId)
    }
    if (geo.regionId) {
      if (regionIds.has(geo.regionId)) {
        throwInvalid("Регион уже добавлен в географию тарифа")
      }
      regionIds.add(geo.regionId)
    }
  }
}

export const normalizePriceGeographyList = async (inputs) => {
  if (!inputs?.length) return []

  const normalized = await Promise.all(
    inputs.map((item) => normalizePriceGeography(item))
  )
  const list = normalized.filter((geo) => !isEmptyGeo(geo))
  assertNoDuplicateGeography(list)
  return list
}

export const toPriceGeoCreateData = (geo) => ({
  country: geo.country ?? "",
  region: geo.region ?? "",
  city: geo.city ?? "",
  cityId: geo.cityId ?? null,
  regionId: geo.regionId ?? null
})

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

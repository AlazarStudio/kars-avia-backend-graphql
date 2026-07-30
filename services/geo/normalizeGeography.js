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

export const DEFAULT_CONTRACT_TYPE = "request"

export const normalizeContractType = (value) =>
  value || DEFAULT_CONTRACT_TYPE

/** Types that conflict with the given contractType when claiming geography/airports. */
export const conflictingContractTypes = (contractType) => {
  const type = normalizeContractType(contractType)
  if (type === "all") return ["all", "fap", "request"]
  if (type === "fap") return ["fap", "all"]
  return ["request", "all"]
}

export const contractTypesConflict = (a, b) =>
  conflictingContractTypes(a).includes(normalizeContractType(b))

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

export const emptyOccupiedLevels = () => ({
  regionLevelIds: new Set(),
  cityLevelIds: new Set(),
  airportIds: new Set()
})

export const emptyOccupiedByContractType = () => ({
  all: emptyOccupiedLevels(),
  fap: emptyOccupiedLevels(),
  request: emptyOccupiedLevels()
})

export const collectOccupiedLevels = (geographies, airportIds = []) => ({
  regionLevelIds: new Set(
    geographies.filter((g) => g.regionId && !g.cityId).map((g) => g.regionId)
  ),
  cityLevelIds: new Set(geographies.filter((g) => g.cityId).map((g) => g.cityId)),
  airportIds: new Set(
    (airportIds || []).filter(Boolean).map((id) => String(id))
  )
})

export const mergeOccupiedLevels = (occupied, geographies, airportIds = []) => {
  const merged = {
    regionLevelIds: new Set(occupied.regionLevelIds),
    cityLevelIds: new Set(occupied.cityLevelIds),
    airportIds: new Set(occupied.airportIds || [])
  }
  const fromList = collectOccupiedLevels(
    Array.isArray(geographies) ? geographies : [geographies],
    airportIds
  )
  for (const regionId of fromList.regionLevelIds) {
    merged.regionLevelIds.add(regionId)
  }
  for (const cityId of fromList.cityLevelIds) {
    merged.cityLevelIds.add(cityId)
  }
  for (const airportId of fromList.airportIds) {
    merged.airportIds.add(airportId)
  }
  return merged
}

export const getOccupiedForContractType = (byType, contractType) => {
  let occupied = emptyOccupiedLevels()
  for (const type of conflictingContractTypes(contractType)) {
    const bucket = byType[type] || emptyOccupiedLevels()
    occupied = mergeOccupiedLevels(occupied, [
      ...[...bucket.regionLevelIds].map((regionId) => ({
        regionId,
        cityId: null
      })),
      ...[...bucket.cityLevelIds].map((cityId) => ({
        cityId,
        regionId: null
      }))
    ], [...(bucket.airportIds || [])])
  }
  return occupied
}

export const addToOccupiedByContractType = (
  byType,
  contractType,
  geographies,
  airportIds = []
) => {
  const type = normalizeContractType(contractType)
  byType[type] = mergeOccupiedLevels(
    byType[type] || emptyOccupiedLevels(),
    geographies,
    airportIds
  )
  return byType
}

export const assertNoCrossPriceLevelConflict = (newList, occupied) => {
  for (const geo of newList) {
    if (
      geo.regionId &&
      !geo.cityId &&
      occupied.regionLevelIds.has(geo.regionId)
    ) {
      throwInvalid(`Регион «${geo.region}» уже используется в другом тарифе`)
    }
    if (geo.cityId && occupied.cityLevelIds.has(geo.cityId)) {
      throwInvalid(`Город «${geo.city}» уже используется в другом тарифе`)
    }
  }
}

export const assertNoAirportConflict = (airportIds, occupied) => {
  const ids = (airportIds || []).filter(Boolean).map((id) => String(id))
  const seen = new Set()
  for (const airportId of ids) {
    if (seen.has(airportId)) {
      throwInvalid("Аэропорт уже добавлен в тариф")
    }
    seen.add(airportId)
    if (occupied.airportIds?.has(airportId)) {
      throwInvalid("Аэропорт уже используется в другом тарифе")
    }
  }
}

export const loadOccupiedByContractType = async (
  airlineId,
  { excludePriceIds = [] } = {}
) => {
  const byType = emptyOccupiedByContractType()
  const priceWhere = {
    airlineId,
    ...(excludePriceIds.length > 0 ? { id: { notIn: excludePriceIds } } : {})
  }

  const [geoRows, airportRows] = await Promise.all([
    prisma.priceGeoOnAirlinePrice.findMany({
      where: { airlinePrice: priceWhere },
      select: {
        cityId: true,
        regionId: true,
        airlinePrice: { select: { contractType: true } }
      }
    }),
    prisma.airportOnAirlinePrice.findMany({
      where: {
        airlineId,
        airlinePrice: priceWhere
      },
      select: {
        airportId: true,
        airlinePrice: { select: { contractType: true } }
      }
    })
  ])

  for (const row of geoRows) {
    const type = normalizeContractType(row.airlinePrice?.contractType)
    byType[type] = mergeOccupiedLevels(byType[type], [
      { cityId: row.cityId, regionId: row.regionId }
    ])
  }

  for (const row of airportRows) {
    const type = normalizeContractType(row.airlinePrice?.contractType)
    byType[type] = mergeOccupiedLevels(byType[type], [], [row.airportId])
  }

  return byType
}

export const loadOccupiedPriceGeography = async (
  airlineId,
  { excludePriceIds = [], contractType = DEFAULT_CONTRACT_TYPE } = {}
) => {
  const byType = await loadOccupiedByContractType(airlineId, {
    excludePriceIds
  })
  return getOccupiedForContractType(byType, contractType)
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

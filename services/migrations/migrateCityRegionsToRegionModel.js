/**
 * One-off: выносит уникальные City.region в модель Region и проставляет regionId.
 * Читает legacy-поле region через raw Mongo (после удаления из Prisma-схемы).
 * Запуск: node services/migrations/migrateCityRegionsToRegionModel.js
 */
import { prisma } from "../../prisma.js"

const toObjectIdString = (value) => {
  if (!value) return null
  if (typeof value === "string") return value
  if (typeof value === "object" && value.$oid) return value.$oid
  return String(value)
}

const normalizeRegionName = (value) => String(value ?? "").trim()

async function fetchCityDocs() {
  const result = await prisma.$runCommandRaw({
    find: "City",
    filter: {},
    projection: { _id: 1, region: 1, regionId: 1 },
    batchSize: 5000
  })
  return result?.cursor?.firstBatch ?? []
}

async function ensureRegionByName(name, cache) {
  if (cache.has(name)) return cache.get(name)

  const existing = await prisma.region.findUnique({ where: { name } })
  if (existing) {
    cache.set(name, existing.id)
    return existing.id
  }

  const created = await prisma.region.create({ data: { name } })
  cache.set(name, created.id)
  return created.id
}

async function main() {
  const docs = await fetchCityDocs()
  const regionCache = new Map()
  let regionsCreated = 0
  let citiesUpdated = 0
  let citiesSkipped = 0
  const emptyRegionCities = []

  for (const doc of docs) {
    const cityId = toObjectIdString(doc._id)
    const existingRegionId = toObjectIdString(doc.regionId)

    if (!cityId) {
      citiesSkipped += 1
      continue
    }

    if (existingRegionId) {
      citiesSkipped += 1
      continue
    }

    const regionName = normalizeRegionName(doc.region)
    if (!regionName) {
      emptyRegionCities.push(cityId)
      citiesSkipped += 1
      continue
    }

    const beforeSize = regionCache.size
    const regionId = await ensureRegionByName(regionName, regionCache)
    if (regionCache.size > beforeSize) {
      regionsCreated += 1
    }

    await prisma.city.update({
      where: { id: cityId },
      data: { regionId }
    })
    citiesUpdated += 1
  }

  console.log(`City docs: ${docs.length}`)
  console.log(`Regions created: ${regionsCreated}`)
  console.log(`Regions total: ${regionCache.size}`)
  console.log(`Cities updated: ${citiesUpdated}`)
  console.log(`Cities skipped: ${citiesSkipped}`)
  if (emptyRegionCities.length) {
    console.log(`Cities with empty region (${emptyRegionCities.length}):`)
    console.log(emptyRegionCities.join(", "))
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())

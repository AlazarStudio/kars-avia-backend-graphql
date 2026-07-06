/**
 * One-off: переносит embedded geography (объект) в PriceGeoOnAirlinePrice[].
 * Запуск: node services/migrations/migrateAirlinePriceGeographyToArray.js
 */
import { prisma } from "../../prisma.js"

const toObjectIdString = (value) => {
  if (!value) return null
  if (typeof value === "string") return value
  if (typeof value === "object" && value.$oid) return value.$oid
  return String(value)
}

const hasLegacyGeography = (geo) => {
  if (!geo || typeof geo !== "object" || Array.isArray(geo)) return false
  const city = String(geo.city ?? "").trim()
  const region = String(geo.region ?? "").trim()
  const country = String(geo.country ?? "").trim()
  const cityId = toObjectIdString(geo.cityId)
  return Boolean(city || region || country || cityId)
}

async function fetchLegacyPriceDocs() {
  const result = await prisma.$runCommandRaw({
    find: "AirlinePrice",
    filter: {
      geography: { $type: "object" }
    },
    batchSize: 500
  })

  return result?.cursor?.firstBatch ?? []
}

async function main() {
  const docs = await fetchLegacyPriceDocs()
  let migrated = 0
  let skipped = 0

  for (const doc of docs) {
    const priceId = toObjectIdString(doc._id)
    const legacyGeo = doc.geography

    if (!priceId || !hasLegacyGeography(legacyGeo)) {
      skipped += 1
      continue
    }

    const existing = await prisma.priceGeoOnAirlinePrice.count({
      where: { airlinePriceId: priceId }
    })
    if (existing > 0) {
      skipped += 1
    } else {
      await prisma.priceGeoOnAirlinePrice.create({
        data: {
          airlinePriceId: priceId,
          country: String(legacyGeo.country ?? "").trim(),
          region: String(legacyGeo.region ?? "").trim(),
          city: String(legacyGeo.city ?? "").trim(),
          cityId: toObjectIdString(legacyGeo.cityId)
        }
      })
      migrated += 1
    }

    await prisma.$runCommandRaw({
      update: "AirlinePrice",
      updates: [
        {
          q: { _id: doc._id },
          u: { $unset: { geography: "" } }
        }
      ]
    })
  }

  console.log(
    `Legacy docs: ${docs.length}, migrated: ${migrated}, skipped: ${skipped}`
  )
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())

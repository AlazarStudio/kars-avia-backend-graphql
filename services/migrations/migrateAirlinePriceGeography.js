/**
 * @deprecated Используйте migrateAirlinePriceGeographyToArray.js (embedded geography удалён).
 * One-off: копирует airport.city в geography.city для тарифов с привязкой к аэропортам.
 * Запуск: node services/migrations/migrateAirlinePriceGeography.js
 */
import { prisma } from "../../prisma.js"

async function main() {
  const links = await prisma.airportOnAirlinePrice.findMany({
    include: { airport: true, airlinePrice: true }
  })

  let updated = 0
  for (const link of links) {
    if (!link.airlinePriceId || !link.airport?.city) continue

    const price = await prisma.airlinePrice.findUnique({
      where: { id: link.airlinePriceId },
      select: { geography: true }
    })
    if (price?.geography?.city) continue

    await prisma.airlinePrice.update({
      where: { id: link.airlinePriceId },
      data: {
        geography: {
          ...(price?.geography || {}),
          city: link.airport.city
        }
      }
    })
    updated += 1
  }

  console.log(`Updated ${updated} airline price records`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())

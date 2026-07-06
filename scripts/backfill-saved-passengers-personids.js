// Backfill ФАП Этап 2: для каждой заявки проставляет personId всем сервис-персонам
// и заносит их в savedPassengers (каталог). Идемпотентно.
// Запуск:  node scripts/backfill-saved-passengers-personids.js [--dry-run]

import { prisma } from "../prisma.js"
import {
  ensurePersonId,
  upsertSavedPassenger,
  dedupeSavedPassengers,
  snapshotFromServicePerson,
  snapshotFromHotelPerson,
  snapshotFromDriverPerson
} from "../services/passengerRequest/savedPassengers.js"

const DRY_RUN = process.argv.includes("--dry-run")
const DRIVER_SERVICES = [
  "transferService",
  "departureTransferService",
  "intercityTransferService",
  "baggageDeliveryService"
]

async function main() {
  const requests = await prisma.passengerRequest.findMany({
    orderBy: { createdAt: "asc" }
  })
  let scanned = 0
  let changed = 0
  let personsTouched = 0

  for (const req of requests) {
    scanned++
    let roster = req.savedPassengers || []
    let mutated = false

    // Порядок важен: living/driver (реальные категории) ДО water/meal (часто дефолт ADULT),
    // т.к. upsert existing-wins по personCategory сохраняет первую захваченную.

    // 1) livingService.hotels[].people[]
    const living = req.livingService
    if (living?.hotels?.length) {
      living.hotels = living.hotels.map((hotel) => ({
        ...hotel,
        people: (hotel.people || []).map((p) => {
          const withId = ensurePersonId(p)
          if (withId.personId !== p.personId) mutated = true
          roster = upsertSavedPassenger(roster, snapshotFromHotelPerson(withId))
          personsTouched++
          return withId
        })
      }))
    }

    // 2) transfer/departure/intercity/baggage → drivers[].people[]
    for (const key of DRIVER_SERVICES) {
      const svc = req[key]
      if (!svc?.drivers?.length) continue
      svc.drivers = svc.drivers.map((driver) => ({
        ...driver,
        people: (driver.people || []).map((p) => {
          const withId = ensurePersonId(p)
          if (withId.personId !== p.personId) mutated = true
          roster = upsertSavedPassenger(roster, snapshotFromDriverPerson(withId))
          personsTouched++
          return withId
        })
      }))
    }

    // 3) waterService.people[] + mealService.people[]
    for (const key of ["waterService", "mealService"]) {
      const svc = req[key]
      if (!svc?.people?.length) continue
      svc.people = svc.people.map((p) => {
        const withId = ensurePersonId(p)
        if (withId.personId !== p.personId) mutated = true
        roster = upsertSavedPassenger(roster, snapshotFromServicePerson(withId))
        personsTouched++
        return withId
      })
    }

    roster = dedupeSavedPassengers(roster)
    const rosterChanged = roster.length !== (req.savedPassengers?.length || 0)
    if (!mutated && !rosterChanged) continue
    changed++

    if (DRY_RUN) {
      console.log(
        `[dry-run] ${req.id}: roster ${req.savedPassengers?.length || 0}→${roster.length}`
      )
      continue
    }

    // Prisma+Mongo: композитные массивы заменяются целиком — пишем ВЕСЬ изменённый объект.
    // Даты (arrival/departure/pickupAt/addedAt…) — оставляем как Date (НЕ через JSON.stringify).
    const data = { savedPassengers: { set: roster } }
    if (req.livingService) data.livingService = { set: req.livingService }
    for (const key of DRIVER_SERVICES) {
      if (req[key]) data[key] = { set: req[key] }
    }
    if (req.waterService) data.waterService = { set: req.waterService }
    if (req.mealService) data.mealService = { set: req.mealService }

    await prisma.passengerRequest.update({ where: { id: req.id }, data })
    console.log(`${req.id}: обновлено (roster→${roster.length})`)
  }

  console.log(
    `Готово. scanned=${scanned} changed=${changed} personsTouched=${personsTouched}${DRY_RUN ? " (dry-run)" : ""}`
  )
}

main()
  .catch((e) => {
    console.error("Ошибка backfill:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

/**
 * Проставляет airlineDepartmentId на заявках/бронях, созданных пользователями АК.
 * Запуск: node services/migrations/backfillRequestReserveAirlineDepartment.js
 */
import { prisma } from "../../prisma.js"

function resolveDepartmentFromRecord(record, { includePerson = false }) {
  if (record.sender?.dispatcher === true) return null
  if (record.sender?.airlineDepartmentId) return record.sender.airlineDepartmentId
  if (includePerson && record.person?.departmentId) {
    return record.person.departmentId
  }
  return null
}

async function backfillRequests() {
  const requests = await prisma.request.findMany({
    where: { airlineDepartmentId: null },
    select: {
      id: true,
      sender: {
        select: { dispatcher: true, airlineDepartmentId: true }
      },
      person: { select: { departmentId: true } }
    }
  })

  let updated = 0
  for (const request of requests) {
    const departmentId = resolveDepartmentFromRecord(request, {
      includePerson: true
    })
    if (!departmentId) continue

    await prisma.request.update({
      where: { id: request.id },
      data: { airlineDepartmentId: departmentId }
    })
    updated++
  }

  console.log(`Request: обновлено ${updated} из ${requests.length}`)
}

async function backfillReserves() {
  const reserves = await prisma.reserve.findMany({
    where: { airlineDepartmentId: null },
    select: {
      id: true,
      sender: {
        select: { dispatcher: true, airlineDepartmentId: true }
      }
    }
  })

  let updated = 0
  for (const reserve of reserves) {
    const departmentId = resolveDepartmentFromRecord(reserve)
    if (!departmentId) continue

    await prisma.reserve.update({
      where: { id: reserve.id },
      data: { airlineDepartmentId: departmentId }
    })
    updated++
  }

  console.log(`Reserve: обновлено ${updated} из ${reserves.length}`)
}

async function main() {
  await backfillRequests()
  await backfillReserves()
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())

/**
 * Проставляет archivingAt на заявках со статусом archiving.
 * Запуск: node services/migrations/backfillRequestArchivingAt.js
 */
import { prisma } from "../../prisma.js"

async function main() {
  const requests = await prisma.request.findMany({
    where: { status: "archiving", archivingAt: null },
    select: { id: true, updatedAt: true }
  })

  let updated = 0
  for (const request of requests) {
    await prisma.request.update({
      where: { id: request.id },
      data: { archivingAt: request.updatedAt }
    })
    updated++
  }

  console.log(`Backfill complete: ${updated} request(s) updated`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())

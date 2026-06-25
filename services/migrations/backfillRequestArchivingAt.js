/**
 * Проставляет archivingAt на уже архивных заявках; сбрасывает ошибочно
 * проставленное значение у заявок в статусе archiving.
 * Запуск: node services/migrations/backfillRequestArchivingAt.js
 */
import { prisma } from "../../prisma.js"

async function main() {
  const cleared = await prisma.request.updateMany({
    where: { status: "archiving", archivingAt: { not: null } },
    data: { archivingAt: null }
  })

  const archived = await prisma.request.findMany({
    where: { status: "archived", archive: true, archivingAt: null },
    select: { id: true, updatedAt: true }
  })

  let updated = 0
  for (const request of archived) {
    await prisma.request.update({
      where: { id: request.id },
      data: { archivingAt: request.updatedAt }
    })
    updated++
  }

  console.log(
    `Backfill complete: ${cleared.count} archiving request(s) cleared, ${updated} archived request(s) updated`
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())

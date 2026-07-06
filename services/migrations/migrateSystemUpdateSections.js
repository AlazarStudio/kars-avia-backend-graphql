/**
 * Миграция SystemUpdate: legacy message → секции по аудиториям.
 *
 * Запуск до или после обновления схемы (читает поле message через findRaw).
 * Если секции уже заполнены — запись пропускается.
 *
 * Запуск: node services/migrations/migrateSystemUpdateSections.js
 */

import dotenv from "dotenv"
import { prisma } from "../../prisma.js"
import { messageToLegacySection } from "../site/systemUpdateUtils.js"

dotenv.config()

function hasLegacySections(record) {
  return ["airline", "dispatcher", "hotel"].some((key) => {
    const section = record?.[key]
    if (!section) return false
    return ["new", "updates", "fixes"].some(
      (part) => Array.isArray(section[part]) && section[part].length > 0
    )
  })
}

async function main() {
  const rawRecords = await prisma.systemUpdate.findRaw({ filter: {} })

  if (!Array.isArray(rawRecords) || rawRecords.length === 0) {
    console.log("Записей SystemUpdate не найдено — миграция не требуется.")
    return
  }

  let migrated = 0

  for (const raw of rawRecords) {
    const id = raw._id?.$oid ?? raw._id
    if (!id) continue

    const record = await prisma.systemUpdate.findUnique({ where: { id } })
    if (!record) continue

    if (hasLegacySections(record)) {
      console.log(`Пропуск ${id}: секции уже заполнены`)
      continue
    }

    const legacyMessage = typeof raw.message === "string" ? raw.message.trim() : ""
    if (!legacyMessage) {
      console.log(`Пропуск ${id}: нет legacy message`)
      continue
    }

    const section = messageToLegacySection(legacyMessage)

    await prisma.systemUpdate.update({
      where: { id },
      data: {
        airline: section,
        dispatcher: section,
        hotel: section
      }
    })

    migrated += 1
    console.log(`Мигрировано: ${id}`)
  }

  console.log(`Готово. Обновлено записей: ${migrated}.`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

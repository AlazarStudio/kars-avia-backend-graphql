/**
 * migrateContractFiles.js
 *
 * Конвертирует legacy files: String[] → ContractFile[] { name, url }
 * для airlineContract, hotelContract, organizationContract, additionalAgreement.
 *
 * Запуск:
 *   node services/migrations/migrateContractFiles.js
 *   node services/migrations/migrateContractFiles.js --dry-run
 */

import { prisma } from "../../prisma.js"
import { logger } from "../infra/logger.js"
import { normalizeContractFiles } from "../contract/files.js"

const DRY_RUN = process.argv.includes("--dry-run")

const TARGETS = [
  { name: "airlineContract", model: prisma.airlineContract },
  { name: "hotelContract", model: prisma.hotelContract },
  { name: "organizationContract", model: prisma.organizationContract },
  { name: "additionalAgreement", model: prisma.additionalAgreement }
]

const hasLegacyFiles = (files) =>
  Array.isArray(files) && files.some((item) => typeof item === "string")

const migrateModel = async ({ name, model }) => {
  const records = await model.findMany({
    where: { files: { isEmpty: false } },
    select: { id: true, files: true }
  })

  let updated = 0

  for (const record of records) {
    if (!hasLegacyFiles(record.files)) continue

    const normalized = normalizeContractFiles(record.files)

    if (!DRY_RUN) {
      await model.update({
        where: { id: record.id },
        data: { files: normalized }
      })
    }

    updated++
    logger.info(
      `[${name}] ${DRY_RUN ? "would update" : "updated"} ${record.id} (${record.files.length} files)`
    )
  }

  return updated
}

const main = async () => {
  logger.info(
    `[migrateContractFiles] start${DRY_RUN ? " (dry-run)" : ""}`
  )

  let total = 0
  for (const target of TARGETS) {
    const count = await migrateModel(target)
    total += count
    logger.info(`[${target.name}] processed: ${count}`)
  }

  logger.info(`[migrateContractFiles] done, total updated: ${total}`)
}

main()
  .catch((error) => {
    logger.error("[migrateContractFiles] failed", error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

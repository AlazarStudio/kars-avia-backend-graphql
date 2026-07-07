/**
 * migrateContractFiles.js
 *
 * Конвертирует legacy files: String[] → ContractFile[] { name, url }
 * для airlineContract, hotelContract, organizationContract, additionalAgreement.
 *
 * Важно: после смены Prisma-схемы на ContractFile[] обычный findMany
 * не видит legacy-строки в files, поэтому чтение/поиск — через raw Mongo.
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
  { name: "airlineContract", collection: "airlineContract" },
  { name: "hotelContract", collection: "hotelContract" },
  { name: "organizationContract", collection: "organizationContract" },
  { name: "additionalAgreement", collection: "additionalAgreement" }
]

/** Документы, где в files есть хотя бы один элемент-строка */
const LEGACY_FILES_FILTER = {
  $expr: {
    $gt: [
      {
        $size: {
          $filter: {
            input: { $ifNull: ["$files", []] },
            as: "file",
            cond: { $eq: [{ $type: "$$file" }, "string"] }
          }
        }
      },
      0
    ]
  }
}

const hasLegacyFiles = (files) =>
  Array.isArray(files) && files.some((item) => typeof item === "string")

const fetchLegacyDocs = async (collection) => {
  const docs = []

  const first = await prisma.$runCommandRaw({
    find: collection,
    filter: LEGACY_FILES_FILTER,
    batchSize: 500
  })

  const cursor = first?.cursor
  if (cursor?.firstBatch?.length) {
    docs.push(...cursor.firstBatch)
  }

  let cursorId = cursor?.id
  while (cursorId) {
    const next = await prisma.$runCommandRaw({
      getMore: cursorId,
      collection,
      batchSize: 500
    })

    const batch = next?.cursor?.nextBatch ?? []
    if (!batch.length) break

    docs.push(...batch)
    cursorId = next?.cursor?.id
  }

  return docs
}

const updateLegacyDoc = async (collection, doc, normalizedFiles) => {
  if (DRY_RUN) return

  await prisma.$runCommandRaw({
    update: collection,
    updates: [
      {
        q: { _id: doc._id },
        u: { $set: { files: normalizedFiles } }
      }
    ]
  })
}

const migrateModel = async ({ name, collection }) => {
  const records = await fetchLegacyDocs(collection)
  let updated = 0
  let skipped = 0

  for (const record of records) {
    if (!hasLegacyFiles(record.files)) {
      skipped++
      continue
    }

    const normalized = normalizeContractFiles(record.files)

    await updateLegacyDoc(collection, record, normalized)

    updated++
    console.log(
      `[${name}] ${DRY_RUN ? "would update" : "updated"} ${JSON.stringify(record._id)} (${record.files.length} files)`
    )
  }

  if (skipped > 0) {
    console.log(`[${name}] skipped (already migrated): ${skipped}`)
  }

  return updated
}

const main = async () => {
  console.log(`[migrateContractFiles] start${DRY_RUN ? " (dry-run)" : ""}`)

  let total = 0
  for (const target of TARGETS) {
    const count = await migrateModel(target)
    total += count
    console.log(`[${target.name}] processed: ${count}`)
  }

  console.log(`[migrateContractFiles] done, total updated: ${total}`)
}

main()
  .catch((error) => {
    logger.error("[migrateContractFiles] failed", error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

/**
 * migrateUploads.js
 *
 * Безопасная миграция файлов из /uploads
 * в структурированные подкаталоги + обновление ссылок в БД + отчёт
 */

import fs from "fs"
import path from "path"
import cliProgress from "cli-progress"
import { prisma } from "../../prisma.js"
import { logger } from "../infra/logger.js"

/* =========================
   ⚙ CONFIG
========================= */

const UPLOADS_ROOT = path.join(process.cwd(), "uploads")
const MIGRATED_ROOT = path.join(UPLOADS_ROOT, "migrated")
const REPORT_ROOT = path.join(process.cwd(), "reports/upload-migration")

const DRY_RUN = false // true → только лог, false → реально переносит

/* =========================
   🧠 HELPERS
========================= */

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

const isTopLevelFile = (file) => {
  try {
    return fs.statSync(path.join(UPLOADS_ROOT, file)).isFile()
  } catch {
    return false
  }
}

const getFileDateParts = (filePath) => {
  const stat = fs.statSync(filePath)
  const date = stat.birthtime ?? stat.mtime

  return {
    y: String(date.getFullYear()),
    m: String(date.getMonth() + 1).padStart(2, "0"),
    d: String(date.getDate()).padStart(2, "0")
  }
}

const buildTargetDir = ({ bucket, entityId, fileAbsPath }) => {
  const { y, m, d } = getFileDateParts(fileAbsPath)

  const parts = [MIGRATED_ROOT, bucket]
  if (entityId) parts.push(entityId)
  parts.push(y, m, d)

  return path.join(...parts)
}

const replaceInArray = (arr, oldPath, newPath) =>
  arr?.map((p) => (p === oldPath ? newPath : p))

/* =========================
   🔍 FILE CLASSIFICATION
========================= */

const resolveFileOwner = async (oldRelPath) => {
  const request = await prisma.request.findFirst({
    where: { files: { has: oldRelPath } },
    select: { id: true }
  })
  if (request) return { bucket: "requests", entityId: request.id }

  const reserve = await prisma.reserve.findFirst({
    where: { files: { has: oldRelPath } },
    select: { id: true }
  })
  if (reserve) return { bucket: "reserves", entityId: reserve.id }

  const user = await prisma.user.findFirst({
    where: { images: { has: oldRelPath } },
    select: { id: true }
  })
  if (user) return { bucket: "users", entityId: user.id }

  const personal = await prisma.airlinePersonal.findFirst({
    where: { images: { has: oldRelPath } },
    select: { id: true }
  })
  if (personal) return { bucket: "airline-personal", entityId: personal.id }

  return { bucket: "unknown", entityId: null }
}

/* =========================
   🗺 MIGRATION MAP
========================= */

const migrationMap = []

/* =========================
   🔄 DB UPDATE CONFIG
========================= */

const UPDATE_TARGETS = [
  { model: "request", fields: ["files"] },
  { model: "reserve", fields: ["files", "passengerList"] },
  { model: "user", fields: ["images"] },
  { model: "airlinePersonal", fields: ["images"] },
  { model: "airline", fields: ["images"] },
  { model: "hotel", fields: ["images", "gallery"] },
  { model: "room", fields: ["images"] },
  { model: "roomKind", fields: ["images"] },
  { model: "additionalServices", fields: ["images"] },
  { model: "airlineContract", fields: ["files"] },
  { model: "additionalAgreement", fields: ["files"] },
  { model: "hotelContract", fields: ["files"] },
  { model: "documentation", fields: ["files", "images"] },
  { model: "patchNote", fields: ["files", "images"] },
  { model: "transfer", fields: ["files"] }
]

const updateDatabaseLinks = async () => {
  let updated = 0

  for (const item of migrationMap) {
    if (item.status !== "moved") continue

    for (const target of UPDATE_TARGETS) {
      const model = prisma[target.model]
      if (!model) continue

      for (const field of target.fields) {
        const records = await model.findMany({
          where: { [field]: { has: item.old } },
          select: { id: true, [field]: true }
        })

        for (const rec of records) {
          await model.update({
            where: { id: rec.id },
            data: {
              [field]: replaceInArray(rec[field], item.old, item.new)
            }
          })
          updated++
        }
      }
    }
  }

  logger.info(`[DB] Updated links: ${updated}`)
}

/* =========================
   🚚 MIGRATION
========================= */

const migrate = async () => {
  ensureDir(MIGRATED_ROOT)
  ensureDir(REPORT_ROOT)

  const files = fs
    .readdirSync(UPLOADS_ROOT)
    .filter((f) => f !== "migrated")
    .filter(isTopLevelFile)

  logger.info(`[MIGRATE] Found ${files.length} files`)

  const bar = new cliProgress.SingleBar(
    {
      format: "MIGRATING |{bar}| {percentage}% | {value}/{total}",
      hideCursor: true
    },
    cliProgress.Presets.shades_classic
  )

  bar.start(files.length, 0)

  for (const file of files) {
    try {
      const oldRel = `/uploads/${file}`
      const oldAbs = path.join(UPLOADS_ROOT, file)

      const { bucket, entityId } = await resolveFileOwner(oldRel)
      const targetDir = buildTargetDir({
        bucket,
        entityId,
        fileAbsPath: oldAbs
      })

      ensureDir(targetDir)

      const newName = `${Date.now()}-${file}`
      const newAbs = path.join(targetDir, newName)
      const newRel =
        "/uploads/" + path.relative(UPLOADS_ROOT, newAbs).replace(/\\/g, "/")

      logger.info(`[MOVE] ${oldRel} → ${newRel}`)

      if (!DRY_RUN) {
        fs.renameSync(oldAbs, newAbs)
      }

      migrationMap.push({
        old: oldRel,
        new: newRel,
        bucket,
        entityId,
        status: DRY_RUN ? "dry-run" : "moved"
      })
    } catch (e) {
      logger.error(`[MIGRATE ERROR] ${file}`, e)
      migrationMap.push({
        old: `/uploads/${file}`,
        status: "error",
        error: e.message
      })
    } finally {
      bar.increment()
    }
  }

  bar.stop()

  /* =========================
     🧾 SAVE REPORT
  ========================= */

  const reportPath = path.join(
    REPORT_ROOT,
    `migration-${new Date().toISOString().slice(0, 10)}.json`
  )

  fs.writeFileSync(reportPath, JSON.stringify(migrationMap, null, 2))
  logger.info(`[REPORT] Saved: ${reportPath}`)

  /* =========================
     🔄 UPDATE DB
  ========================= */

  if (!DRY_RUN) {
    await updateDatabaseLinks()
  }

  await prisma.$disconnect()
}

/* =========================
   ▶ RUN
========================= */

migrate()
  .then(() => {
    logger.info("[MIGRATE] Completed successfully")
    process.exit(0)
  })
  .catch((e) => {
    logger.error("[MIGRATE] Failed", e)
    process.exit(1)
  })

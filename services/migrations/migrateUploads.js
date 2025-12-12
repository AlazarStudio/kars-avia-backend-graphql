/**
 * migrateUploads.js
 *
 * Безопасная миграция файлов из /uploads
 * в структурированные подкаталоги:
 *
 * uploads/
 *   migrated/
 *     requests/{requestId}/YYYY/MM/DD/file.ext
 *     users/{userId}/YYYY/MM/DD/file.ext
 *     unknown/YYYY/MM/DD/file.ext
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

const DRY_RUN = true // true → только лог, false → реально переносит

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

/* =========================
   🔍 FILE CLASSIFICATION
========================= */

const resolveFileOwner = async (oldRelPath) => {
  const request = await prisma.request.findFirst({
    where: {
      OR: [{ documents: { has: oldRelPath } }, { images: { has: oldRelPath } }]
    },
    select: { id: true }
  })

  if (request) {
    return { bucket: "requests", entityId: request.id }
  }

  const user = await prisma.user.findFirst({
    where: { avatar: oldRelPath },
    select: { id: true }
  })

  if (user) {
    return { bucket: "users", entityId: user.id }
  }

  return { bucket: "unknown", entityId: null }
}

/* =========================
   🚚 MIGRATION
========================= */

const migrate = async () => {
  ensureDir(MIGRATED_ROOT)

  const files = fs
    .readdirSync(UPLOADS_ROOT)
    .filter((f) => f !== "migrated")
    .filter(isTopLevelFile)

  logger.info(`[MIGRATE] Found ${files.length} files`)

  const bar = new cliProgress.SingleBar(
    {
      format: "MIGRATING |{bar}| {percentage}% | {value}/{total} files",
      barCompleteChar: "█",
      barIncompleteChar: "░",
      hideCursor: true
    },
    cliProgress.Presets.shades_classic
  )

  bar.start(files.length, 0)

  let scanned = 0
  let moved = 0

  for (const file of files) {
    scanned++

    try {
      const oldRelPath = `/uploads/${file}`
      const oldAbsPath = path.join(UPLOADS_ROOT, file)

      const { bucket, entityId } = await resolveFileOwner(oldRelPath)
      const targetDir = buildTargetDir({
        bucket,
        entityId,
        fileAbsPath: oldAbsPath
      })

      ensureDir(targetDir)

      const newFileName = `${Date.now()}-${file}`
      const newAbsPath = path.join(targetDir, newFileName)
      const newRelPath =
        "/uploads/" +
        path.relative(UPLOADS_ROOT, newAbsPath).replace(/\\/g, "/")

      logger.info(`[MOVE] ${oldRelPath} → ${newRelPath}`)

      if (!DRY_RUN) {
        fs.renameSync(oldAbsPath, newAbsPath)

        /* ===== UPDATE REQUESTS ===== */
        const requests = await prisma.request.findMany({
          where: {
            OR: [
              { documents: { has: oldRelPath } },
              { images: { has: oldRelPath } }
            ]
          },
          select: { id: true, documents: true, images: true }
        })

        for (const r of requests) {
          await prisma.request.update({
            where: { id: r.id },
            data: {
              documents: r.documents?.map((p) =>
                p === oldRelPath ? newRelPath : p
              ),
              images: r.images?.map((p) => (p === oldRelPath ? newRelPath : p))
            }
          })
        }

        /* ===== UPDATE USERS ===== */
        await prisma.user.updateMany({
          where: { avatar: oldRelPath },
          data: { avatar: newRelPath }
        })

        moved++
      }
    } catch (e) {
      logger.error(`[MIGRATE ERROR] ${file}`, e)
    } finally {
      bar.increment()
    }
  }

  bar.stop()

  logger.info(
    `[MIGRATE] Done. Scanned: ${scanned}, Moved: ${DRY_RUN ? 0 : moved}`
  )

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

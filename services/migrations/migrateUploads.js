import fs from "fs"
import path from "path"
import cliProgress from "cli-progress"
import { prisma } from "../../prisma.js"
import { logger } from "../infra/logger.js"

const UPLOADS_ROOT = path.join(process.cwd(), "uploads")
const MIGRATED_ROOT = path.join(UPLOADS_ROOT, "migrated")
const DRY_RUN = false

const ensureDir = (dir) => fs.mkdirSync(dir, { recursive: true })

const getDateParts = (filePath) => {
  const stat = fs.statSync(filePath)
  const d = stat.birthtime ?? stat.mtime
  return {
    y: String(d.getFullYear()),
    m: String(d.getMonth() + 1).padStart(2, "0"),
    d: String(d.getDate()).padStart(2, "0")
  }
}

/* =========================
   FILE OWNERS CONFIG
========================= */

const FILE_OWNERS = [
  {
    model: "request",
    fields: ["files"],
    bucket: "requests"
  },
  {
    model: "reserve",
    fields: ["files", "passengerList"],
    bucket: "reserves"
  },
  {
    model: "user",
    fields: ["images"],
    bucket: "users"
  },
  {
    model: "airlinePersonal",
    fields: ["images"],
    bucket: "airline_personal"
  },
  {
    model: "airline",
    fields: ["images"],
    bucket: "airlines"
  },
  {
    model: "hotel",
    fields: ["images", "gallery"],
    bucket: "hotels"
  },
  {
    model: "room",
    fields: ["images"],
    bucket: "rooms"
  },
  {
    model: "roomKind",
    fields: ["images"],
    bucket: "room_kinds"
  },
  {
    model: "additionalServices",
    fields: ["images"],
    bucket: "additional_services"
  },
  {
    model: "airlineContract",
    fields: ["files"],
    bucket: "contracts"
  },
  {
    model: "additionalAgreement",
    fields: ["files"],
    bucket: "contracts"
  },
  {
    model: "hotelContract",
    fields: ["files"],
    bucket: "contracts"
  },
  {
    model: "documentation",
    fields: ["files", "images"],
    bucket: "documentation"
  },
  {
    model: "patchNote",
    fields: ["files", "images"],
    bucket: "patch_notes"
  },
  {
    model: "transfer",
    fields: ["files"],
    bucket: "transfers"
  },
  {
    model: "driver",
    fields: [
      "documents.driverPhoto",
      "documents.carPhotos",
      "documents.stsPhoto",
      "documents.ptsPhoto",
      "documents.osagoPhoto",
      "documents.licensePhoto"
    ],
    bucket: "drivers"
  }
]

/* =========================
   RESOLVE OWNER
========================= */

const resolveFileOwner = async (oldRelPath) => {
  for (const cfg of FILE_OWNERS) {
    const model = prisma[cfg.model]
    if (!model) continue

    for (const field of cfg.fields) {
      const where = field.includes(".")
        ? { [field.split(".")[0]]: { has: oldRelPath } }
        : { [field]: { has: oldRelPath } }

      const record = await model.findFirst({
        where,
        select: { id: true }
      })

      if (record) {
        return { bucket: cfg.bucket, entityId: record.id }
      }
    }
  }

  return { bucket: "unknown", entityId: null }
}

/* =========================
   MIGRATION
========================= */

const migrate = async () => {
  ensureDir(MIGRATED_ROOT)

  const files = fs
    .readdirSync(UPLOADS_ROOT)
    .filter((f) => f !== "migrated")
    .filter((f) => fs.statSync(path.join(UPLOADS_ROOT, f)).isFile())

  logger.info(`[MIGRATE] Found ${files.length} files`)

  const bar = new cliProgress.SingleBar(
    { format: "MIGRATE |{bar}| {percentage}% | {value}/{total}" },
    cliProgress.Presets.shades_classic
  )

  bar.start(files.length, 0)

  for (const file of files) {
    try {
      const oldAbs = path.join(UPLOADS_ROOT, file)
      const oldRel = `/uploads/${file}`

      const { bucket, entityId } = await resolveFileOwner(oldRel)
      const { y, m, d } = getDateParts(oldAbs)

      const targetDir = path.join(
        MIGRATED_ROOT,
        bucket,
        entityId ?? "unknown",
        y,
        m,
        d
      )

      ensureDir(targetDir)

      const newName = `${Date.now()}-${file}`
      const newAbs = path.join(targetDir, newName)
      const newRel =
        "/uploads/" + path.relative(UPLOADS_ROOT, newAbs).replace(/\\/g, "/")

      logger.info(`[MOVE] ${oldRel} → ${newRel}`)

      if (!DRY_RUN) fs.renameSync(oldAbs, newAbs)
    } catch (e) {
      logger.error(`[MIGRATE ERROR] ${file}`, e)
    } finally {
      bar.increment()
    }
  }

  bar.stop()
  await prisma.$disconnect()
}

migrate()
  .then(() => process.exit(0))
  .catch((e) => {
    logger.error(e)
    process.exit(1)
  })

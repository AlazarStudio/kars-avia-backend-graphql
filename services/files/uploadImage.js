import { existsSync, mkdirSync } from "fs"
import { promises as fsPromises } from "fs"
import path from "path"
import sharp from "sharp"
import { logger } from "../infra/logger.js"

/* =========================
   🧠 helpers
========================= */

const safeSlug = (name) =>
  String(name || "image")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-_.]/g, "")
    .replace(/-+/g, "-")
    .slice(0, 80)

const ensureDir = (dir) => {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

const streamToBuffer = (stream) =>
  new Promise((resolve, reject) => {
    const chunks = []
    stream.on("data", (c) => chunks.push(c))
    stream.on("error", reject)
    stream.on("end", () => resolve(Buffer.concat(chunks)))
  })

const buildUploadPath = ({ bucket, entityId }) => {
  const now = new Date()
  const y = String(now.getFullYear())
  const m = String(now.getMonth() + 1).padStart(2, "0")
  const d = String(now.getDate()).padStart(2, "0")

  const parts = ["uploads", bucket, y, m, d]
  if (entityId) parts.splice(2, 0, entityId)

  return parts
}

/* =========================
   🖼 uploadImage
========================= */

export const uploadImage = async (image, options = {}) => {
  const { bucket = "images", entityId = null, quality = 80 } = options

  const { createReadStream, filename } = await image
  const stream = createReadStream()

  const buffer = await streamToBuffer(stream)

  const name = safeSlug(path.parse(filename).name)
  const timestamp = Date.now()

  const relParts = buildUploadPath({ bucket, entityId })
  const absDir = path.join(process.cwd(), ...relParts)

  ensureDir(absDir)

  const finalName = `${timestamp}-${name}.webp`
  const absPath = path.join(absDir, finalName)

  await sharp(buffer).rotate().webp({ quality }).toFile(absPath)

  return "/" + path.posix.join(...relParts, finalName)
}

/* =========================
   🗑 deleteImage
========================= */

export const deleteImage = async (imagePath) => {
  const absolutePath = path.join(process.cwd(), imagePath)
  try {
    await fsPromises.unlink(absolutePath)
  } catch (error) {
    logger.error("[DELETE IMAGE ERROR]", error)
  }
}

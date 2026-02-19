import { createWriteStream, existsSync, mkdirSync } from "fs"
import { promises as fsPromises } from "fs"
import path from "path"
import { logger } from "../infra/logger.js"

/* =========================
   🧠 helpers
========================= */

const safeSlug = (name) =>
  String(name || "file")
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
   📁 uploadFiles
========================= */

export const uploadFiles = async (file, options = {}) => {
  const { bucket = "misc", entityId = null } = options

  const { createReadStream, filename } = await file
  const stream = createReadStream()

  const { name, ext } = path.parse(filename)
  const safeName = safeSlug(name)
  const timestamp = Date.now()

  const relParts = buildUploadPath({ bucket, entityId })
  const absDir = path.join(process.cwd(), ...relParts)

  ensureDir(absDir)

  const finalName = `${timestamp}-${safeName}${ext}`
  const absPath = path.join(absDir, finalName)

  return new Promise((resolve, reject) => {
    const out = createWriteStream(absPath)

    stream.pipe(out)

    out.on("finish", () => {
      // Возвращаем путь с префиксом /files/ для защищенного доступа
      const relativePath = path.posix.join(...relParts, finalName)
      const publicPath = "/files/" + relativePath
      resolve(publicPath)
    })

    out.on("error", (err) => {
      logger.error("[UPLOAD FILE ERROR]", err)
      reject(err)
    })
  })
}

/* =========================
   🗑 deleteFiles
========================= */

export const deleteFiles = async (filePath) => {
  const absolutePath = path.join(process.cwd(), filePath)
  try {
    await fsPromises.unlink(absolutePath)
  } catch (error) {
    logger.error("[DELETE FILE ERROR]", error)
  }
}

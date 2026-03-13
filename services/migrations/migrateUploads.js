/**
 * migrateUploads.js
 *
 * Безопасная миграция файлов из /uploads
 * в структурированные подкаталоги + обновление ссылок в БД + отчёт
 * 
 * Обновлено для работы с новой защищенной схемой доступа к файлам:
 * - Файлы перемещаются в структурированные каталоги uploads/bucket/entityId/YYYY/MM/DD/
 * - Пути в БД обновляются на новый формат (без префикса /files/, field resolvers добавят его автоматически)
 * - Поддерживается миграция файлов из uploads, reports, reserve_files
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
const REPORTS_ROOT = path.join(process.cwd(), "reports")
const RESERVE_FILES_ROOT = path.join(process.cwd(), "reserve_files")
const REPORT_ROOT = path.join(process.cwd(), "reports/upload-migration")

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

const buildTargetDir = ({ bucket, entityId, fileAbsPath, sourceRoot }) => {
  const { y, m, d } = getFileDateParts(fileAbsPath)

  // Используем правильную корневую директорию в зависимости от источника
  // Все файлы мигрируются в структуру uploads/bucket/entityId/YYYY/MM/DD/
  // независимо от исходной директории (reports, reserve_files тоже идут в uploads)
  const rootDir = UPLOADS_ROOT
  
  // Структура: uploads/bucket/entityId/YYYY/MM/DD/ или uploads/bucket/YYYY/MM/DD/
  const parts = [rootDir, bucket]
  if (entityId) parts.push(entityId)
  parts.push(y, m, d)

  return path.join(...parts)
}

const normalizeUploadPath = (value) => {
  if (!value) return value
  const normalized = value.replace(/\\/g, "/")
  
  // Убираем префикс /files/ если есть (для обратной совместимости)
  let cleaned = normalized.replace(/^\/files\//, "")
  
  // Ищем путь к файлу в различных корневых директориях
  let idx = cleaned.indexOf("/uploads/")
  if (idx === -1) idx = cleaned.indexOf("uploads/")
  if (idx === -1) {
    idx = cleaned.indexOf("/reports/")
    if (idx === -1) idx = cleaned.indexOf("reports/")
  }
  if (idx === -1) {
    idx = cleaned.indexOf("/reserve_files/")
    if (idx === -1) idx = cleaned.indexOf("reserve_files/")
  }
  
  if (idx === -1) return cleaned
  
  let sub = cleaned.slice(idx)
  if (!sub.startsWith("/")) sub = `/${sub}`
  return sub
}

const buildOldVariants = (oldPath) => {
  const normalized = normalizeUploadPath(oldPath) || oldPath
  const noLeading = normalized?.replace(/^\/+/, "")
  return Array.from(new Set([oldPath, normalized, noLeading])).filter(Boolean)
}

const replaceInArray = (arr, oldVariants, newPath) =>
  arr?.map((p) => {
    if (!p) return p
    
    // Нормализуем текущий путь
    const normalizedP = normalizeUploadPath(p)
    
    for (const oldPath of oldVariants) {
      const normalizedOld = normalizeUploadPath(oldPath)
      
      // Точное совпадение
      if (p === oldPath || normalizedP === normalizedOld) {
        return newPath
      }
      
      // Частичное совпадение (путь содержит старый путь)
      if (p.includes(oldPath) || normalizedP.includes(normalizedOld)) {
        return p.replace(oldPath, newPath).replace(`/files${normalizedOld}`, newPath)
      }
    }
    return p
  })

/* =========================
   🔍 FILE CLASSIFICATION
========================= */

const resolveFileOwner = async (oldRelPath) => {
  // Нормализуем путь для поиска (убираем /files/ если есть)
  const normalizedPath = normalizeUploadPath(oldRelPath)
  
  // Создаем варианты пути для поиска (с /files/ и без)
  const searchVariants = [
    oldRelPath,
    normalizedPath,
    `/files${normalizedPath}`,
    normalizedPath.replace(/^\//, "")
  ]

  // Ищем в requests
  for (const variant of searchVariants) {
    const request = await prisma.request.findFirst({
      where: { files: { has: variant } },
      select: { id: true }
    })
    if (request) return { bucket: "requests", entityId: request.id }
  }

  // Ищем в reserves
  for (const variant of searchVariants) {
    const reserve = await prisma.reserve.findFirst({
      where: { files: { has: variant } },
      select: { id: true }
    })
    if (reserve) return { bucket: "reserves", entityId: reserve.id }
    
    // Также проверяем passengerList
    const reserveWithList = await prisma.reserve.findFirst({
      where: { passengerList: { has: variant } },
      select: { id: true }
    })
    if (reserveWithList) return { bucket: "reserves", entityId: reserveWithList.id }
  }

  // Ищем в users
  for (const variant of searchVariants) {
    const user = await prisma.user.findFirst({
      where: { images: { has: variant } },
      select: { id: true }
    })
    if (user) return { bucket: "users", entityId: user.id }
  }

  // Ищем в airlinePersonal
  for (const variant of searchVariants) {
    const personal = await prisma.airlinePersonal.findFirst({
      where: { images: { has: variant } },
      select: { id: true }
    })
    if (personal) return { bucket: "airline-personal", entityId: personal.id }
  }

  // Ищем в contracts
  for (const variant of searchVariants) {
    const airlineContract = await prisma.airlineContract.findFirst({
      where: { files: { has: variant } },
      select: { id: true }
    })
    if (airlineContract) return { bucket: "contracts", entityId: airlineContract.id }
    
    const hotelContract = await prisma.hotelContract.findFirst({
      where: { files: { has: variant } },
      select: { id: true }
    })
    if (hotelContract) return { bucket: "contracts", entityId: hotelContract.id }
    
    const orgContract = await prisma.organizationContract.findFirst({
      where: { files: { has: variant } },
      select: { id: true }
    })
    if (orgContract) return { bucket: "contracts", entityId: orgContract.id }
  }

  return { bucket: "misc", entityId: null }
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
  { model: "organizationContract", fields: ["files"] },
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
        const oldVariants = buildOldVariants(item.old)
        const records = await model.findMany({
          where: { [field]: { hasSome: oldVariants } },
          select: { id: true, [field]: true }
        })

        for (const rec of records) {
          const updatedField = replaceInArray(rec[field], oldVariants, item.new)
          if (
            !updatedField ||
            JSON.stringify(updatedField) === JSON.stringify(rec[field])
          )
            continue

          await model.update({
            where: { id: rec.id },
            data: {
              [field]: updatedField
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

/**
 * Определяет корневую директорию и относительный путь по полному пути файла
 */
const getSourceInfo = (filePath) => {
  if (filePath.startsWith(UPLOADS_ROOT)) {
    return {
      root: UPLOADS_ROOT,
      rootName: "uploads",
      relative: path.relative(UPLOADS_ROOT, filePath).replace(/\\/g, "/")
    }
  }
  if (filePath.startsWith(REPORTS_ROOT)) {
    return {
      root: REPORTS_ROOT,
      rootName: "reports",
      relative: path.relative(REPORTS_ROOT, filePath).replace(/\\/g, "/")
    }
  }
  if (filePath.startsWith(RESERVE_FILES_ROOT)) {
    return {
      root: RESERVE_FILES_ROOT,
      rootName: "reserve_files",
      relative: path.relative(RESERVE_FILES_ROOT, filePath).replace(/\\/g, "/")
    }
  }
  // По умолчанию считаем uploads
  return {
    root: UPLOADS_ROOT,
    rootName: "uploads",
    relative: path.relative(UPLOADS_ROOT, filePath).replace(/\\/g, "/")
  }
}

const migrate = async () => {
  ensureDir(REPORT_ROOT)

  // Собираем файлы из всех корневых директорий
  const filesToMigrate = []

  // Файлы из uploads (только верхнего уровня, не в подкаталогах)
  if (fs.existsSync(UPLOADS_ROOT)) {
    const uploadsFiles = fs
      .readdirSync(UPLOADS_ROOT)
      .filter((f) => f !== "migrated" && f !== "requests" && f !== "reserves" && f !== "users" && f !== "misc" && f !== "images" && f !== "airline-personal" && f !== "contracts")
      .filter((f) => isTopLevelFile(f))
      .map((f) => ({
        file: f,
        absPath: path.join(UPLOADS_ROOT, f),
        sourceRoot: UPLOADS_ROOT
      }))
    filesToMigrate.push(...uploadsFiles)
  }

  logger.info(`[MIGRATE] Found ${filesToMigrate.length} files to migrate`)

  if (filesToMigrate.length === 0) {
    logger.info("[MIGRATE] No files to migrate")
    await prisma.$disconnect()
    return
  }

  const bar = new cliProgress.SingleBar(
    {
      format: "MIGRATING |{bar}| {percentage}% | {value}/{total}",
      hideCursor: true
    },
    cliProgress.Presets.shades_classic
  )

  bar.start(filesToMigrate.length, 0)

  for (const fileInfo of filesToMigrate) {
    try {
      const { file, absPath, sourceRoot } = fileInfo
      const sourceInfo = getSourceInfo(absPath)
      
      // Старый относительный путь (для поиска в БД)
      const oldRel = `/${sourceInfo.rootName}/${sourceInfo.relative}`
      
      // Определяем владельца файла
      const { bucket, entityId } = await resolveFileOwner(oldRel)
      
      // Определяем целевую директорию
      const targetDir = buildTargetDir({
        bucket,
        entityId,
        fileAbsPath: absPath,
        sourceRoot: sourceRoot || UPLOADS_ROOT
      })

      ensureDir(targetDir)

      // Новое имя файла с timestamp
      const timestamp = Date.now()
      const fileExt = path.extname(file)
      const fileName = path.basename(file, fileExt)
      const safeFileName = fileName.replace(/[^a-z0-9\-_.]/gi, "").slice(0, 80)
      const newName = `${timestamp}-${safeFileName}${fileExt}`
      const newAbs = path.join(targetDir, newName)
      
      // Новый относительный путь (без префикса /files/, field resolvers добавят его автоматически)
      // Все файлы мигрируются в структуру uploads/bucket/...
      const newRel = "/uploads/" + path.relative(UPLOADS_ROOT, newAbs).replace(/\\/g, "/")

      logger.info(`[MOVE] ${oldRel} → ${newRel}`)

      if (!DRY_RUN) {
        // Проверяем, что целевой файл не существует
        if (fs.existsSync(newAbs)) {
          logger.warn(`[SKIP] Target file already exists: ${newAbs}`)
          migrationMap.push({
            old: oldRel,
            new: newRel,
            bucket,
            entityId,
            status: "skipped",
            reason: "target_exists"
          })
          continue
        }
        
        fs.renameSync(absPath, newAbs)
      }

      migrationMap.push({
        old: oldRel,
        new: newRel,
        bucket,
        entityId,
        sourceRoot: sourceInfo.rootName,
        status: DRY_RUN ? "dry-run" : "moved"
      })
    } catch (e) {
      logger.error(`[MIGRATE ERROR] ${fileInfo.file}`, e)
      migrationMap.push({
        old: fileInfo.file,
        status: "error",
        error: e.message,
        stack: e.stack
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
    `migration-${new Date().toISOString().slice(0, 10)}-${Date.now()}.json`
  )

  ensureDir(REPORT_ROOT)
  fs.writeFileSync(reportPath, JSON.stringify(migrationMap, null, 2))
  logger.info(`[REPORT] Saved: ${reportPath}`)

  // Статистика
  const stats = {
    total: migrationMap.length,
    moved: migrationMap.filter((m) => m.status === "moved").length,
    dryRun: migrationMap.filter((m) => m.status === "dry-run").length,
    errors: migrationMap.filter((m) => m.status === "error").length,
    skipped: migrationMap.filter((m) => m.status === "skipped").length
  }
  
  logger.info(`[STATS] Total: ${stats.total}, Moved: ${stats.moved}, Errors: ${stats.errors}, Skipped: ${stats.skipped}`)

  /* =========================
     🔄 UPDATE DB
  ========================= */

  if (!DRY_RUN && stats.moved > 0) {
    logger.info("[DB] Starting database links update...")
    await updateDatabaseLinks()
    logger.info("[DB] Database links update completed")
  } else if (DRY_RUN) {
    logger.info("[DB] DRY RUN mode - skipping database update")
  } else {
    logger.info("[DB] No files moved - skipping database update")
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

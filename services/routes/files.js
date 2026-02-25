import express from "express"
import path from "path"
import fs from "fs"
import { buildAuthContext } from "../../middlewares/authContext.js"
import { checkFileAccess } from "../files/checkFileAccess.js"
import { logger } from "../infra/logger.js"

const router = express.Router()

const UPLOADS_ROOT = path.join(process.cwd(), "uploads")
const REPORTS_ROOT = path.join(process.cwd(), "reports")
const RESERVE_FILES_ROOT = path.join(process.cwd(), "reserve_files")

/**
 * Определяет корневую директорию по пути файла
 */
function getRootDirectory(filePath) {
  const normalizedPath = filePath.replace(/^\/+/, "").replace(/\\/g, "/")
  const parts = normalizedPath.split("/")
  
  if (parts[0] === "uploads") {
    return UPLOADS_ROOT
  }
  if (parts[0] === "reports") {
    return REPORTS_ROOT
  }
  if (parts[0] === "reserve_files") {
    return RESERVE_FILES_ROOT
  }
  
  // По умолчанию используем uploads
  return UPLOADS_ROOT
}

/**
 * Защищенный роут для получения файлов
 * Требует JWT токен и проверяет права доступа
 * 
 * Поддерживает два формата URL:
 * - /files/uploads/... (новый формат)
 * - /files/reports/...
 * - /files/reserve_files/...
 */
router.get("/*", async (req, res) => {
  try {
    // <img src> и подобные browser-запросы обычно не умеют отправлять Authorization header.
    // Поэтому поддерживаем fallback через query-параметр ?token=<jwt>.
    const queryToken =
      typeof req.query.token === "string" ? req.query.token.trim() : null
    const authHeader = req.headers.authorization || (queryToken ? `Bearer ${queryToken}` : null)
    const context = await buildAuthContext(authHeader)

    if (!context.subject) {
      return res.status(401).json({ 
        error: "Unauthorized",
        message:
          "Authentication required. Provide a valid JWT token in Authorization header or ?token query parameter."
      })
    }

    // путь из URL (например: "uploads/requests/123/2024/01/15/file.png")
    let relativePath = req.params[0]
    
    // Убираем префикс /files/ если он есть (для обратной совместимости)
    relativePath = relativePath.replace(/^files\//, "")
    
    // Определяем корневую директорию
    const rootDir = getRootDirectory(relativePath)
    // Убираем префикс типа "uploads/", "reports/" или "reserve_files/" из пути для построения абсолютного пути
    const pathWithoutPrefix = relativePath.replace(/^(uploads|reports|reserve_files)\//, "")
    const absolutePath = path.join(rootDir, pathWithoutPrefix)

    // Защита от path traversal (../..)
    if (!absolutePath.startsWith(rootDir)) {
      logger.warn(`[FILE ACCESS] Path traversal attempt: ${relativePath}`)
      return res.status(403).json({ error: "Forbidden" })
    }

    // Проверяем существование файла
    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({ error: "File not found" })
    }

    // Проверяем права доступа к файлу
    const hasAccess = await checkFileAccess(context, relativePath)
    
    if (!hasAccess) {
      logger.warn(
        `[FILE ACCESS] Access denied for user ${context.subject.id} to file ${relativePath}`
      )
      return res.status(403).json({ error: "Access denied" })
    }

    // Определяем Content-Type на основе расширения файла
    const ext = path.extname(absolutePath).toLowerCase()
    const contentTypes = {
      ".pdf": "application/pdf",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ".xls": "application/vnd.ms-excel",
      ".doc": "application/msword",
      ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ".txt": "text/plain",
      ".csv": "text/csv"
    }
    
    const contentType = contentTypes[ext] || "application/octet-stream"
    res.setHeader("Content-Type", contentType)
    res.setHeader("Content-Disposition", "inline")
    // Не даем браузеру/прокси кешировать защищенные файлы.
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private")
    res.setHeader("Pragma", "no-cache")
    res.setHeader("Expires", "0")
    
    // Отправляем файл
    res.sendFile(absolutePath)
  } catch (e) {
    logger.error("[FILE ACCESS] Error serving file", e)
    if (e.message === "Token expired" || e.message === "Invalid token") {
      return res.status(401).json({ error: e.message })
    }
    return res.status(500).json({ error: "Internal server error" })
  }
})

export default router

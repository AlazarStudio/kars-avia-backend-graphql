import { logger } from "./logger.js"

/** Парсинг ALLOWED_ORIGINS (JSON-массив строк). При ошибке или пустом значении — поведение cors по умолчанию. */
export function getCorsOptions() {
  const raw = process.env.ALLOWED_ORIGINS?.trim()
  if (!raw) return {}

  try {
    const origins = JSON.parse(raw)
    if (Array.isArray(origins) && origins.length > 0) {
      return { origin: origins }
    }
  } catch {
    logger.warn("[CORS] ALLOWED_ORIGINS is not valid JSON, using default cors behavior")
  }

  return {}
}

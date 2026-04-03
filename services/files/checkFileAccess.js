import { prisma } from "../../prisma.js"
import { logger } from "../infra/logger.js"

function normalizeRelativePath(filePath) {
  let p = filePath.replace(/^\/+/, "").replace(/\\/g, "/")
  if (p.startsWith("files/")) {
    p = p.replace(/^files\//, "")
  }
  return p
}

function isSuperadminOrDispatcherUser(user) {
  return Boolean(
    user && (user.role === "SUPERADMIN" || user.dispatcher === true)
  )
}

/**
 * Отчёты: SUPERADMIN, dispatcher (User), владелец по SavedReport (airline/hotel),
 * либо AIRLINE_PERSONAL своей авиакомпании для отчёта с тем же airlineId.
 */
async function checkReportFileAccess(context, normalizedPath) {
  const { subject, subjectType, user } = context
  const parts = normalizedPath.split("/").filter(Boolean)
  if (parts[0] !== "reports" || parts.length < 2) {
    return false
  }

  const filename = parts[parts.length - 1]

  const savedReport = await prisma.savedReport.findFirst({
    where: {
      OR: [{ name: filename }, { url: { endsWith: filename } }]
    },
    select: { airlineId: true, hotelId: true }
  })

  if (subjectType === "USER" && user) {
    if (isSuperadminOrDispatcherUser(user)) {
      return true
    }
    if (!savedReport) {
      return false
    }
    if (
      user.airlineId &&
      savedReport.airlineId &&
      user.airlineId === savedReport.airlineId
    ) {
      return true
    }
    if (
      user.hotelId &&
      savedReport.hotelId &&
      user.hotelId === savedReport.hotelId
    ) {
      return true
    }
    return false
  }

  if (subjectType === "AIRLINE_PERSONAL" && subject?.id) {
    const personal = await prisma.airlinePersonal.findUnique({
      where: { id: subject.id },
      select: { airlineId: true }
    })
    if (!personal?.airlineId || !savedReport?.airlineId) {
      return false
    }
    return personal.airlineId === savedReport.airlineId
  }

  return false
}

/**
 * Проверяет доступ к файлу (HTTP /files/*).
 * uploads и reserve_files — любой авторизованный субъект.
 * reports — см. checkReportFileAccess.
 */
export async function checkFileAccess(context, filePath) {
  const { subject } = context

  if (!subject) {
    return false
  }

  const normalized = normalizeRelativePath(filePath)
  const first = normalized.split("/")[0]

  if (first === "reports") {
    return checkReportFileAccess(context, normalized)
  }

  if (first === "uploads" || first === "reserve_files") {
    return true
  }

  logger.warn(`[FILE ACCESS] Unknown path prefix: ${filePath}`)
  return false
}

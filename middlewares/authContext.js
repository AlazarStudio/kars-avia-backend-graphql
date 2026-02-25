import jwt from "jsonwebtoken"
import { prisma } from "../prisma.js"
import { logger } from "../services/infra/logger.js"

/**
 * Универсальный auth-контекст
 * Используется и для HTTP, и для WebSocket
 */
export async function buildAuthContext(authHeader) {
  if (!authHeader) {
    return emptyContext()
  }

  const rawToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : authHeader
  const token = typeof rawToken === "string" ? rawToken.trim() : ""

  if (!token) {
    throw new Error("Invalid token")
  }

  let decoded
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET)
  } catch (e) {
    if (e.name === "TokenExpiredError") {
      logger.warn("[AUTH] Token expired")
      throw new Error("Token expired")
    }
    logger.error("[AUTH] Invalid token", e)
    throw new Error("Invalid token")
  }

  // Жестко требуем exp в access-токене, чтобы не принимать "бессрочные" legacy JWT.
  if (!decoded?.exp || typeof decoded.exp !== "number") {
    logger.warn("[AUTH] Token has no exp claim")
    throw new Error("Invalid token")
  }

  // Дополнительная явная проверка срока годности (для предсказуемого поведения во всех окружениях).
  const nowInSeconds = Math.floor(Date.now() / 1000)
  if (decoded.exp <= nowInSeconds) {
    logger.warn("[AUTH] Token expired")
    throw new Error("Token expired")
  }

  const { subjectType, userId, driverId, airlinePersonalId } = decoded

  let user = null
  let driver = null
  let personal = null
  let subject = null

  if (subjectType === "USER" && userId) {
    user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        number: true,
        role: true,
        position: true,
        airlineId: true,
        airlineDepartmentId: true,
        dispatcherDepartmentId: true,
        hotelId: true,
        dispatcher: true,
        support: true
      }
    })
    subject = user
  }

  if (subjectType === "DRIVER" && driverId) {
    driver = await prisma.driver.findUnique({
      where: { id: driverId }
    })
    subject = driver
  }

  if (subjectType === "AIRLINE_PERSONAL" && airlinePersonalId) {
    personal = await prisma.airlinePersonal.findUnique({
      where: { id: airlinePersonalId }
    })
    subject = personal
  }

  if (!subject) {
    logger.warn("[AUTH] Subject not found")
    throw new Error("Invalid token")
  }

  return {
    authHeader,
    token,
    decoded,
    subjectType,
    subject,
    user,
    driver,
    personal
  }
}

function emptyContext() {
  return {
    authHeader: null,
    token: null,
    decoded: null,
    subjectType: null,
    subject: null,
    user: null,
    driver: null,
    personal: null
  }
}

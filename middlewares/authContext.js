import jwt from "jsonwebtoken"
import { prisma } from "../prisma.js"
import { logger } from "../services/infra/logger.js"

const EMPTY_TOKEN_VALUES = new Set(["", "null", "undefined"])

export const AUTH_ERROR_CODES = {
  MISSING_TOKEN: "MISSING_TOKEN",
  MALFORMED_TOKEN: "MALFORMED_TOKEN",
  TOKEN_EXPIRED: "TOKEN_EXPIRED",
  SUBJECT_NOT_FOUND: "SUBJECT_NOT_FOUND",
  MISSING_SESSION_TOKEN: "MISSING_SESSION_TOKEN",
  SESSION_MISMATCH: "SESSION_MISMATCH",
  EXTERNAL_SESSION_EXPIRED: "EXTERNAL_SESSION_EXPIRED",
  INVALID_TOKEN: "INVALID_TOKEN"
}

export class AuthError extends Error {
  constructor(code, message) {
    super(message)
    this.name = "AuthError"
    this.code = code
    this.status = 401
    this.isAuthError = true
  }
}

export function isAuthError(error) {
  return Boolean(error?.isAuthError)
}

function extractToken(authHeader) {
  if (typeof authHeader !== "string") {
    return ""
  }

  const headerValue = authHeader.trim()
  if (!headerValue) {
    return ""
  }

  const bearerMatch = headerValue.match(/^Bearer\s+(.+)$/i)
  const token = bearerMatch ? bearerMatch[1].trim() : headerValue

  if (!token || EMPTY_TOKEN_VALUES.has(token.toLowerCase())) {
    return ""
  }

  return token
}

function isLikelyJwt(token) {
  const parts = token.split(".")
  return parts.length === 3 && parts.every(Boolean)
}

function raiseAuthError(code, message, details = null, error = null) {
  logger.authError(`[AUTH] ${code}: ${message}`, error, details)
  throw new AuthError(code, message)
}

/**
 * Универсальный auth-контекст
 * Используется и для HTTP, и для WebSocket
 */
export async function buildAuthContext(authHeader) {
  if (!authHeader) {
    return emptyContext()
  }

  const token = extractToken(authHeader)

  if (!token) {
    raiseAuthError(AUTH_ERROR_CODES.MISSING_TOKEN, "Missing token")
  }

  if (!isLikelyJwt(token)) {
    raiseAuthError(AUTH_ERROR_CODES.MALFORMED_TOKEN, "Malformed token")
  }

  let decoded
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET)
  } catch (e) {
    if (e.name === "TokenExpiredError") {
      raiseAuthError(
        AUTH_ERROR_CODES.TOKEN_EXPIRED,
        "Token expired",
        { reason: e.message },
        null
      )
    }
    if (e.name === "JsonWebTokenError") {
      raiseAuthError(
        AUTH_ERROR_CODES.MALFORMED_TOKEN,
        "Malformed token",
        { reason: e.message },
        null
      )
    }
    raiseAuthError(
      AUTH_ERROR_CODES.INVALID_TOKEN,
      "Invalid token",
      { reason: e.message },
      e
    )
  }

  // Жестко требуем exp в access-токене, чтобы не принимать "бессрочные" legacy JWT.
  if (!decoded?.exp || typeof decoded.exp !== "number") {
    raiseAuthError(AUTH_ERROR_CODES.MALFORMED_TOKEN, "Token has no exp claim")
  }

  // Дополнительная явная проверка срока годности (для предсказуемого поведения во всех окружениях).
  const nowInSeconds = Math.floor(Date.now() / 1000)
  if (decoded.exp <= nowInSeconds) {
    raiseAuthError(AUTH_ERROR_CODES.TOKEN_EXPIRED, "Token expired")
  }

  const {
    subjectType,
    userId,
    driverId,
    airlinePersonalId,
    externalUserId
  } = decoded

  let user = null
  let driver = null
  let personal = null
  let externalUser = null
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
        support: true,
        refreshToken: true
      }
    })
    subject = user
  }

  if (subjectType === "DRIVER" && driverId) {
    driver = await prisma.driver.findUnique({
      where: { id: driverId },
      select: {
        id: true,
        refreshToken: true
      }
    })
    subject = driver
  }

  if (subjectType === "AIRLINE_PERSONAL" && airlinePersonalId) {
    personal = await prisma.airlinePersonal.findUnique({
      where: { id: airlinePersonalId },
      select: {
        id: true,
        refreshToken: true
      }
    })
    subject = personal
  }

  if (subjectType === "EXTERNAL_USER" && externalUserId) {
    externalUser = await prisma.externalUser.findUnique({
      where: { id: externalUserId },
      select: {
        id: true,
        email: true,
        name: true,
        scope: true,
        hotelId: true,
        driverId: true,
        active: true,
        refreshToken: true,
        sessionExpiresAt: true
      }
    })
    subject = externalUser
  }

  if (!subject) {
    raiseAuthError(AUTH_ERROR_CODES.SUBJECT_NOT_FOUND, "Subject not found")
  }

  // Проверка актуальности сессии:
  // при новом логине refreshToken в БД меняется, старые JWT становятся невалидными.
  const sessionToken = decoded?.sessionToken
  if (!sessionToken || typeof sessionToken !== "string") {
    raiseAuthError(
      AUTH_ERROR_CODES.MISSING_SESSION_TOKEN,
      "Token has no sessionToken"
    )
  }
  if (!subject.refreshToken || subject.refreshToken !== sessionToken) {
    raiseAuthError(
      AUTH_ERROR_CODES.SESSION_MISMATCH,
      "Session token does not match active session"
    )
  }

  if (
    subjectType === "EXTERNAL_USER" &&
    (!subject.active ||
      !subject.sessionExpiresAt ||
      new Date(subject.sessionExpiresAt).getTime() <= Date.now())
  ) {
    raiseAuthError(
      AUTH_ERROR_CODES.EXTERNAL_SESSION_EXPIRED,
      "External session expired or inactive"
    )
  }

  return {
    authHeader,
    token,
    decoded,
    subjectType,
    subject,
    user,
    driver,
    personal,
    externalUser
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
    personal: null,
    externalUser: null
  }
}

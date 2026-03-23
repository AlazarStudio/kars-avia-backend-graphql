import crypto from "crypto"

export const EXTERNAL_MAGIC_LINK_TTL_MS = 48 * 60 * 60 * 1000
export const EXTERNAL_SESSION_TTL_MS = 48 * 60 * 60 * 1000
export const EXTERNAL_MAGIC_LINK_MIN_REQUEST_INTERVAL_MS = 60 * 1000
export const EXTERNAL_MAGIC_LINK_REQUEST_WINDOW_MS = 60 * 60 * 1000
export const EXTERNAL_MAGIC_LINK_MAX_REQUESTS_PER_HOUR = 32

export const normalizeEmail = (email = "") => email.trim().toLowerCase()

export const hashMagicLinkToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex")

export const createMagicLinkTokenPair = () => {
  const rawToken = crypto.randomBytes(32).toString("hex")
  return {
    rawToken,
    tokenHash: hashMagicLinkToken(rawToken)
  }
}

export const evaluateMagicLinkRequestLimits = ({
  now,
  latestToken,
  issuedInLastHour
}) => {
  if (latestToken?.createdAt) {
    const sinceLastIssuedMs = now.getTime() - latestToken.createdAt.getTime()
    if (sinceLastIssuedMs < EXTERNAL_MAGIC_LINK_MIN_REQUEST_INTERVAL_MS) {
      return { allowed: false, reason: "TOO_FREQUENT" }
    }
  }

  if (issuedInLastHour >= EXTERNAL_MAGIC_LINK_MAX_REQUESTS_PER_HOUR) {
    return { allowed: false, reason: "TOO_MANY_PER_HOUR" }
  }

  return { allowed: true, reason: null }
}

export const validateMagicLinkRecord = ({ record, rawToken, now = new Date() }) => {
  if (!record || !rawToken) {
    return { valid: false, reason: "NOT_FOUND" }
  }

  const tokenHash = hashMagicLinkToken(rawToken)
  if (tokenHash !== record.tokenHash) {
    return { valid: false, reason: "TOKEN_MISMATCH" }
  }

  if (record.usedAt) {
    return { valid: false, reason: "ALREADY_USED" }
  }

  if (record.expiresAt.getTime() <= now.getTime()) {
    return { valid: false, reason: "EXPIRED" }
  }

  return { valid: true, reason: null }
}

export const nextSessionExpiry = (currentSessionExpiresAt, now = new Date()) => {
  const base = currentSessionExpiresAt && currentSessionExpiresAt > now
    ? currentSessionExpiresAt
    : now
  return new Date(base.getTime() + EXTERNAL_SESSION_TTL_MS)
}

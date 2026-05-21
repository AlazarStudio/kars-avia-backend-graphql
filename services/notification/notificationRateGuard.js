const EMAIL_DEDUP_TTL_MS = 90_000
const emailSentAt = new Map()

function normalizePart(value, fallback = "unknown") {
  if (value === undefined || value === null || value === "") return fallback
  return String(value)
}

export function buildNotificationRateKey({
  channel,
  action,
  entityType,
  entityId,
  recipientId
}) {
  return [
    normalizePart(channel),
    normalizePart(action),
    normalizePart(entityType),
    normalizePart(entityId),
    normalizePart(recipientId, "all")
  ].join(":")
}

function pruneExpiredEmailEntries(now) {
  for (const [key, sentAt] of emailSentAt) {
    if (now - sentAt >= EMAIL_DEDUP_TTL_MS) {
      emailSentAt.delete(key)
    }
  }
}

export function shouldSendNotification({
  channel,
  action,
  entityType,
  entityId,
  recipientId
}) {
  const key = buildNotificationRateKey({
    channel,
    action,
    entityType,
    entityId,
    recipientId
  })

  if (channel !== "email") {
    return { allowed: true, key, retryAfterMs: 0 }
  }

  const now = Date.now()
  pruneExpiredEmailEntries(now)

  const lastSentAt = emailSentAt.get(key)
  if (lastSentAt != null && now - lastSentAt < EMAIL_DEDUP_TTL_MS) {
    return {
      allowed: false,
      key,
      retryAfterMs: EMAIL_DEDUP_TTL_MS - (now - lastSentAt)
    }
  }

  emailSentAt.set(key, now)
  return { allowed: true, key, retryAfterMs: 0 }
}

export function resetNotificationRateGuard() {
  emailSentAt.clear()
}

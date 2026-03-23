const DEFAULT_CHANNEL_WINDOWS_MS = {
  site: 15 * 1000,
  email: 60 * 1000,
  push: 20 * 1000
}

const MAX_GUARD_ENTRIES = 5000
const notificationWindowByKey = new Map()

function normalizePart(value, fallback = "unknown") {
  if (value === undefined || value === null || value === "") return fallback
  return String(value)
}

function cleanupExpiredEntries(nowMs = Date.now()) {
  for (const [key, expiresAt] of notificationWindowByKey.entries()) {
    if (expiresAt <= nowMs) {
      notificationWindowByKey.delete(key)
    }
  }
}

function trimGuardIfNeeded() {
  if (notificationWindowByKey.size <= MAX_GUARD_ENTRIES) return

  const sortedEntries = [...notificationWindowByKey.entries()].sort(
    (a, b) => a[1] - b[1]
  )
  const countToDelete = notificationWindowByKey.size - MAX_GUARD_ENTRIES
  for (let i = 0; i < countToDelete; i += 1) {
    notificationWindowByKey.delete(sortedEntries[i][0])
  }
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

export function shouldSendNotification({
  channel,
  action,
  entityType,
  entityId,
  recipientId,
  windowMs,
  nowMs = Date.now()
}) {
  cleanupExpiredEntries(nowMs)

  const effectiveWindowMs =
    typeof windowMs === "number" && windowMs > 0
      ? windowMs
      : DEFAULT_CHANNEL_WINDOWS_MS[channel] || DEFAULT_CHANNEL_WINDOWS_MS.site

  const key = buildNotificationRateKey({
    channel,
    action,
    entityType,
    entityId,
    recipientId
  })

  const existingExpiresAt = notificationWindowByKey.get(key)
  if (existingExpiresAt && existingExpiresAt > nowMs) {
    return {
      allowed: false,
      key,
      retryAfterMs: existingExpiresAt - nowMs
    }
  }

  notificationWindowByKey.set(key, nowMs + effectiveWindowMs)
  trimGuardIfNeeded()

  return { allowed: true, key, retryAfterMs: 0 }
}

export function resetNotificationRateGuard() {
  notificationWindowByKey.clear()
}

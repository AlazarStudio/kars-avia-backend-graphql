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
  return { allowed: true, key, retryAfterMs: 0 }
}

export function resetNotificationRateGuard() {}

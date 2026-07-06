export function computeIsVisible({ enabled, endsAt }, now = new Date()) {
  if (!enabled) return false
  if (!endsAt) return true
  return endsAt > now
}

export function toMaintenanceBannerResponse(record, now = new Date()) {
  const enabled = record?.enabled ?? false
  const message = record?.message ?? ""
  const endsAt = record?.endsAt ?? null

  return {
    enabled,
    message: message || null,
    endsAt,
    isVisible: computeIsVisible({ enabled, endsAt }, now)
  }
}

export function validateMaintenanceBannerInput({ enabled, message }) {
  if (!enabled) return
  const text = typeof message === "string" ? message.trim() : ""
  if (!text) {
    throw new Error("Текст плашки обязателен, когда она включена")
  }
}

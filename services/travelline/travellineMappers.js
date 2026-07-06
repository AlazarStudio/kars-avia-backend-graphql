// Чистые хелперы маппинга/форматирования данных TravelLine (тестируются node:test).

function toUtcMs(s) {
  if (!s) return null
  let str = String(s)
  if (!/([zZ]|[+-]\d{2}:?\d{2})$/.test(str)) str += "Z"
  const ms = Date.parse(str)
  return Number.isNaN(ms) ? null : ms
}

// Вычисляет смещение пояса "UTC+03:00" по паре local/utc одного и того же момента (№1, №2).
export function computeTzOffset(localISO, utcISO) {
  const l = toUtcMs(localISO)
  const u = toUtcMs(utcISO)
  if (l == null || u == null) return null
  let min = Math.round((l - u) / 60000)
  const sign = min >= 0 ? "+" : "-"
  min = Math.abs(min)
  const hh = String(Math.floor(min / 60)).padStart(2, "0")
  const mm = String(min % 60).padStart(2, "0")
  return `UTC${sign}${hh}:${mm}`
}

// Нормализует cancellationPolicy из ответа TravelLine. Возвращает null, если штрафа нет (№2).
// Принимает как сырой формат TL (penaltyAmount/freeCancellationDeadline*), так и уже
// нормализованный (amount/deadline) — чтобы переиспользоваться для alternativeBooking.
export function extractCancellationPolicy(cp, fallbackTz = null) {
  if (!cp) return null
  const amount = cp.penaltyAmount ?? cp.amount ?? null
  if (amount == null || !(amount > 0)) return null
  const deadlineLocal = cp.freeCancellationDeadlineLocal ?? cp.deadline ?? null
  const deadlineUtc = cp.freeCancellationDeadlineUtc ?? cp.deadlineUtc ?? null
  let timezone = cp.timeZone ?? cp.timezone ?? fallbackTz ?? null
  if (!timezone && deadlineLocal && deadlineUtc) {
    timezone = computeTzOffset(deadlineLocal, deadlineUtc)
  }
  return {
    amount,
    deadline: deadlineLocal ?? deadlineUtc ?? "",
    deadlineUtc: deadlineUtc ?? null,
    timezone: timezone ?? null
  }
}

// Сопоставляет id категории номера (Search API) с названием из Content API (№3).
export function pickRoomTypeName(roomTypeId, contentRoomTypes, fallbackName) {
  if (Array.isArray(contentRoomTypes)) {
    const match = contentRoomTypes.find((rt) => String(rt.id) === String(roomTypeId))
    if (match?.name) return match.name
  }
  return fallbackName || roomTypeId || ""
}

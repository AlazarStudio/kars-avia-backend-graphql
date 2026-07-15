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

// Приводит часовой пояс к виду "UTC+03:00" (требование №1).
// Принимает IANA-имя ("Europe/Moscow"), числовое смещение ("+3", "+03:00", "3")
// или готовую строку "UTC+03:00"/"GMT+03:00". refDateISO нужен IANA для учёта
// летнего/зимнего времени. Возвращает null, если распознать не удалось.
export function normalizeTzOffset(tzRaw, refDateISO = null) {
  if (tzRaw == null) return null
  const s = String(tzRaw).trim()
  if (!s) return null

  // Готовое смещение: "UTC+03:00", "GMT+3", "+03:00", "+3", "3"
  const m = s.match(/^(?:UTC|GMT)?\s*([+-]?)(\d{1,2})(?::?(\d{2}))?$/i)
  if (m && /[+-]|^\d/.test(s)) {
    const sign = m[1] === "-" ? "-" : "+"
    const hh = String(parseInt(m[2], 10)).padStart(2, "0")
    const mm = (m[3] ?? "00").padStart(2, "0")
    return `UTC${sign}${hh}:${mm}`
  }

  // IANA-имя ("Europe/Moscow")
  try {
    const ref = refDateISO ? new Date(refDateISO) : new Date()
    if (!Number.isNaN(ref.getTime())) {
      const part = new Intl.DateTimeFormat("en-US", {
        timeZone: s,
        timeZoneName: "longOffset"
      })
        .formatToParts(ref)
        .find((p) => p.type === "timeZoneName")
      if (part?.value) {
        const norm = part.value.replace(/^GMT/, "UTC")
        if (/^UTC[+-]\d{2}:\d{2}$/.test(norm)) return norm
        if (norm === "UTC") return "UTC+00:00"
      }
    }
  } catch {
    // не валидное IANA-имя — вернём null ниже
  }
  return null
}

// Достаёт сырой часовой пояс из объекта property Content API (№1).
// TL отдаёт timeZone объектом вида { id: "Europe/Samara" }, поэтому
// разворачиваем .id, но поддерживаем и строковый вид на всякий случай.
export function extractPropertyTimeZone(p) {
  if (!p) return null
  const raw =
    p.timeZone ??
    p.timezone ??
    p.contactInfo?.timeZone ??
    p.contactInfo?.address?.timeZone ??
    p.address?.timeZone ??
    null
  if (raw == null) return null
  if (typeof raw === "object") return raw.id ?? raw.name ?? null
  return raw
}

// Сопоставляет id категории номера (Search API) с названием из Content API (№3).
export function pickRoomTypeName(roomTypeId, contentRoomTypes, fallbackName) {
  if (Array.isArray(contentRoomTypes)) {
    const match = contentRoomTypes.find((rt) => String(rt.id) === String(roomTypeId))
    if (match?.name) return match.name
  }
  return fallbackName || roomTypeId || ""
}

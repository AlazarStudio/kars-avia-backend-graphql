const collapse = (s) => String(s ?? "").replace(/\s+/g, " ").trim()

export function normalizeFields(raw = {}) {
  return {
    fullName: collapse(raw.fullName),
    flight: collapse(raw.flight).toUpperCase().replace(/\s+/g, ""),
    from: collapse(raw.from).toUpperCase(),
    to: collapse(raw.to).toUpperCase(),
    carrier: collapse(raw.carrier).toUpperCase(),
    seat: collapse(raw.seat).toUpperCase(),
    date: collapse(raw.date),
    // Формат оставляем клиенту: он приводит номер к своей маске. Здесь только
    // отбрасываем разделители, чтобы не гадать над «+7 (918) …» против «8918…».
    phone: collapse(raw.phone).replace(/\D/g, "")
  }
}

const FLIGHT_RE = /^[A-Z0-9]{2}\d{2,4}$/

export function computeConfidence(fields = {}) {
  let score = 0
  const name = String(fields.fullName ?? "").trim()
  const words = name.split(/\s+/).filter(Boolean)
  if (words.length >= 2 || name.length >= 3) score += 0.6
  if (FLIGHT_RE.test(String(fields.flight ?? ""))) score += 0.4
  return Math.min(1, score)
}

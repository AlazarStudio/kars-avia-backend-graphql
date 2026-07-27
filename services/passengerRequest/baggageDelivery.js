// Чистые функции услуги «Доставка багажа» ФАП.
// Живут отдельно от резолвера, чтобы тестироваться без БД и GraphQL.

// Номера багажных бирок: тримим, выкидываем пустые и нестроки,
// схлопываем дубли без учёта регистра. Порядок ввода сохраняем.
export const normalizeBaggageTags = (tags) => {
  if (!Array.isArray(tags)) return []
  const seen = new Set()
  const out = []
  for (const raw of tags) {
    const value = typeof raw === "string" ? raw.trim() : ""
    if (!value) continue
    const key = value.toUpperCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(value)
  }
  return out
}

const has = (obj, key) => obj != null && Object.prototype.hasOwnProperty.call(obj, key)

// Собирает из патча ТОЛЬКО реально переданные поля.
// Отличаем «ключа нет» от «ключ есть, значение null»: иначе нельзя очистить
// сумму или дату доставки.
export const collectBaggageDriverPatch = (patch = {}) => {
  const applied = {}
  if (has(patch, "vehicleType")) {
    const value = typeof patch.vehicleType === "string" ? patch.vehicleType.trim() : ""
    applied.vehicleType = value || null
  }
  if (has(patch, "reportCost")) {
    const num = patch.reportCost == null ? null : Number(patch.reportCost)
    applied.reportCost = num == null || Number.isNaN(num) ? null : num
  }
  if (has(patch, "deliveryCompletedAt")) {
    const raw = patch.deliveryCompletedAt
    const date = raw == null ? null : new Date(raw)
    applied.deliveryCompletedAt =
      date && !Number.isNaN(date.getTime()) ? date : null
  }
  if (has(patch, "baggageTags")) {
    applied.baggageTags = normalizeBaggageTags(patch.baggageTags)
  }
  return applied
}

// Приводит массив водителей к виду, пригодному для записи в composite-тип.
// Prisma отдаёт скалярный список внутри composite как null (в отличие от списков
// на уровне модели, где работает коэрция в []), а обратно null в String[] не
// принимает — валидация payload падает. Поэтому любой массив водителей,
// прочитанный из БД, перед уходом в data прогоняем через этот хелпер.
// Остальные поля водителя не трогаем.
export const normalizeDriversBaggageTags = (drivers) => {
  if (!Array.isArray(drivers)) return []
  return drivers.map((driver) => ({
    ...driver,
    baggageTags: normalizeBaggageTags(driver?.baggageTags)
  }))
}

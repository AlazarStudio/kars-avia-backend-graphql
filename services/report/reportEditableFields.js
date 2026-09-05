// Поля строки черновика, которые вообще МОГУТ быть редактируемыми на фронте.
// Зеркалит EDITABLE_FIELDS фронта (src/Components/Blocks/ReportsV2/reportDraftRows.js) —
// списки обязаны меняться парой. Служит валидацией setMyReportEditableFields:
// в личную настройку нельзя записать ключ, которого редактор не знает, иначе
// опечатка в клиенте молча «включила» бы несуществующее поле.
export const REPORT_EDITABLE_FIELD_KEYS = [
  "personName",
  "arrival",
  "departure",
  "totalDays",
  "category",
  "roomName",
  "personPosition",
  "breakfastCount",
  "lunchCount",
  "dinnerCount",
  "totalMealCost",
  "pricePerDay"
]

/**
 * Нормализует входной список настройки: null/undefined — сброс к дефолту
 * (вернётся null), массив — фильтруется до известных ключей без дублей,
 * порядок канонический. Пустой массив легален: «всё только для чтения».
 */
export function normalizeReportEditableFields(fields) {
  if (fields == null) return null
  const requested = new Set(
    (Array.isArray(fields) ? fields : []).filter(
      (key) => typeof key === "string"
    )
  )
  return REPORT_EDITABLE_FIELD_KEYS.filter((key) => requested.has(key))
}

import { GraphQLError } from "graphql"

// Дата/время в строке отчёта — снимок для правки заезда/выезда, не живое поле
// гостя. Будущие даты допустимы (плановое проживание), в отличие от assertMoment.
export const reportRowDate = (value, label) => {
  if (value == null || value === "") return null
  const supported =
    value instanceof Date || typeof value === "string" || typeof value === "number"
  const date = supported ? new Date(value) : new Date(NaN)
  if (Number.isNaN(date.getTime())) {
    throw new GraphQLError(`Invalid ${label}`, {
      extensions: { code: "BAD_USER_INPUT" }
    })
  }
  return date.toISOString()
}

// Сравнение наборов строк отчёта по гостинице: изменились ли данные при сохранении.
// Обе стороны прошли через один и тот же маппер резолвера (фиксированный порядок ключей),
// а BSON сохраняет порядок полей документа — значит сериализация детерминирована.
// Ложное «изменилось» безопасно: оно лишь сбросит флаг отправки, то есть спрячет отчёт
// от авиакомпании. Обратной, «протекающей» ошибки эта функция дать не может.
export const reportRowsEqual = (a, b) =>
  JSON.stringify(a ?? []) === JSON.stringify(b ?? [])

const MONEY_KEYS = [
  "foodCost",
  "accommodationCost",
  "tariffName",
  "pricePerDay",
  "lunchboxPrice",
  "accommodationDiscount"
]

export const maskReportRowPrices = (rows) =>
  (Array.isArray(rows) ? rows : []).map((row) => {
    const next = { ...row }
    for (const key of MONEY_KEYS) next[key] = null
    return next
  })

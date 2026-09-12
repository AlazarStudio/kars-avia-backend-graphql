// Приведение скаляров ФАП к виду, пригодному для записи. Общий лист для
// доменных модулей (доставка багажа, факт поставки), чтобы одинаковые правила
// не жили копиями: «нечисловое/отрицательное → не задано», округление до сотых.

const blank = (value) =>
  value == null || (typeof value === "string" && !value.trim())

// Число ≥ 0 с округлением до сотых либо null. Отрицательное и нечисловое —
// «не задано», а не ошибка: минус у одного пассажира молча уменьшил бы сумму поездки.
export const toNonNegative2dp = (value) => {
  if (blank(value)) return null
  const num = Number(value)
  if (!Number.isFinite(num) || num < 0) return null
  return Math.round(num * 100) / 100
}

// Деньги: копейки. Километраж — то же правило (две цифры после запятой),
// собственного округления у него нет — алиас, чтобы читалось по смыслу.
export const toMoney = toNonNegative2dp
export const toKmOrNull = toNonNegative2dp

// Целое ≥ 0 либо null (количества).
export const toWholeCountOrNull = (value) => {
  if (blank(value)) return null
  const num = Number(value)
  if (!Number.isFinite(num) || num < 0 || !Number.isInteger(num)) return null
  return num
}

export const toTrimmedOrNull = (value) => {
  if (typeof value !== "string") return null
  return value.trim() || null
}

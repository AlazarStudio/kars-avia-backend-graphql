/**
 * Каноническая форма логина: trim + нижний регистр.
 * Используется при записи и при сравнении уникальности.
 */
export function normalizeUserLogin(login) {
  return String(login ?? "").trim().toLowerCase()
}

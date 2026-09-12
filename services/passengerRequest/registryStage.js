// Стадия реестра услуг ФАП. Зеркало фронтового fapRegistryStages.js.
//
// APPROVED — утверждён АК; RETURNED — отправлен, и последний комментарий АК
// позже этой отправки (отзыв); SUBMITTED — отправлен; DRAFT — не отправлен.
// «Отозвать отправку» + повторная отправка гасят RETURNED: комментарий остаётся
// историей, но стоит раньше новой submittedAt.

export const REGISTRY_STAGES = ["DRAFT", "SUBMITTED", "RETURNED", "APPROVED"]

const toTime = (value) => {
  if (!value) return null
  const t = new Date(value).getTime()
  return Number.isNaN(t) ? null : t
}

export function registryStage(registry) {
  if (registry?.airlineApprovedAt) return "APPROVED"
  const submitted = toTime(registry?.submittedAt)
  if (submitted == null) return "DRAFT"
  const commented = toTime(registry?.airlineCommentAt)
  if (commented != null && commented > submitted) return "RETURNED"
  return "SUBMITTED"
}

import { updateTimes } from "./utils.js"

/**
 * Пересчёт статуса услуги ФАП при изменении числа людей или плана.
 *
 * Правила:
 * - CANCELLED — не меняем.
 * - COMPLETED + добавили человека (nextCount > prevCount) → IN_PROGRESS (сброс finishedAt).
 * - COMPLETED + факт стал меньше плана (nextCount < planCount) → IN_PROGRESS
 *   (удаление ниже плана либо поднятие плана выше факта).
 * - COMPLETED в остальных случаях — не меняем.
 * - NEW/ACCEPTED при наличии людей → IN_PROGRESS.
 * - факт >= план → COMPLETED (автозавершение).
 *
 * @param {{status?: string, times?: object, plan?: {peopleCount?: number|null}}} prev — услуга до изменения
 * @param {number} prevCount — число людей до операции
 * @param {number} nextCount — число людей после операции
 * @returns {{status: string, times: object}}
 */
export const recomputeServiceStatus = (prev, prevCount, nextCount) => {
  const status = prev?.status ?? "NEW"
  const times = prev?.times || {}
  const planCount = prev?.plan?.peopleCount ?? null
  const added = nextCount > prevCount

  if (status === "CANCELLED") {
    return { status, times }
  }

  if (status === "COMPLETED") {
    const reopen = added || (planCount != null && nextCount < planCount)
    if (reopen) {
      return {
        status: "IN_PROGRESS",
        times: { ...updateTimes(times, "IN_PROGRESS"), finishedAt: null }
      }
    }
    return { status, times }
  }

  let nextStatus = status
  let nextTimes = times
  if ((nextStatus === "NEW" || nextStatus === "ACCEPTED") && nextCount >= 1) {
    nextStatus = "IN_PROGRESS"
    nextTimes = updateTimes(nextTimes, "IN_PROGRESS")
  }
  if (planCount != null && nextCount >= planCount) {
    nextStatus = "COMPLETED"
    nextTimes = updateTimes(nextTimes, "COMPLETED")
  }
  return { status: nextStatus, times: nextTimes }
}

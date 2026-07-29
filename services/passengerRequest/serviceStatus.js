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

// Факт поездки: поимённый список ИЛИ введённое число «перевезено N» — что больше.
// Именно max, а не сумма: водитель сканирует тех же людей, которых диспетчер уже
// учёл числом — сложение давало бы двойной счёт.
export const driverFactCount = (driver) => {
  const listed = Array.isArray(driver?.people) ? driver.people.length : 0
  const counted = Number.isInteger(driver?.transportedCount)
    ? Math.max(driver.transportedCount, 0)
    : 0
  return Math.max(listed, counted)
}

// Факт услуги = сумма фактов поездок. Для багажа transportedCount не заполняется,
// так что результат совпадает с прежним Σ people.length.
export const transferFactCount = (drivers) =>
  (Array.isArray(drivers) ? drivers : []).reduce(
    (sum, d) => sum + driverFactCount(d),
    0
  )

// Решение статуса при числовой правке «перевезено» (updatePassengerRequestDriver):
// правка, не снизившая факт, статус не трогает вовсе — в т.ч. когда факт и так ниже
// плана (досрочное завершение не реоткрывается косметической правкой числа).
// Снижение факта идёт через общий recomputeServiceStatus — реоткрытие только при
// падении ниже плана. null = статус/times не менять.
export const resolveDriverCountStatus = (service, factBefore, factAfter) => {
  if (service?.status === "COMPLETED" && factAfter >= factBefore) return null
  return recomputeServiceStatus(service, factBefore, factAfter)
}

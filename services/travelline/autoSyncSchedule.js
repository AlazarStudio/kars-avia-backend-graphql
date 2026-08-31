// Расписание авто-синхронизации каталога TravelLine.
// Вынесено отдельно от сервиса, чтобы решение "пора / не пора" было
// чистой функцией и покрывалось юнит-тестами без похода в TL и в БД.

export const DEFAULT_AUTO_SYNC_HOURS = 24
export const MIN_AUTO_SYNC_HOURS = 1
export const MAX_AUTO_SYNC_HOURS = 168

export const normalizeAutoSyncHours = (value) => {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_AUTO_SYNC_HOURS
  return Math.max(MIN_AUTO_SYNC_HOURS, Math.min(MAX_AUTO_SYNC_HOURS, n))
}

// toleranceMs — допуск на шаг тика планировщика. Без него интервал N ч
// округляется вверх до следующего тика, а так как lastSyncAt пишется по
// ЗАВЕРШЕНИИ синхронизации, задержка ещё и накапливается от цикла к циклу.
export const isAutoSyncDue = ({
  lastSyncAt,
  autoSyncHours,
  now = Date.now(),
  toleranceMs = 0
}) => {
  if (!lastSyncAt) return false
  const last = new Date(lastSyncAt).getTime()
  if (!Number.isFinite(last)) return false
  const dueAfterMs = normalizeAutoSyncHours(autoSyncHours) * 60 * 60 * 1000
  return now - last >= dueAfterMs - Math.max(0, Number(toleranceMs) || 0)
}

// cron: авто-синхронизация каталога TravelLine.
// Раньше тик жил прямо в колбэке httpServer.listen внутри server2.js —
// из-за этого его не было в server.js (HTTPS/production) и он не
// останавливался при graceful shutdown.

import { logger } from "../infra/logger.js"
import { travellineService } from "../travelline/travellineService.js"

// Тик заметно мельче минимального интервала (1 ч): иначе настройка
// autoSyncHours округляется вверх до следующего тика.
const DEFAULT_TICK_MS = 5 * 60 * 1000
const MIN_TICK_MS = 10_000

let intervalId = null

const getTickMs = () => {
  const raw = Number(process.env.TRAVELLINE_SYNC_TICK_MS)
  if (!Number.isFinite(raw) || raw < MIN_TICK_MS) return DEFAULT_TICK_MS
  return raw
}

const runTick = async (tickMs) => {
  try {
    await travellineService.maybeAutoSync({ toleranceMs: tickMs / 2 })
  } catch (e) {
    logger.error("[CRON] TravelLine auto-sync tick failed", e)
  }
}

export const startTravellineSyncJob = () => {
  if (intervalId) return

  const tickMs = getTickMs()
  logger.info(`[CRON] TravelLine auto-sync job started (tick ${tickMs}ms)`)

  void runTick(tickMs)
  intervalId = setInterval(() => {
    void runTick(tickMs)
  }, tickMs)
}

export const stopTravellineSyncJob = () => {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
    logger.info("[CRON] TravelLine auto-sync job stopped")
  }
}

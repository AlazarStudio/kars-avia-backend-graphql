import { logger } from "./logger.js"

/**
 * Простой пошаговый таймер для диагностики медленных mutation.
 * Выключить: PERF_UPDATE_REQUEST=0
 * Явно включить: PERF_UPDATE_REQUEST=1 (или любой NODE_ENV кроме production без =0)
 */
export function isUpdateRequestPerfEnabled() {
  if (process.env.PERF_UPDATE_REQUEST === "0") return false
  if (process.env.PERF_UPDATE_REQUEST === "1") return true
  return process.env.NODE_ENV !== "production"
}

// Пишем и в stdout (терминал nodemon/pm2), и в logs/info — иначе шаги видно
// только у того, кто смотрит на консоль в момент запроса.
function emit(line) {
  console.log(line)
  logger.info(line)
}

export function createPerfTimer(label, { enabled = isUpdateRequestPerfEnabled() } = {}) {
  const t0 = Date.now()
  let last = t0
  const marks = []

  const step = (name, extra) => {
    if (!enabled) return 0
    const now = Date.now()
    const delta = now - last
    const total = now - t0
    marks.push({ name, deltaMs: delta, totalMs: total, ...(extra || {}) })
    const suffix =
      extra && Object.keys(extra).length
        ? ` ${JSON.stringify(extra)}`
        : ""
    emit(
      `[perf:${label}] +${delta}ms (total ${total}ms) — ${name}${suffix}`
    )
    last = now
    return delta
  }

  const done = (extra) => {
    if (!enabled) return marks
    const total = Date.now() - t0
    emit(
      `[perf:${label}] DONE ${total}ms${extra ? ` ${JSON.stringify(extra)}` : ""}`
    )
    return marks
  }

  return { step, done, marks, enabled }
}

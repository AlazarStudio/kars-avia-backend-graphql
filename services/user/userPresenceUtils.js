import { buildClosedSessionStats } from "./userActivity.js"

const DEFAULT_IDLE_TIMEOUT_MS = 10 * 60 * 1000

export function parsePositiveIntEnv(name, defaultValue) {
  const parsed = parseInt(process.env[name] ?? "", 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue
}

export function getIdleTimeoutMs() {
  return parsePositiveIntEnv("USER_IDLE_TIMEOUT_MS", DEFAULT_IDLE_TIMEOUT_MS)
}

export function getLastSeenDebounceMs() {
  return parsePositiveIntEnv("USER_LAST_SEEN_DEBOUNCE_MS", 60 * 1000)
}

export function getPresenceCleanupIntervalMs() {
  return parsePositiveIntEnv("PRESENCE_CLEANUP_INTERVAL_MS", 2 * 60 * 1000)
}

export function isLastSeenStale(
  lastSeen,
  now = new Date(),
  timeoutMs = getIdleTimeoutMs()
) {
  if (!lastSeen) return true

  const lastSeenDate =
    lastSeen instanceof Date ? lastSeen : new Date(lastSeen)

  if (Number.isNaN(lastSeenDate.getTime())) return true

  return now.getTime() - lastSeenDate.getTime() > timeoutMs
}

export function buildOnlineRestoreData({ sessionStartedAt, now = new Date() }) {
  return {
    isOnline: true,
    lastSeen: now,
    sessionStartedAt: sessionStartedAt || now
  }
}

export function buildOfflineUpdateData({ currentUser, now = new Date() }) {
  const { addedMinutes, nextDailyStats } = buildClosedSessionStats({
    sessionStartedAt: currentUser?.sessionStartedAt,
    currentDailyStats: currentUser?.dailyTimeStats || [],
    now
  })

  return {
    isOnline: false,
    sessionStartedAt: null,
    lastSeen: now,
    totalTimeMinutes: (currentUser?.totalTimeMinutes || 0) + addedMinutes,
    dailyTimeStats: nextDailyStats
  }
}

export function resolveUserOnlineStatus({ isOnline, lastSeen, now = new Date() }) {
  if (isOnline === true) return true
  if (!lastSeen) return false
  return !isLastSeenStale(lastSeen, now)
}

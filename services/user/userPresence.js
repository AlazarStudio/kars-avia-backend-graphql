import { prisma } from "../../prisma.js"
import { pubsub, USER_ONLINE } from "../infra/pubsub.js"
import { logger } from "../infra/logger.js"
import {
  buildOfflineUpdateData,
  getIdleTimeoutMs,
  getLastSeenDebounceMs,
  getPresenceCleanupIntervalMs,
  isLastSeenStale,
  resolveUserOnlineStatus
} from "./userPresenceUtils.js"

export {
  buildOfflineUpdateData,
  getIdleTimeoutMs,
  getLastSeenDebounceMs,
  getPresenceCleanupIntervalMs,
  isLastSeenStale,
  parsePositiveIntEnv,
  resolveUserOnlineStatus
} from "./userPresenceUtils.js"

const lastTouchByUserId = new Map()

const OFFLINE_USER_SELECT = {
  totalTimeMinutes: true,
  sessionStartedAt: true,
  dailyTimeStats: true,
  isOnline: true
}

export function touchLastSeen(userId) {
  if (!userId) return

  const debounceMs = getLastSeenDebounceMs()
  const nowMs = Date.now()
  const lastMs = lastTouchByUserId.get(userId)

  if (lastMs != null && nowMs - lastMs < debounceMs) {
    return
  }

  lastTouchByUserId.set(userId, nowMs)

  prisma.user
    .update({
      where: { id: userId },
      data: { lastSeen: new Date() }
    })
    .catch((err) => {
      logger.error(`[PRESENCE] touchLastSeen failed for user ${userId}`, err)
    })
}

export function touchLastSeenForContext(context) {
  if (context?.subjectType === "USER" && context?.subject?.id) {
    touchLastSeen(context.subject.id)
  }
}

export async function applyUserOffline(userId, now = new Date()) {
  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: OFFLINE_USER_SELECT
  })

  if (!currentUser?.isOnline) {
    return null
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: buildOfflineUpdateData({ currentUser, now })
  })

  pubsub.publish(USER_ONLINE, { userOnline: updatedUser })
  return updatedUser
}

export async function markStaleUsersOffline(now = new Date()) {
  const cutoff = new Date(now.getTime() - getIdleTimeoutMs())

  const staleUsers = await prisma.user.findMany({
    where: {
      isOnline: true,
      OR: [{ lastSeen: null }, { lastSeen: { lt: cutoff } }]
    },
    select: { id: true }
  })

  if (staleUsers.length === 0) {
    return 0
  }

  let count = 0

  for (const { id } of staleUsers) {
    try {
      const updated = await applyUserOffline(id, now)
      if (updated) count++
    } catch (err) {
      logger.error(`[PRESENCE] markStaleUsersOffline failed for user ${id}`, err)
    }
  }

  if (count > 0) {
    logger.info(`[PRESENCE] Marked ${count} stale user(s) offline`)
  }

  return count
}

export function resetLastSeenDebounceForTests() {
  lastTouchByUserId.clear()
}

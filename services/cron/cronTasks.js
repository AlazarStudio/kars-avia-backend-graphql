// cronTasks.js
import { prisma } from "../../prisma.js"
import { logger } from "../infra/logger.js"
import { publishRequestUpdated } from "../infra/subscriptionPayloads.js"
import {
  getPresenceCleanupIntervalMs,
  markStaleUsersOffline
} from "../user/userPresence.js"

let intervalId = null
let presenceIntervalId = null

const checkAndArchiveRequests = async () => {
  try {
    const now = new Date()

    const requests = await prisma.request.findMany({
      where: {
        status: { notIn: ["archived", "canceled", "created", "opened"] }
      }
    })

    for (const request of requests) {
      const departureDate = request.departure

      if (departureDate < now) {
        await prisma.request.update({
          where: { id: request.id },
          data: { status: "archiving" }
        })

        await publishRequestUpdated(request.id)
      }
    }
  } catch (e) {
    logger.error("[CRON] checkAndArchiveRequests failed", e)
  }
}

export const startArchivingJob = () => {
  if (intervalId) return

  logger.info("[CRON] Archiving job started")

  intervalId = setInterval(checkAndArchiveRequests, 6 * 60 * 60 * 1000)
}

export const stopArchivingJob = () => {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
    logger.info("[CRON] Archiving job stopped")
  }
}

const runPresenceCleanup = async () => {
  try {
    await markStaleUsersOffline()
  } catch (e) {
    logger.error("[CRON] presence cleanup failed", e)
  }
}

export const startPresenceCleanupJob = () => {
  if (presenceIntervalId) return

  const intervalMs = getPresenceCleanupIntervalMs()

  logger.info(`[CRON] Presence cleanup job started (interval ${intervalMs}ms)`)

  void runPresenceCleanup()
  presenceIntervalId = setInterval(runPresenceCleanup, intervalMs)
}

export const stopPresenceCleanupJob = () => {
  if (presenceIntervalId) {
    clearInterval(presenceIntervalId)
    presenceIntervalId = null
    logger.info("[CRON] Presence cleanup job stopped")
  }
}

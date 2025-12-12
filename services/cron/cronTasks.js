// cronTasks.js
import { prisma } from "../../prisma.js"
import { pubsub, REQUEST_UPDATED } from "../infra/pubsub.js"
import { logger } from "../infra/logger.js"

let intervalId = null

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

        pubsub.publish(REQUEST_UPDATED, {
          requestUpdated: request
        })
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

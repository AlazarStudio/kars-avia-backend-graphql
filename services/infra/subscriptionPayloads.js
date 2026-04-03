import { prisma } from "../../prisma.js"
import { pubsub, REQUEST_UPDATED, RESERVE_UPDATED } from "./pubsub.js"

const reserveSubscriptionInclude = { hotel: true, chat: true }
const requestSubscriptionInclude = { chat: true }

export async function publishReserveUpdated(reserveId) {
  if (!reserveId) return
  const reserveUpdated = await prisma.reserve.findUnique({
    where: { id: reserveId },
    include: reserveSubscriptionInclude
  })
  if (reserveUpdated) {
    pubsub.publish(RESERVE_UPDATED, { reserveUpdated })
  }
}

export async function publishRequestUpdated(requestId) {
  if (!requestId) return
  const requestUpdated = await prisma.request.findUnique({
    where: { id: requestId },
    include: requestSubscriptionInclude
  })
  if (requestUpdated) {
    pubsub.publish(REQUEST_UPDATED, { requestUpdated })
  }
}

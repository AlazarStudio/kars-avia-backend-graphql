// pubsub.js
// Без REDIS_URL: события только внутри одного процесса Node.
// Несколько инстансов / PM2 cluster: задайте REDIS_URL — используется Redis Pub/Sub.
import { PubSub } from "graphql-subscriptions"
import { RedisPubSub } from "graphql-redis-subscriptions"
import { logger } from "./logger.js"

/** Per-user channel for Subscription.newUnreadMessage */
export function newUnreadMessageTopic(userId) {
  return `NEW_UNREAD_MESSAGE_${userId}`
}

/** Per-chat channel for Subscription.messageRead */
export function messageReadTopic(chatId) {
  return `MESSAGE_READ_${chatId}`
}

/** `"redis"` — общий pub/sub между процессами; `"memory"` — только внутри одного процесса Node. */
export const PUBSUB_BACKEND = process.env.REDIS_URL?.trim() ? "redis" : "memory"

function createPubSubEngine() {
  const url = process.env.REDIS_URL?.trim()
  if (url) {
    logger.info("[PUBSUB] Using Redis (REDIS_URL is set)")
    return new RedisPubSub({
      connection: url
    })
  }
  return new PubSub()
}

const pubSubEngine = createPubSubEngine()

if (PUBSUB_BACKEND === "memory") {
  if (process.env.NODE_APP_INSTANCE !== undefined) {
    logger.warn(
      "[PUBSUB] PM2 cluster (NODE_APP_INSTANCE) без REDIS_URL: события подписок GraphQL доходят только до клиентов на том же воркере. Задайте REDIS_URL."
    )
  }
  if (process.env.KUBERNETES_SERVICE_HOST) {
    logger.warn(
      "[PUBSUB] Kubernetes без REDIS_URL: при replicas > 1 подписки будут нестабильны. Задайте REDIS_URL для общего pub/sub."
    )
  }
}

export const pubsub = {
  publish(trigger, payload) {
    try {
      const result = pubSubEngine.publish(trigger, payload)
      if (result != null && typeof result.then === "function") {
        result.catch((err) =>
          logger.error(`[PUBSUB] publish failed trigger=${trigger}`, err)
        )
      }
    } catch (err) {
      logger.error(`[PUBSUB] publish failed trigger=${trigger}`, err)
    }
  },
  asyncIterator(triggers, options) {
    return pubSubEngine.asyncIterator(triggers, options)
  }
}

export const AIRLINE_CREATED = "AIRLINE_CREATED"
export const AIRLINE_UPDATED = "AIRLINE_UPDATED"
export const COMPANY_CHANGED = "COMPANY_CHANGED"
export const CONTRACT_AIRLINE = "CONTRACT_AIRLINE"
export const CONTRACT_HOTEL = "CONTRACT_HOTEL"
export const CONTRACT_ORGANIZATION = "CONTRACT_ORGANIZATION"
export const DISPATCHER_DEPARTMENT_CREATED = "DISPATCHER_DEPARTMENT_CREATED"
export const DISPATCHER_DEPARTMENT_UPDATED = "DISPATCHER_DEPARTMENT_UPDATED"
export const DRIVER_CREATED = "DRIVER_CREATED"
export const DRIVER_ONLINE = "DRIVER_ONLINE"
export const DRIVER_UPDATED = "DRIVER_UPDATED"
export const HOTEL_CREATED = "HOTEL_CREATED"
export const HOTEL_UPDATED = "HOTEL_UPDATED"
export const MESSAGE_SENT = "MESSAGE_SENT"
export const NOTIFICATION = "NOTIFICATION"
export const ORGANIZATION_CREATED = "ORGANIZATION_CREATED"
export const PASSENGER_REQUEST_CREATED = "PASSENGER_REQUEST_CREATED"
export const PASSENGER_REQUEST_UPDATED = "PASSENGER_REQUEST_UPDATED"
export const PRICECATEGORY_CHANGED = "PRICECATEGORY_CHANGED"
export const REPRESENTATIVE_DEPARTMENT_CREATED = "REPRESENTATIVE_DEPARTMENT_CREATED"
export const REPRESENTATIVE_DEPARTMENT_UPDATED = "REPRESENTATIVE_DEPARTMENT_UPDATED"
export const REPORT_CREATED = "REPORT_CREATED"
export const REQUEST_CREATED = "REQUEST_CREATED"
export const REQUEST_UPDATED = "REQUEST_UPDATED"
export const RESERVE_CREATED = "RESERVE_CREATED"
export const RESERVE_HOTEL = "RESERVE_HOTEL"
export const RESERVE_UPDATED = "RESERVE_UPDATED"
export const RESERVE_PERSONS = "RESERVE_PERSONS"
export const TRANSFER_CREATED = "TRANSFER_CREATED"
export const TRANSFER_UPDATED = "TRANSFER_UPDATED"
export const TRANSFER_MESSAGE_SENT = "TRANSFER_MESSAGE_SENT"
export const TRANSFER_MESSAGE_READ = "TRANSFER_MESSAGE_READ"
export const USER_CREATED = "USER_CREATED"
export const USER_ONLINE = "USER_ONLINE"

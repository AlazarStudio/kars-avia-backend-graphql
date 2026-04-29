// pubsub.js
// В multi-instance окружении subscriptions должны работать через Redis.
import Redis from "ioredis"
import { CustomEvent } from "@whatwg-node/events"
import { PubSub, PubSubEngine } from "graphql-subscriptions"
import { createRedisEventTarget } from "@graphql-yoga/redis-event-target"
import { logger } from "./logger.js"

/** Per-user channel for Subscription.newUnreadMessage */
export function newUnreadMessageTopic(userId) {
  return `NEW_UNREAD_MESSAGE_${userId}`
}

/** Per-chat channel for Subscription.messageRead */
export function messageReadTopic(chatId) {
  return `MESSAGE_READ_${chatId}`
}

function isClusterLikeRuntime() {
  const pm2Instance = process.env.NODE_APP_INSTANCE
  const pm2Instances = process.env.instances || process.env.PM2_INSTANCES
  return pm2Instance != null || (pm2Instances != null && pm2Instances !== "1")
}

export function assertSubscriptionPubSubConfig() {
  const hasRedis = Boolean(process.env.REDIS_URL?.trim())
  if (isClusterLikeRuntime() && !hasRedis) {
    throw new Error(
      "[PUBSUB] REDIS_URL is required for subscriptions in PM2 cluster/multi-instance runtime"
    )
  }
}

class RedisEventTargetPubSub extends PubSubEngine {
  constructor(eventTarget) {
    super()
    this.eventTarget = eventTarget
    this.nextSubscriptionId = 1
    this.listeners = new Map()
  }

  publish(triggerName, payload) {
    this.eventTarget.dispatchEvent(
      new CustomEvent(triggerName, {
        detail: payload
      })
    )
    return Promise.resolve()
  }

  subscribe(triggerName, onMessage) {
    const id = this.nextSubscriptionId++
    const listener = (event) => {
      onMessage(event.detail)
    }

    this.listeners.set(id, { triggerName, listener })
    this.eventTarget.addEventListener(triggerName, listener)
    return Promise.resolve(id)
  }

  unsubscribe(subscriptionId) {
    const entry = this.listeners.get(subscriptionId)
    if (!entry) return
    this.listeners.delete(subscriptionId)
    this.eventTarget.removeEventListener(entry.triggerName, entry.listener)
  }
}

function createPubSubEngine() {
  const redisUrl = process.env.REDIS_URL?.trim()
  if (!redisUrl) {
    logger.warn("[PUBSUB] REDIS_URL is not set, using in-memory PubSub")
    return new PubSub()
  }

  logger.info("[PUBSUB] Using Redis event target")
  const publishClient = new Redis(redisUrl)
  const subscribeClient = new Redis(redisUrl)
  const eventTarget = createRedisEventTarget({
    publishClient,
    subscribeClient
  })
  return new RedisEventTargetPubSub(eventTarget)
}

const pubSubEngine = createPubSubEngine()

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

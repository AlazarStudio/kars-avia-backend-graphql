import test from "node:test"
import assert from "node:assert/strict"
import {
  buildNotificationRateKey,
  resetNotificationRateGuard,
  shouldSendNotification
} from "../../services/notification/notificationRateGuard.js"

test("notification rate guard: same key is blocked in cooldown window", () => {
  resetNotificationRateGuard()

  const params = {
    channel: "site",
    action: "new_message",
    entityType: "chat",
    entityId: "chat-1",
    recipientId: "user-1",
    windowMs: 1000
  }

  const first = shouldSendNotification({ ...params, nowMs: 1000 })
  const second = shouldSendNotification({ ...params, nowMs: 1500 })
  const third = shouldSendNotification({ ...params, nowMs: 2001 })

  assert.equal(first.allowed, true)
  assert.equal(second.allowed, false)
  assert.equal(third.allowed, true)
})

test("notification rate guard: recipient is part of dedup key", () => {
  resetNotificationRateGuard()

  const common = {
    channel: "email",
    action: "cancel_request",
    entityType: "request",
    entityId: "req-1",
    windowMs: 60_000,
    nowMs: 10_000
  }

  const firstRecipient = shouldSendNotification({
    ...common,
    recipientId: "ops@example.com"
  })
  const secondRecipient = shouldSendNotification({
    ...common,
    recipientId: "support@example.com"
  })

  assert.equal(firstRecipient.allowed, true)
  assert.equal(secondRecipient.allowed, true)
})

test("notification rate guard: action/channel produce different keys", () => {
  resetNotificationRateGuard()

  const base = {
    entityType: "reserve",
    entityId: "res-1",
    recipientId: "all",
    nowMs: 30_000
  }

  const site = shouldSendNotification({
    ...base,
    channel: "site",
    action: "update_reserve",
    windowMs: 10_000
  })
  const push = shouldSendNotification({
    ...base,
    channel: "push",
    action: "update_reserve",
    windowMs: 10_000
  })
  const otherAction = shouldSendNotification({
    ...base,
    channel: "site",
    action: "reserve_dates_change",
    windowMs: 10_000
  })

  assert.equal(site.allowed, true)
  assert.equal(push.allowed, true)
  assert.equal(otherAction.allowed, true)
})

test("notification rate guard: key builder uses stable structure", () => {
  const key = buildNotificationRateKey({
    channel: "site",
    action: "create_request",
    entityType: "request",
    entityId: "req-42",
    recipientId: "all"
  })

  assert.equal(key, "site:create_request:request:req-42:all")
})

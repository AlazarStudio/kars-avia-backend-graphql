import test from "node:test"
import assert from "node:assert/strict"
import {
  buildNotificationRateKey,
  resetNotificationRateGuard,
  shouldSendNotification
} from "../../services/notification/notificationRateGuard.js"

test("shouldSendNotification always allows", () => {
  resetNotificationRateGuard()

  const params = {
    channel: "site",
    action: "new_message",
    entityType: "chat",
    entityId: "chat-1",
    recipientId: "user-1"
  }

  const first = shouldSendNotification({ ...params })
  const second = shouldSendNotification({ ...params })

  assert.equal(first.allowed, true)
  assert.equal(second.allowed, true)
  assert.equal(first.key, second.key)
  assert.equal(first.retryAfterMs, 0)
  assert.equal(second.retryAfterMs, 0)
})

test("buildNotificationRateKey uses stable structure", () => {
  const key = buildNotificationRateKey({
    channel: "site",
    action: "create_request",
    entityType: "request",
    entityId: "req-42",
    recipientId: "all"
  })

  assert.equal(key, "site:create_request:request:req-42:all")
})

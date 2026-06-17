import test from "node:test"
import assert from "node:assert/strict"
import { buildSupportClientMessageEmail } from "../../services/email/supportEmailTemplates.js"
import { sendSupportClientMessageEmail } from "../../services/notification/sendSupportEmail.js"
import {
  buildNotificationRateKey,
  resetNotificationRateGuard,
  shouldSendNotification
} from "../../services/notification/notificationRateGuard.js"

function withEnv(overrides, fn) {
  const keys = [
    "SUPPORT_EMAIL",
    "EMAIL_RECEIVER",
    "EMAIL_ENABLED",
    "FRONTEND_URL"
  ]
  const prev = {}
  for (const key of keys) {
    prev[key] = process.env[key]
  }

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }

  try {
    return fn()
  } finally {
    for (const key of keys) {
      if (prev[key] === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = prev[key]
      }
    }
  }
}

test("buildSupportClientMessageEmail subject includes sender name", () => {
  const { subject } = buildSupportClientMessageEmail({
    senderName: "Иван Петров",
    senderRole: "AIRLINEADMIN",
    textPreview: "Не работает вход",
    chatId: "chat-1",
    ticketNumber: 2
  })

  assert.match(subject, /Иван Петров/)
  assert.match(subject, /техподдержку/)
})

test("buildSupportClientMessageEmail escapes HTML in preview", () => {
  const { html } = buildSupportClientMessageEmail({
    senderName: "Test",
    textPreview: "<script>alert(1)</script>",
    chatId: "chat-1"
  })

  assert.doesNotMatch(html, /<script>/)
  assert.match(html, /&lt;script&gt;/)
})

test("buildSupportClientMessageEmail includes support link with chatId", () => {
  withEnv({ FRONTEND_URL: "https://karsavia.ru" }, () => {
    const { html } = buildSupportClientMessageEmail({
      senderName: "Test",
      senderRole: "AIRLINEADMIN",
      textPreview: "Помогите",
      chatId: "6a1d29c2810501c3600f2572",
      ticketNumber: 1
    })

    assert.match(
      html,
      /https:\/\/karsavia\.ru\/support\?chatId=6a1d29c2810501c3600f2572/
    )
    assert.match(html, /Тикет/)
    assert.match(html, /AIRLINEADMIN/)
  })
})

test("buildSupportClientMessageEmail truncates long preview", () => {
  const longText = "а".repeat(250)
  const { html } = buildSupportClientMessageEmail({
    senderName: "Test",
    textPreview: longText,
    chatId: "chat-1"
  })

  assert.match(html, /…/)
  assert.doesNotMatch(html, new RegExp("а".repeat(250)))
})

test("support_message rate key structure", () => {
  const key = buildNotificationRateKey({
    channel: "email",
    action: "support_message",
    entityType: "support_chat",
    entityId: "chat-42",
    recipientId: "support@example.com"
  })

  assert.equal(
    key,
    "email:support_message:support_chat:chat-42:support@example.com"
  )
})

test("shouldSendNotification deduplicates support_message emails", () => {
  resetNotificationRateGuard()

  const params = {
    channel: "email",
    action: "support_message",
    entityType: "support_chat",
    entityId: "chat-1",
    recipientId: "support@example.com"
  }

  const first = shouldSendNotification(params)
  const second = shouldSendNotification(params)

  assert.equal(first.allowed, true)
  assert.equal(second.allowed, false)
  assert.ok(second.retryAfterMs > 0)
})

test("sendSupportClientMessageEmail skips when no recipient configured", async () => {
  await withEnv(
    {
      SUPPORT_EMAIL: undefined,
      EMAIL_RECEIVER: undefined,
      EMAIL_ENABLED: "true"
    },
    async () => {
      resetNotificationRateGuard()
      await sendSupportClientMessageEmail({
        chatId: "chat-1",
        sender: { name: "User", role: "HOTELUSER" },
        text: "Hello",
        ticketNumber: 1
      })
    }
  )
})

test("sendSupportClientMessageEmail completes with SUPPORT_EMAIL in test mode", async () => {
  await withEnv(
    {
      SUPPORT_EMAIL: "support@example.com",
      EMAIL_ENABLED: "false"
    },
    async () => {
      resetNotificationRateGuard()
      await sendSupportClientMessageEmail({
        chatId: "chat-2",
        sender: { name: "Клиент", role: "AIRLINEADMIN" },
        text: "Нужна помощь",
        ticketNumber: 3
      })
    }
  )
})

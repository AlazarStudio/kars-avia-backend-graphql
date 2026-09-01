import test from "node:test"
import assert from "node:assert/strict"
import { buildNewMessageEmail } from "../../services/email/requestEmailTemplates.js"
import {
  buildEntityChatUrl,
  buildPassengerRequestCardUrl,
  buildRequestCardUrl
} from "../../services/email/frontendEntityLinks.js"

function withFrontendUrl(url, fn) {
  const prev = process.env.FRONTEND_URL
  process.env.FRONTEND_URL = url
  try {
    return fn()
  } finally {
    if (prev === undefined) delete process.env.FRONTEND_URL
    else process.env.FRONTEND_URL = prev
  }
}

test("buildPassengerRequestCardUrl uses /far/{id}", () => {
  withFrontendUrl("https://karsavia.ru", () => {
    assert.equal(
      buildPassengerRequestCardUrl("6a8f6a8ed25fcb805c49786f"),
      "https://karsavia.ru/far/6a8f6a8ed25fcb805c49786f"
    )
  })
})

test("buildRequestCardUrl uses /relay?id=", () => {
  withFrontendUrl("https://karsavia.ru", () => {
    assert.equal(
      buildRequestCardUrl("6a8f6a8ed25fcb805c49786f"),
      "https://karsavia.ru/relay?id=6a8f6a8ed25fcb805c49786f"
    )
  })
})

test("buildEntityChatUrl appends chatId to FAP path", () => {
  withFrontendUrl("https://karsavia.ru", () => {
    assert.equal(
      buildEntityChatUrl({
        passengerRequestId: "6a8f6a8ed25fcb805c49786f",
        chatId: "chat-1"
      }),
      "https://karsavia.ru/far/6a8f6a8ed25fcb805c49786f?chatId=chat-1"
    )
  })
})

test("buildEntityChatUrl appends chatId to request relay url", () => {
  withFrontendUrl("https://karsavia.ru", () => {
    assert.equal(
      buildEntityChatUrl({
        requestId: "6a8f6a8ed25fcb805c49786f",
        chatId: "chat-1"
      }),
      "https://karsavia.ru/relay?id=6a8f6a8ed25fcb805c49786f&chatId=chat-1"
    )
  })
})

test("buildNewMessageEmail FAP link uses /far/{id}?chatId=", () => {
  withFrontendUrl("https://karsavia.ru", () => {
    const { html } = buildNewMessageEmail({
      passengerRequestNumber: "0001SVO0526f",
      senderName: "Иван",
      textPreview: "Привет",
      passengerRequestId: "6a8f6a8ed25fcb805c49786f",
      chatId: "c1a2b3c4d5e6f7a8b9c0d1e2"
    })
    assert.match(
      html,
      /https:\/\/karsavia\.ru\/far\/6a8f6a8ed25fcb805c49786f\?chatId=c1a2b3c4d5e6f7a8b9c0d1e2/
    )
    assert.doesNotMatch(html, /\/relay\?id=/)
    assert.match(html, /Перейти в чат/)
  })
})

test("buildNewMessageEmail request link uses /relay?id= and chatId", () => {
  withFrontendUrl("https://karsavia.ru", () => {
    const { html } = buildNewMessageEmail({
      requestNumber: "0001",
      senderName: "Иван",
      textPreview: "Привет",
      requestId: "6a8f6a8ed25fcb805c49786f",
      chatId: "c1a2b3c4d5e6f7a8b9c0d1e2"
    })
    assert.match(
      html,
      /https:\/\/karsavia\.ru\/relay\?id=6a8f6a8ed25fcb805c49786f&amp;chatId=c1a2b3c4d5e6f7a8b9c0d1e2/
    )
    assert.match(html, /Перейти в чат/)
  })
})

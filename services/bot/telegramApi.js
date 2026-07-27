import axios from "axios"

const TELEGRAM_API_BASE_URL = "https://api.telegram.org"

function buildTelegramUrl(token, method) {
  if (!token) {
    throw new Error("Не задан токен Telegram бота")
  }

  return `${TELEGRAM_API_BASE_URL}/bot${token}/${method}`
}

function buildUserData(from) {
  if (!from) return null

  return {
    firstName: from.first_name || "",
    lastName: from.last_name || "",
    username: from.username || ""
  }
}

export function parseTelegramUpdate(body) {
  const message = body?.message
  const text = message?.text

  if (!message?.chat?.id || !message?.from?.id || typeof text !== "string") {
    return null
  }

  return {
    chatId: String(message.chat.id),
    userId: String(message.from.id),
    messageId: String(message.message_id),
    text,
    userData: buildUserData(message.from)
  }
}

export async function sendTelegramMessage(token, chatId, text) {
  const { data } = await axios.post(buildTelegramUrl(token, "sendMessage"), {
    chat_id: chatId,
    text
  })

  return data?.result || null
}

export async function setTelegramWebhook(token, url, secretToken) {
  const payload = { url }
  if (secretToken) {
    payload.secret_token = secretToken
  }

  const { data } = await axios.post(
    buildTelegramUrl(token, "setWebhook"),
    payload
  )

  return data
}

export async function deleteTelegramWebhook(token) {
  const { data } = await axios.post(
    buildTelegramUrl(token, "deleteWebhook"),
    {}
  )

  return data
}

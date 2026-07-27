import express from "express"
import { botService } from "./services/bot/botService.js"
import { parseTelegramUpdate } from "./services/bot/telegramApi.js"

const router = express.Router()

router.post("/MAX", async (req, res) => {
  try {
    const update = req.body

    console.log("Получен Webhook от MAX:", {
      type: update.message
        ? "message"
        : update.bot_added
          ? "bot_added"
          : update.message_callback
            ? "callback"
            : "unknown"
    })

    if (update.message) {
      await botService.handleIncomingMessage("MAX", {
        chatId: update.message.recipient.chat_id.toString(),
        userId: update.message.sender.user_id.toString(),
        messageId: update.message.body.mid.toString(),
        text: update.message.body.text || "",
        userData: {
          firstName: update.message.sender.first_name,
          lastName: update.message.sender.last_name,
          username: update.message.sender.username
        }
      })
    } else if (update.message_callback) {
      console.log("Получен callback:", update.message_callback)
    }

    res.sendStatus(200)
  } catch (error) {
    console.error("Ошибка обработки Webhook от MAX:", error)
    res.sendStatus(500)
  }
})

router.post("/telegram", async (req, res) => {
  try {
    const secretToken = req.headers["x-telegram-bot-api-secret-token"]
    await botService.verifyTelegramWebhookSecret(secretToken)

    const messageData = parseTelegramUpdate(req.body)
    res.sendStatus(200)

    if (!messageData) {
      return
    }

    botService.handleIncomingMessage("TELEGRAM", messageData).catch((error) => {
      console.error("Ошибка асинхронной обработки Telegram сообщения:", error)
    })
  } catch (error) {
    console.error("Ошибка обработки Webhook от Telegram:", error)
    if (!res.headersSent) {
      res.sendStatus(500)
    }
  }
})

export default router

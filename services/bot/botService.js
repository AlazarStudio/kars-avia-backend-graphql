import { Bot } from "@maxhub/max-bot-api"
import { prisma } from "../../prisma.js"
import { publishNewUnreadToSupportClients } from "../chat/chatSubscriptionAccess.js"
import { pubsub, MESSAGE_SENT } from "../infra/pubsub.js"
import { sendSupportClientMessageEmail } from "../notification/sendSupportEmail.js"
import { findSupportAgents } from "../support/supportAgent.js"
import {
  deleteTelegramWebhook,
  sendTelegramMessage,
  setTelegramWebhook
} from "./telegramApi.js"

function buildSenderName(userData, fallbackName) {
  const fullName = [userData?.firstName, userData?.lastName]
    .filter(Boolean)
    .join(" ")
    .trim()

  if (fullName) return fullName
  if (userData?.username) return `@${userData.username}`
  return fallbackName
}

class BotService {
  constructor() {
    this.bots = new Map()
  }

  async initialize() {
    try {
      const configs = await prisma.botConfig.findMany({
        where: { isActive: true }
      })

      for (const config of configs) {
        await this.startBot(config)
      }

      console.log(`Запущено ботов: ${this.bots.size}`)
    } catch (error) {
      console.error("Ошибка инициализации ботов:", error)
      throw error
    }
  }

  getTelegramWebhookBaseUrl() {
    return process.env.TELEGRAM_WEBHOOK_BASE_URL?.trim().replace(/\/+$/, "")
  }

  getTelegramWebhookSecret(config) {
    return process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || `telegram-${config.id}`
  }

  async verifyTelegramWebhookSecret(secretToken) {
    const config = await prisma.botConfig.findFirst({
      where: {
        channelType: "TELEGRAM",
        isActive: true
      }
    })

    if (!config) {
      throw new Error("Активный Telegram бот не найден")
    }

    const expectedSecret = this.getTelegramWebhookSecret(config)
    if (expectedSecret && secretToken !== expectedSecret) {
      throw new Error("Неверный Telegram webhook secret")
    }

    return config
  }

  async startBot(config) {
    try {
      if (this.bots.has(config.channelType)) {
        await this.stopBot(config.channelType)
      }

      if (config.channelType === "MAX") {
        const bot = new Bot(config.token)

        bot.on("message_created", async (ctx) => {
          try {
            console.log("Получено сообщение от MAX:", {
              chatId: ctx.message?.recipient?.chat_id,
              userId: ctx.message?.sender?.user_id,
              text: ctx.message?.body?.text?.substring(0, 50) + "..."
            })

            await this.handleIncomingMessage("MAX", {
              chatId: ctx.message.recipient.chat_id.toString(),
              userId: ctx.message.sender.user_id.toString(),
              messageId: ctx.message.body.mid.toString(),
              text: ctx.message.body.text || "",
              userData: {
                firstName: ctx.message.sender.first_name,
                lastName: ctx.message.sender.last_name,
                username: ctx.message.sender.username
              }
            })
          } catch (error) {
            console.error("Ошибка обработки сообщения от MAX:", error)
          }
        })

        bot.on("message_callback", async (ctx) => {
          try {
            console.log("Получен callback от кнопки:", ctx)

            const callbackData = ctx.callback?.data
            const chatId = ctx.callback?.message?.recipient?.chat_id

            if (callbackData && chatId) {
              console.log(`Callback "${callbackData}" от чата ${chatId}`)
            }
          } catch (error) {
            console.error("Ошибка обработки callback:", error)
          }
        })

        bot.on("error", (error) => {
          console.error("Ошибка бота MAX:", error)
        })

        await bot.start()
        this.bots.set("MAX", { provider: "MAX", bot, token: config.token })
        console.log("Бот MAX запущен с Long Polling")
        return
      }

      if (config.channelType === "TELEGRAM") {
        const webhookBaseUrl = this.getTelegramWebhookBaseUrl()
        if (!webhookBaseUrl) {
          throw new Error("Не задан TELEGRAM_WEBHOOK_BASE_URL")
        }

        const secretToken = this.getTelegramWebhookSecret(config)
        const webhookUrl = `${webhookBaseUrl}/telegram`

        await setTelegramWebhook(config.token, webhookUrl, secretToken)

        await prisma.botConfig.update({
          where: { id: config.id },
          data: { webhookUrl }
        })

        this.bots.set("TELEGRAM", {
          provider: "TELEGRAM",
          token: config.token,
          secretToken,
          webhookUrl
        })

        console.log(`Telegram webhook зарегистрирован: ${webhookUrl}`)
        return
      }

      if (config.channelType === "WHATSAPP") {
        console.log("WhatsApp бот пока не реализован")
      }
    } catch (error) {
      console.error(`Ошибка запуска бота для ${config.channelType}:`, error)
      throw error
    }
  }

  async ensureSupportParticipants(chatId) {
    const supportAgents = await findSupportAgents()
    if (supportAgents.length === 0) {
      throw new Error("Нет доступных агентов поддержки")
    }

    const existingParticipants = await prisma.chatUser.findMany({
      where: { chatId },
      select: { userId: true }
    })

    const existingIds = new Set(existingParticipants.map((participant) => participant.userId))
    const missingAgents = supportAgents.filter((agent) => !existingIds.has(agent.id))

    if (missingAgents.length > 0) {
      await prisma.chatUser.createMany({
        data: missingAgents.map((agent) => ({
          chatId,
          userId: agent.id
        }))
      })
    }
  }

  async ensureSupportChatInfrastructure(chat, data) {
    await this.ensureSupportParticipants(chat.id)

    const tickets = await prisma.supportTicket.findMany({
      where: { chatId: chat.id },
      orderBy: { ticketNumber: "desc" }
    })

    let currentTicket = tickets.find(
      (ticket) => ticket.status === "OPEN" || ticket.status === "IN_PROGRESS"
    )

    if (!currentTicket && chat.supportStatus === "RESOLVED") {
      const nextTicketNumber = tickets.length > 0 ? tickets[0].ticketNumber + 1 : 1

      currentTicket = await prisma.supportTicket.create({
        data: {
          chatId: chat.id,
          ticketNumber: nextTicketNumber,
          status: "OPEN"
        }
      })

      chat = await prisma.chat.update({
        where: { id: chat.id },
        data: {
          supportStatus: "OPEN",
          assignedToId: null,
          resolvedAt: null,
          resolvedById: null,
          externalChatId: data.chatId,
          externalUserId: data.userId,
          botMetadata: {
            userData: data.userData,
            lastActivity: new Date()
          }
        }
      })
    }

    if (!currentTicket) {
      const nextTicketNumber = tickets.length > 0 ? tickets[0].ticketNumber + 1 : 1

      currentTicket = await prisma.supportTicket.create({
        data: {
          chatId: chat.id,
          ticketNumber: nextTicketNumber,
          status: chat.supportStatus || "OPEN"
        }
      })
    }

    return currentTicket
  }

  async handleIncomingMessage(channelType, data) {
    try {
      console.log(`Обработка входящего сообщения из ${channelType}:`, {
        chatId: data.chatId,
        userId: data.userId,
        messageId: data.messageId,
        textPreview: data.text?.substring(0, 50) + "..."
      })

      const chat = await this.findOrCreateChat(channelType, data)
      const ticket = await this.ensureSupportChatInfrastructure(chat, data)
      const senderName = buildSenderName(
        data.userData,
        channelType === "TELEGRAM" ? "Пользователь Telegram" : "Пользователь MAX"
      )

      const message = await prisma.message.create({
        data: {
          chatId: chat.id,
          text: data.text,
          channelType,
          externalMessageId: data.messageId,
          senderExternalUserId: data.userId,
          senderName,
          supportTicketId: ticket.id,
          createdAt: new Date()
        },
        include: {
          chat: true,
          sender: true
        }
      })

      await sendSupportClientMessageEmail({
        chatId: chat.id,
        sender: {
          name: senderName,
          role: channelType
        },
        text: data.text,
        ticketNumber: ticket.ticketNumber
      })

      await publishNewUnreadToSupportClients(chat.id, message)

      console.log(`Сообщение сохранено в CRM: ${message.id}`)

      pubsub.publish(MESSAGE_SENT, {
        messageSent: message
      })

      return message
    } catch (error) {
      console.error(`Ошибка обработки входящего сообщения из ${channelType}:`, error)
      throw error
    }
  }

  async findOrCreateChat(channelType, data) {
    try {
      let chat = await prisma.chat.findFirst({
        where: {
          channelType,
          externalChatId: data.chatId
        }
      })

      if (chat) {
        console.log(`Найден существующий чат: ${chat.id}`)

        if (data.userData) {
          chat = await prisma.chat.update({
            where: { id: chat.id },
            data: {
              externalUserId: data.userId,
              botMetadata: {
                userData: data.userData,
                lastActivity: new Date()
              }
            }
          })
        }

        return chat
      }

      chat = await prisma.chat.findFirst({
        where: {
          channelType,
          externalUserId: data.userId,
          supportStatus: { not: "RESOLVED" }
        }
      })

      if (chat) {
        console.log(`Найден чат по userId, обновляем externalChatId: ${chat.id}`)

        return prisma.chat.update({
          where: { id: chat.id },
          data: {
            externalChatId: data.chatId,
            botMetadata: {
              userData: data.userData,
              lastActivity: new Date()
            }
          }
        })
      }

      console.log(`Создаем новый чат для пользователя ${data.userId}`)

      chat = await prisma.chat.create({
        data: {
          channelType,
          externalChatId: data.chatId,
          externalUserId: data.userId,
          isSupport: true,
          supportStatus: "OPEN",
          botMetadata: {
            userData: data.userData,
            startedAt: new Date(),
            lastActivity: new Date()
          }
        }
      })

      console.log(`Создан новый чат поддержки: ${chat.id}`)
      return chat
    } catch (error) {
      console.error("Ошибка в findOrCreateChat:", error)
      throw error
    }
  }

  async sendToUser(chatId, text, options = {}) {
    try {
      const chat = await prisma.chat.findUnique({
        where: { id: chatId }
      })

      if (!chat || !chat.externalChatId) {
        throw new Error("Чат не связан с внешним мессенджером")
      }

      const bot = this.bots.get(chat.channelType)
      if (!bot) {
        throw new Error(`Бот для ${chat.channelType} не активен`)
      }

      if (chat.channelType === "MAX") {
        try {
          const messagePayload = {
            recipient: {
              chat_id: chat.externalChatId
            },
            message: {
              text,
              format: options.format || "markdown"
            }
          }

          if (options.attachments && options.attachments.length > 0) {
            messagePayload.message.attachments = options.attachments
          }

          const sentMessage = await bot.bot.api.sendMessage(
            messagePayload.recipient,
            messagePayload.message
          )

          const messageId = sentMessage?.body?.mid || sentMessage?.message_id
          console.log(`Сообщение отправлено в MAX, ID: ${messageId}`)
          return messageId
        } catch (apiError) {
          console.error("Ошибка API MAX при отправке:", apiError)
          throw new Error(`Ошибка отправки в MAX: ${apiError.message}`)
        }
      }

      if (chat.channelType === "TELEGRAM") {
        const sentMessage = await sendTelegramMessage(
          bot.token,
          chat.externalChatId,
          text
        )
        const messageId = sentMessage?.message_id?.toString() || null
        console.log(`Сообщение отправлено в Telegram, ID: ${messageId}`)
        return messageId
      }

      throw new Error(`Отправка в ${chat.channelType} пока не реализована`)
    } catch (error) {
      console.error("Ошибка отправки пользователю:", error)
      throw error
    }
  }

  async sendMessageWithKeyboard(chatId, text, buttons) {
    return this.sendToUser(chatId, text, {
      attachments: [
        {
          type: "inline_keyboard",
          payload: {
            buttons
          }
        }
      ]
    })
  }

  async sendImage(chatId, imageToken, caption = "") {
    return this.sendToUser(chatId, caption, {
      attachments: [
        {
          type: "image",
          payload: {
            token: imageToken
          }
        }
      ]
    })
  }

  async uploadFile(fileBuffer, fileName) {
    const bot = this.bots.get("MAX")
    if (!bot) {
      throw new Error("Бот MAX не активен")
    }

    try {
      const result = await bot.bot.api.uploadFile(fileBuffer, fileName)
      console.log(`Файл загружен в MAX, token: ${result.token}`)
      return result.token
    } catch (error) {
      console.error("Ошибка загрузки файла в MAX:", error)
      throw error
    }
  }

  async getBotInfo() {
    const bot = this.bots.get("MAX")
    if (!bot) {
      throw new Error("Бот MAX не активен")
    }

    try {
      const info = await bot.bot.api.getMe()
      console.log("Информация о боте:", info)
      return info
    } catch (error) {
      console.error("Ошибка получения информации о боте:", error)
      throw error
    }
  }

  async stopBot(channelType) {
    const bot = this.bots.get(channelType)
    if (!bot) return

    try {
      if (channelType === "MAX" && bot.bot) {
        await bot.bot.stopPolling()
      }

      if (channelType === "TELEGRAM" && bot.token) {
        await deleteTelegramWebhook(bot.token)
      }

      this.bots.delete(channelType)
      console.log(`Бот ${channelType} остановлен`)
    } catch (error) {
      console.error(`Ошибка остановки бота ${channelType}:`, error)
      throw error
    }
  }

  async registerBot(channelType, name, token) {
    try {
      const config = await prisma.botConfig.create({
        data: {
          channelType,
          name,
          token,
          isActive: true
        }
      })

      if (config.isActive) {
        await this.startBot(config)
      }

      console.log(`Бот ${name} (${channelType}) зарегистрирован`)
      return prisma.botConfig.findUnique({
        where: { id: config.id }
      })
    } catch (error) {
      console.error("Ошибка регистрации бота:", error)
      throw error
    }
  }

  async toggleBot(id, isActive) {
    try {
      const config = await prisma.botConfig.update({
        where: { id },
        data: { isActive }
      })

      if (isActive) {
        await this.startBot(config)
        console.log(`Бот ${config.name} активирован`)
      } else {
        await this.stopBot(config.channelType)
        console.log(`Бот ${config.name} деактивирован`)
      }

      return config
    } catch (error) {
      console.error("Ошибка переключения бота:", error)
      throw error
    }
  }

  async getBotConfigs() {
    return prisma.botConfig.findMany()
  }

  async updateBotToken(id, newToken) {
    try {
      const config = await prisma.botConfig.findUnique({
        where: { id }
      })

      if (!config) {
        throw new Error("Конфигурация бота не найдена")
      }

      if (config.isActive) {
        await this.stopBot(config.channelType)
      }

      const updatedConfig = await prisma.botConfig.update({
        where: { id },
        data: { token: newToken }
      })

      if (updatedConfig.isActive) {
        await this.startBot(updatedConfig)
      }

      console.log(`Токен бота ${updatedConfig.name} обновлен`)
      return updatedConfig
    } catch (error) {
      console.error("Ошибка обновления токена бота:", error)
      throw error
    }
  }
}

export const botService = new BotService()

// services/bot/botService.js

import { prisma } from "./prisma.js"
import { pubsub, MESSAGE_SENT } from "./services/infra/pubsub.js"
// import TelegramBot from "node-telegram-bot-api"
import { Bot } from "@maxhub/max-bot-api"

class BotService {
  constructor() {
    this.bots = new Map() // channelType -> botInstance
  }

  // Инициализация при старте сервера
  async initialize() {
    const configs = await prisma.botConfig.findMany({
      where: { isActive: true }
    })

    for (const config of configs) {
      await this.startBot(config)
    }

    console.log(`Запущено ботов: ${this.bots.size}`)
  }

  // Запуск конкретного бота
  async startBot(config) {
    // if (config.channelType === 'TELEGRAM') {
    //   const bot = new TelegramBot(config.token, { polling: true })

    //   // Обработка входящих сообщений
    //   bot.on('message', async (msg) => {
    //     await this.handleIncomingMessage('TELEGRAM', {
    //       chatId: msg.chat.id.toString(),
    //       userId: msg.from.id.toString(),
    //       messageId: msg.message_id.toString(),
    //       text: msg.text || '',
    //       userData: {
    //         firstName: msg.from.first_name,
    //         lastName: msg.from.last_name,
    //         username: msg.from.username
    //       }
    //     })
    //   })

    //   this.bots.set('TELEGRAM', bot)
    // }

    // Добавить другие мессенджеры по аналогии
    if (config.channelType === "MAX") {
      const bot = new Bot(config.token)

      bot.on("message_created", async (ctx) => {
        await this.handleIncomingMessage("MAX", {
          chatId: ctx.message.recipient.chat_id.toString(), // id чата между пользователем и ботом в MAX
          userId: ctx.message.sender.user_id.toString(), // id пользователя отправившего сообщение в бота
          messageId: ctx.message.body.mid.toString(), // id сообщения в
          text: ctx.message.body.text, // Текст сообщения
          userData: {
            // Данные пользователя ФИ (пока без номера)
            firstName: ctx.message.sender.first_name,
            lastName: ctx.message.sender.last_name
          }
        })
      })

      await bot.start()
      this.bots.set("MAX", bot)
    }
  }

  // Обработка входящего сообщения от пользователя
  async handleIncomingMessage(channelType, data) {
    try {
      // 1. Находим или создаем чат
      const chat = await this.findOrCreateChat(channelType, data)

      // 2. Создаем сообщение в CRM
      const message = await prisma.message.create({
        data: {
          chatId: chat.id,
          text: data.text,
          channelType,
          externalMessageId: data.messageId,
          senderExternalUserId: data.userId,
          senderName: data.userData?.firstName || "Пользователь",
          createdAt: new Date()
        },
        include: {
          chat: true,
          sender: true
        }
      })

      // 3. Публикуем событие (чтобы обновился UI у админа)
      pubsub.publish(MESSAGE_SENT, {
        messageSent: message
      })

      return message
    } catch (error) {
      console.error(`Ошибка обработки входящего сообщения:`, error)
    }
  }

  // Поиск или создание чата (логика для всех мессенджеров одна и та же)
  async findOrCreateChat(channelType, data) {
    // Ищем существующий чат
    let chat = await prisma.chat.findFirst({
      where: {
        channelType,
        externalChatId: data.chatId
      }
    })

    if (chat) return chat

    // Создаем новый чат
    chat = await prisma.chat.create({
      data: {
        channelType,
        externalChatId: data.chatId,
        externalUserId: data.userId,
        isSupport: true,
        supportStatus: "OPEN",
        botMetadata: {
          userData: data.userData,
          startedAt: new Date()
        }
      }
    })

    return chat
  }

  // Отправка сообщения пользователю в мессенджер
  async sendToUser(chatId, text) {
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

    // Отправляем в мессенджер
    if (chat.channelType === "MAX") {
      const sentMessage = await bot.api.sendMessageToChat(chat.chatId, text)
      return sentMessage.body.mid // Возвращаем ID сообщения в мессенджере
    }

    // const sentMessage = await bot.sendMessage(chat.externalChatId, text)
  }

  // CRUD для конфигураций ботов
  async registerBot(channelType, name, token) {
    const config = await prisma.botConfig.create({
      data: { channelType, name, token }
    })

    if (config.isActive) {
      await this.startBot(config)
    }

    return config
  }

  async toggleBot(id, isActive) {
    const config = await prisma.botConfig.update({
      where: { id },
      data: { isActive }
    })

    if (isActive) {
      await this.startBot(config)
    } else {
      // Останавливаем бота
      const bot = this.bots.get(config.channelType)
      if (bot) {
        await bot.stopPolling()
        this.bots.delete(config.channelType)
      }
    }

    return config
  }

  async getBotConfigs() {
    return prisma.botConfig.findMany()
  }
}

export const botService = new BotService()

// services/bot/botService.js

import { prisma } from "../../prisma.js"
import { pubsub, MESSAGE_SENT } from "../infra/pubsub.js"
import { Bot } from "@maxhub/max-bot-api"

class BotService {
  constructor() {
    this.bots = new Map() // channelType -> botInstance
  }

  // Инициализация при старте сервера
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

  // Запуск конкретного бота
  async startBot(config) {
    try {
      if (config.channelType === "MAX") {
        // Создаем бота с токеном (теперь передается через заголовок Authorization)
        const bot = new Bot(config.token)

        // Обработка входящих сообщений
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

        // Обработка callback'ов от кнопок
        bot.on("message_callback", async (ctx) => {
          try {
            console.log("Получен callback от кнопки:", ctx)
            
            // Можно обработать нажатие на кнопку
            // Например, отправить ответное сообщение
            const callbackData = ctx.callback?.data
            const chatId = ctx.callback?.message?.recipient?.chat_id
            
            if (callbackData && chatId) {
              // Здесь можно добавить логику обработки callback'ов
              console.log(`Callback "${callbackData}" от чата ${chatId}`)
            }
          } catch (error) {
            console.error("Ошибка обработки callback:", error)
          }
        })

        // Обработка ошибок бота
        bot.on("error", (error) => {
          console.error("Ошибка бота MAX:", error)
        })

        // Запускаем Long Polling
        await bot.start()
        
        this.bots.set("MAX", bot)
        console.log(`Бот MAX запущен с Long Polling`)
      }

      // Добавить другие мессенджеры по аналогии
      if (config.channelType === "TELEGRAM") {
        // Реализация для Telegram
        console.log("Telegram бот пока не реализован")
      }

      if (config.channelType === "WHATSAPP") {
        // Реализация для WhatsApp
        console.log("WhatsApp бот пока не реализован")
      }
    } catch (error) {
      console.error(`Ошибка запуска бота для ${config.channelType}:`, error)
      throw error
    }
  }

  // Обработка входящего сообщения от пользователя
  async handleIncomingMessage(channelType, data) {
    try {
      console.log(`Обработка входящего сообщения из ${channelType}:`, {
        chatId: data.chatId,
        userId: data.userId,
        messageId: data.messageId,
        textPreview: data.text?.substring(0, 50) + "..."
      })

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
          senderName: data.userData?.firstName 
            ? `${data.userData.firstName} ${data.userData.lastName || ''}`.trim()
            : "Пользователь MAX",
          createdAt: new Date()
        },
        include: {
          chat: true,
          sender: true
        }
      })

      console.log(`Сообщение сохранено в CRM: ${message.id}`)

      // 3. Публикуем событие (чтобы обновился UI у админа)
      pubsub.publish(MESSAGE_SENT, {
        messageSent: message
      })

      return message
    } catch (error) {
      console.error(`Ошибка обработки входящего сообщения из ${channelType}:`, error)
      throw error
    }
  }

  // Поиск или создание чата
  async findOrCreateChat(channelType, data) {
    try {
      // 1. Ищем существующий чат по externalChatId
      let chat = await prisma.chat.findFirst({
        where: {
          channelType,
          externalChatId: data.chatId
        }
      })

      if (chat) {
        console.log(`Найден существующий чат: ${chat.id}`)
        
        // Обновляем метаданные, если изменились
        if (data.userData) {
          await prisma.chat.update({
            where: { id: chat.id },
            data: {
              botMetadata: {
                userData: data.userData,
                lastActivity: new Date()
              }
            }
          })
        }
        
        return chat
      }

      // 2. Ищем чат по externalUserId (защита от дубликатов)
      chat = await prisma.chat.findFirst({
        where: {
          channelType,
          externalUserId: data.userId,
          supportStatus: { not: "RESOLVED" } // Только незакрытые чаты
        }
      })

      if (chat) {
        console.log(`Найден чат по userId, обновляем externalChatId: ${chat.id}`)
        
        // Обновляем externalChatId у существующего чата
        chat = await prisma.chat.update({
          where: { id: chat.id },
          data: {
            externalChatId: data.chatId,
            botMetadata: {
              userData: data.userData,
              lastActivity: new Date()
            }
          }
        })
        
        return chat
      }

      // 3. Создаем новый чат поддержки
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
            startedAt: new Date()
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

  // Отправка сообщения пользователю в мессенджер
  async sendToUser(chatId, text, options = {}) {
    try {
      const chat = await prisma.chat.findUnique({
        where: { id: chatId },
        include: {
          botConfig: true // Если есть связь с конфигом бота
        }
      })

      if (!chat || !chat.externalChatId) {
        throw new Error("Чат не связан с внешним мессенджером")
      }

      const bot = this.bots.get(chat.channelType)
      if (!bot) {
        throw new Error(`Бот для ${chat.channelType} не активен`)
      }

      console.log(`Отправка сообщения в MAX, чат: ${chat.externalChatId}`)

      // Отправляем через API MAX
      if (chat.channelType === "MAX") {
        try {
          const messagePayload = {
            recipient: {
              chat_id: chat.externalChatId
            },
            message: {
              text: text,
              format: options.format || "markdown" // markdown или html
            }
          }

          // Добавляем вложения если есть
          if (options.attachments && options.attachments.length > 0) {
            messagePayload.message.attachments = options.attachments
          }

          const sentMessage = await bot.api.sendMessage(
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

      // Для других мессенджеров
      throw new Error(`Отправка в ${chat.channelType} пока не реализована`)
      
    } catch (error) {
      console.error("Ошибка отправки пользователю:", error)
      throw error
    }
  }

  // Отправка сообщения с кнопками
  async sendMessageWithKeyboard(chatId, text, buttons) {
    return this.sendToUser(chatId, text, {
      attachments: [{
        type: "inline_keyboard",
        payload: {
          buttons: buttons
        }
      }]
    })
  }

  // Отправка изображения
  async sendImage(chatId, imageToken, caption = "") {
    return this.sendToUser(chatId, caption, {
      attachments: [{
        type: "image",
        payload: {
          token: imageToken
        }
      }]
    })
  }

  // Загрузка файла в MAX
  async uploadFile(fileBuffer, fileName) {
    const bot = this.bots.get("MAX")
    if (!bot) {
      throw new Error("Бот MAX не активен")
    }

    try {
      const result = await bot.api.uploadFile(fileBuffer, fileName)
      console.log(`Файл загружен в MAX, token: ${result.token}`)
      return result.token
    } catch (error) {
      console.error("Ошибка загрузки файла в MAX:", error)
      throw error
    }
  }

  // Получение информации о боте
  async getBotInfo() {
    const bot = this.bots.get("MAX")
    if (!bot) {
      throw new Error("Бот MAX не активен")
    }

    try {
      const info = await bot.api.getMe()
      console.log("Информация о боте:", info)
      return info
    } catch (error) {
      console.error("Ошибка получения информации о боте:", error)
      throw error
    }
  }

  // Остановка бота
  async stopBot(channelType) {
    const bot = this.bots.get(channelType)
    if (bot) {
      try {
        await bot.stopPolling()
        this.bots.delete(channelType)
        console.log(`Бот ${channelType} остановлен`)
      } catch (error) {
        console.error(`Ошибка остановки бота ${channelType}:`, error)
        throw error
      }
    }
  }

  // CRUD для конфигураций ботов
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

      // Запускаем бота сразу после регистрации
      if (config.isActive) {
        await this.startBot(config)
      }

      console.log(`Бот ${name} (${channelType}) зарегистрирован`)
      return config
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
        // Запускаем бота
        await this.startBot(config)
        console.log(`Бот ${config.name} активирован`)
      } else {
        // Останавливаем бота
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

  // Обновление токена бота
  async updateBotToken(id, newToken) {
    try {
      const config = await prisma.botConfig.findUnique({
        where: { id }
      })

      if (!config) {
        throw new Error("Конфигурация бота не найдена")
      }

      // Останавливаем текущего бота
      if (config.isActive) {
        await this.stopBot(config.channelType)
      }

      // Обновляем токен
      const updatedConfig = await prisma.botConfig.update({
        where: { id },
        data: { token: newToken }
      })

      // Перезапускаем бота с новым токеном
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
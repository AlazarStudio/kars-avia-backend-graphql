import { prisma } from "../../prisma.js"
import { pubsub, MESSAGE_SENT } from "../../exports/pubsub.js"

const chatResolver = {
  Query: {
    // Возвращает чаты по requestId или reserveId
    chats: async (_, { requestId, reserveId }, context) => {
      const chats = await prisma.chat.findMany({
        where: {
          OR: [requestId ? { requestId } : {}, reserveId ? { reserveId } : {}]
        },
        include: { hotel: true }
      })
      return chats
    },

    // Возвращает список сообщений чата, которые ещё не прочитаны пользователем (по связи readBy)
    unreadMessages: async (_, { chatId, userId }) => {
      const unreadMessages = await prisma.message.findMany({
        where: {
          chatId,
          NOT: {
            readBy: {
              some: { userId } // Исключаем сообщения, которые пользователь уже прочитал
            }
          }
        },
        include: { sender: true }
      })
      return unreadMessages
    },

    // Подсчитывает количество непрочитанных сообщений в чате для конкретного пользователя
    unreadMessagesInChat: async (_, { chatId, userId }) => {
      // Получаем все сообщения чата (только их ID)
      const allMessages = await prisma.message.findMany({
        where: { chatId },
        select: { id: true }
      })

      // Получаем список прочитанных сообщений для данного пользователя
      const readMessages = await prisma.messageRead.findMany({
        where: {
          userId,
          messageId: { in: allMessages.map((message) => message.id) }
        },
        select: { messageId: true }
      })

      // Фильтруем непрочитанные сообщения
      const unreadMessageIds = allMessages
        .map((message) => message.id)
        .filter((id) => !readMessages.some((read) => read.messageId === id))

      return unreadMessageIds.length
    },

    // Возвращает все сообщения чата с включением данных отправителя
    messages: async (_, { chatId }, context) => {
      return await prisma.message.findMany({
        where: { chatId },
        include: { sender: true }
      })
    }
  },

  Mutation: {
    // Создание нового сообщения в чате
    sendMessage: async (_, { chatId, senderId, text }, context) => {
      const message = await prisma.message.create({
        data: {
          text,
          sender: { connect: { id: senderId } },
          chat: { connect: { id: chatId } }
        },
        include: { sender: true, chat: true }
      })
      // Публикуем событие отправки сообщения для подписок
      pubsub.publish(`${MESSAGE_SENT}_${chatId}`, { messageSent: message })
      return message
    },

    // Помечает конкретное сообщение как прочитанное пользователем
    markMessageAsRead: async (_, { messageId, userId }, context) => {
      const messageRead = await prisma.messageRead.upsert({
        where: {
          messageId_userId: { messageId, userId }
        },
        update: {
          readAt: new Date()
        },
        create: {
          messageId,
          userId,
          readAt: new Date()
        }
      })
      return messageRead
    },

    // Помечает все сообщения в чате как прочитанные для конкретного пользователя
    markAllMessagesAsRead: async (_, { chatId, userId }) => {
      const currentTime = new Date()

      // Обновляем поле lastReadMessageAt для данного пользователя в чате
      await prisma.chatUser.update({
        where: { chatId_userId: { chatId, userId } },
        data: { lastReadMessageAt: currentTime }
      })

      // (Опционально) Обновляем статус isRead у сообщений до текущего времени
      await prisma.message.updateMany({
        where: {
          chatId,
          createdAt: { lte: currentTime }
        },
        data: { isRead: true }
      })

      return true
    },

    // Создаёт новый чат, связанный с определённой заявкой, и добавляет пользователей в чат
    createChat: async (_, { requestId, userIds }, context) => {
      const chat = await prisma.chat.create({
        data: {
          request: { connect: { id: requestId } }
        }
      })
      const chatUserPromises = userIds.map((userId) =>
        prisma.chatUser.create({
          data: {
            chat: { connect: { id: chat.id } },
            user: { connect: { id: userId } }
          }
        })
      )
      await Promise.all(chatUserPromises)
      return chat
    }
  },

  Subscription: {
    messageSent: {
      subscribe: (_, { chatId }) =>
        pubsub.asyncIterator(`${MESSAGE_SENT}_${chatId}`)
    },
    newUnreadMessage: {
      subscribe: (_, { chatId, userId }) =>
        pubsub.asyncIterator(`NEW_UNREAD_MESSAGE_${chatId}_${userId}`),
      resolve: (payload) => payload.newUnreadMessage
    },
    messageRead: {
      subscribe: (_, { chatId }) =>
        pubsub.asyncIterator(`MESSAGE_READ_${chatId}`),
      resolve: (payload) => payload.messageRead
    }
  },

  // Резольверы для полей типа Chat
  Chat: {
    // Возвращает участников чата, извлекая пользователей из записей ChatUser
    participants: async (parent) => {
      const chatUsers = await prisma.chatUser.findMany({
        where: { chatId: parent.id },
        include: { user: true }
      })
      return chatUsers.map((chatUser) => chatUser.user)
    },

    // Вычисляет количество непрочитанных сообщений в чате для конкретного пользователя
    unreadMessagesCount: async (parent, { userId }) => {
      const lastReadMessage = await prisma.chatUser.findFirst({
        where: {
          chatId: parent.id,
          userId
        },
        select: {
          lastReadMessageAt: true
        }
      })
      const lastReadTime = lastReadMessage?.lastReadMessageAt || new Date(0)
      return await prisma.message.count({
        where: {
          chatId: parent.id,
          createdAt: { gt: lastReadTime }
        }
      })
    },

    // Возвращает все сообщения чата с включением отправителя
    messages: async (parent) => {
      return await prisma.message.findMany({
        where: { chatId: parent.id },
        include: { sender: true }
      })
    }
  }
}

export default chatResolver

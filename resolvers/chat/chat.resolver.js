import { prisma } from "../../prisma.js"
import { pubsub, MESSAGE_SENT } from "../../exports/pubsub.js"

const chatResolver = {
  Query: {
    chats: async (_, { requestId, reserveId }, context) => {
      const chats = await prisma.chat.findMany({
        where: {
          OR: [requestId ? { requestId } : {}, reserveId ? { reserveId } : {}]
        },
        include: { hotel: true }
      })
      return chats
    },

    // unreadMessages: async (_, { receiverId }, context) => {
    //   return await prisma.message.findMany({
    //     where: {
    //       receiverId,
    //       isRead: false
    //     },
    //     include: { sender: true }
    //   })
    // },

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

    // unreadMessagesInChat: async (_, { chatId, userId }) => {
    //   const lastReadMessage = await prisma.chatUser.findFirst({
    //     where: {
    //       chatId,
    //       userId
    //     },
    //     select: {
    //       lastReadMessageAt: true
    //     }
    //   })

    //   const lastReadTime = lastReadMessage?.lastReadMessageAt || new Date(0)

    //   return await prisma.message.count({
    //     where: {
    //       chatId,
    //       createdAt: { gt: lastReadTime } // Сообщения после последнего прочтения
    //     }
    //   })
    // },

    unreadMessagesInChat: async (_, { chatId, userId }) => {
      // Получаем все сообщения чата
      const allMessages = await prisma.message.findMany({
        where: { chatId },
        select: { id: true }
      })

      const readMessages = await prisma.messageRead.findMany({
        where: {
          userId,
          messageId: { in: allMessages.map((message) => message.id) }
        },
        select: { messageId: true }
      })

      // Непрочитанные сообщения = Все сообщения - Прочитанные
      const unreadMessageIds = allMessages
        .map((message) => message.id)
        .filter((id) => !readMessages.some((read) => read.messageId === id))

      return unreadMessageIds.length
    },
    messages: async (_, { chatId }, context) => {
      return await prisma.message.findMany({
        where: { chatId },
        include: { sender: true }
      })
    }
  },
  Mutation: {
    sendMessage: async (_, { chatId, senderId, text }, context) => {
      const message = await prisma.message.create({
        data: {
          text,
          sender: { connect: { id: senderId } },
          chat: { connect: { id: chatId } }
        },
        include: { sender: true, chat: true }
      })
      pubsub.publish(`${MESSAGE_SENT}_${chatId}`, { messageSent: message })
      return message
    },
    markMessageAsRead: async (_, { messageId, userId }, context) => {
      const messageRead = await prisma.messageRead.upsert({
        where: {
          messageId_userId: { messageId, userId } // Проверяем уникальность записи
        },
        update: {
          readAt: new Date() // Обновляем время прочтения
        },
        create: {
          messageId,
          userId,
          readAt: new Date()
        }
      })

      return messageRead
    },
    markAllMessagesAsRead: async (_, { chatId, userId }) => {
      const currentTime = new Date()

      // Обновляем время последнего прочтения для пользователя
      await prisma.chatUser.update({
        where: { chatId_userId: { chatId, userId } },
        data: { lastReadMessageAt: currentTime }
      })

      // Обновляем статус `isRead` для сообщений (опционально)
      await prisma.message.updateMany({
        where: {
          chatId,
          createdAt: { lte: currentTime } // Все сообщения до текущего времени
        },
        data: { isRead: true }
      })

      return true
    },
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
    // messageReceived: {
    //   subscribe: (_, { senderId, receiverId }) =>
    //     pubsub.asyncIterator(`MESSAGE_RECEIVED_${receiverId}`),
    //   resolve: (payload) => {
    //     return payload.messageReceived
    //   }
    // },
    newUnreadMessage: {
      subscribe: (_, { chatId, userId }) =>
        pubsub.asyncIterator(`NEW_UNREAD_MESSAGE_${chatId}_${userId}`),
      resolve: (payload) => {
        return payload.newUnreadMessage
      }
    },
    messageRead: {
      subscribe: (_, { chatId }) =>
        pubsub.asyncIterator(`MESSAGE_READ_${chatId}`),
      resolve: (payload) => {
        return payload.messageRead // Возвращаем обновлённое состояние
      }
    }
  },
  Chat: {
    // Участники чата
    participants: async (parent) => {
      const chatUsers = await prisma.chatUser.findMany({
        where: { chatId: parent.id },
        include: { user: true }
      })
      return chatUsers.map((chatUser) => chatUser.user)
    },
    // Количество непрочитанных сообщений для конкретного пользователя
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
    // Сообщения чата
    messages: async (parent) => {
      return await prisma.message.findMany({
        where: { chatId: parent.id },
        include: { sender: true }
      })
    }
  }
}

export default chatResolver

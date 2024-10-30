import { prisma } from "../../prisma.js"
import { pubsub, MESSAGE_SENT } from "../../exports/pubsub.js"

const chatResolver = {
  Query: {
    chats: async (_, { requestId, reserveId }) => {
      const chats = await prisma.chat.findMany({
        where: {
          OR: [requestId ? { requestId } : {}, reserveId ? { reserveId } : {}]
        }
      })
      return chats
    },
    messages: async (_, { chatId }) => {
      return await prisma.message.findMany({
        where: { chatId },
        include: { sender: true }
      })
    }
  },
  Mutation: {
    sendMessage: async (_, { chatId, senderId, text }) => {
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
    createChat: async (_, { requestId, userIds }) => {
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
    }
  },
  Chat: {
    participants: async (parent) => {
      const chatUsers = await prisma.chatUser.findMany({
        where: { chatId: parent.id },
        include: { user: true }
      })

      return chatUsers.map((chatUser) => chatUser.user)
    },
    messages: async (parent) => {
      return await prisma.message.findMany({
        where: { chatId: parent.id },
        include: { sender: true }
      })
    }
  }
}

export default chatResolver

import { prisma } from "../../prisma.js"
import { pubsub } from "../../exports/pubsub.js"

const supportResolver = {
  Query: {
    supportChats: async (_, __, { user }) => {
      // user.support !== null ? { support: user.support } : {}
      // console.log(user)
      if (!user.support) {
        throw new Error("Access denied")
      }
      return await prisma.chat.findMany({
        where: { isSupport: true },
        include: { participants: { include: { user: true } }, messages: true }
      })
    },
    userSupportChat: async (_, { userId }, { user }) => {
      const chat = await prisma.chat.findFirst({
        where: {
          isSupport: true,
          participants: { some: { userId } }
        },
        include: { participants: { include: { user: true } }, messages: true }
      })
      if (!chat) {
        throw new Error("Support chat not found")
      }
      return chat
    }
  },
  Mutation: {
    createSupportChat: async (_, { userId }, { user }) => {
      const existingChat = await prisma.chat.findFirst({
        where: {
          isSupport: true,
          participants: { some: { userId } }
        }
      })
 
      if (existingChat) {
        return existingChat
      }

      const supportUsers = await prisma.user.findMany({
        where: { support: true }
      })

      if (supportUsers.length === 0) {
        throw new Error("No support agents available")
      }

      const chat = await prisma.chat.create({
        data: {
          isSupport: true,
          participants: {
            create: [
              { user: { connect: { id: userId } } },
              ...supportUsers.map((support) => ({
                user: { connect: { id: support.id } }
              }))
            ]
          }
        },
        include: { participants: { include: { user: true } } }
      })

      return chat
    }
  }
}

export default supportResolver

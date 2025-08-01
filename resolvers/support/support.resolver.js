// Импорт Prisma для работы с базой данных и PubSub для публикации событий в реальном времени
import { prisma } from "../../prisma.js"
import { pubsub } from "../../exports/pubsub.js"
import { allMiddleware } from "../../middlewares/authMiddleware.js"

// Резольвер для поддержки (support) чатов.
// Этот резольвер отвечает за получение списка чатов поддержки, создание нового чата поддержки для пользователя,
// а также за поиск чата поддержки, связанного с конкретным пользователем.
const supportResolver = {
  Query: {
    getAllPatchNotes: async (_, __, context) => {
      allMiddleware(context)
      return await prisma.patchNote.findMany({
        orderBy: { date: "desc" }
      })
    },

    getAllDocumentations: async (_, __, context) => {
      allMiddleware(context)
      return await prisma.documentation.findMany({
        orderBy: { name: "desc" }
      })
    },

    getPatchNote: async (_, { id }, context) => {
      allMiddleware(context)
      return await prisma.patchNote.findUnique({
        where: { id }
      })
    },

    getDocumentation: async (_, { id }, context) => {
      allMiddleware(context)
      return await prisma.documentation.findUnique({
        where: { id }
      })
    },
    // Query: supportChats
    // Возвращает список всех чатов поддержки.
    // Доступ разрешён только для пользователей, у которых свойство support задано (например, это агент поддержки).
    // Каждый чат включает участников (participants) с данными о пользователе и сообщения (messages).
    supportChats: async (_, __, context) => {
      allMiddleware(context)
      const { user } = context

      // Если у текущего пользователя нет прав поддержки, выбрасываем ошибку
      if (!user.support) {
        throw new Error("Access denied")
      }
      // Возвращаем все чаты, помеченные как support (isSupport: true), с включением участников и сообщений
      return await prisma.chat.findMany({
        where: { isSupport: true },
        include: {
          participants: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  number: true,
                  images: true,
                  role: true,
                  position: true,
                  airlineId: true,
                  airlineDepartmentId: true,
                  hotelId: true,
                  dispatcher: true
                }
              }
            }
          },
          messages: true
        }
      })
    },

    // Query: userSupportChat
    // Возвращает чат поддержки, связанный с указанным userId.
    // Если чат не найден, создается новый чат поддержки, в который добавляются указанный пользователь и все агенты поддержки.
    userSupportChat: async (_, { userId }, context) => {
      allMiddleware(context)
      // Ищем чат поддержки, где среди участников присутствует пользователь с указанным userId
      let chat = await prisma.chat.findFirst({
        where: {
          isSupport: true,
          participants: { some: { userId } }
        },
        include: {
          participants: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  number: true,
                  images: true,
                  role: true,
                  position: true,
                  airlineId: true,
                  airlineDepartmentId: true,
                  hotelId: true,
                  dispatcher: true
                }
              }
            }
          },
          messages: true
        }
      })
      // Если чат не найден, создаем новый
      if (!chat) {
        // Получаем всех пользователей, имеющих флаг поддержки (support: true)
        const supportUsers = await prisma.user.findMany({
          where: { support: true }
        })
        if (supportUsers.length === 0) {
          throw new Error("No support agents available")
        }
        // Создаем новый чат поддержки, добавляя в качестве участников указанного пользователя и всех агентов поддержки
        chat = await prisma.chat.create({
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
          include: {
            participants: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    number: true,
                    images: true,
                    role: true,
                    position: true,
                    airlineId: true,
                    airlineDepartmentId: true,
                    hotelId: true,
                    dispatcher: true
                  }
                }
              }
            },
            messages: true
          }
        })
      }
      return chat
    }
  },

  Mutation: {
    createPatchNote: async (_, { data }, context) => {
      allMiddleware(context)
      return await prisma.patchNote.create({
        data
      })
    },

    updatePatchNote: async (_, { id, data }, context) => {
      allMiddleware(context)
      return await prisma.patchNote.update({
        where: { id },
        data
      })
    },

    createDocumentation: async (_, { data }, context) => {
      allMiddleware(context)
      return await prisma.documentation.create({
        data
      })
    },

    updateDocumentation: async (_, { id, data }, context) => {
      allMiddleware(context)
      return await prisma.documentation.update({
        where: { id },
        data
      })
    },
    // Mutation: createSupportChat
    // Создает чат поддержки для указанного пользователя (userId).
    // Если чат уже существует для данного пользователя, возвращается существующий чат.
    // Если чат отсутствует, создается новый, куда добавляются указанный пользователь и все агенты поддержки.
    createSupportChat: async (_, { userId }, context) => {
      allMiddleware(context)
      // Проверяем, существует ли уже чат поддержки для данного userId
      const existingChat = await prisma.chat.findFirst({
        where: {
          isSupport: true,
          participants: { some: { userId } }
        }
      })

      if (existingChat) {
        return existingChat
      }

      // Получаем всех пользователей-агентов поддержки
      const supportUsers = await prisma.user.findMany({
        where: { support: true }
      })

      if (supportUsers.length === 0) {
        throw new Error("No support agents available")
      }

      // Создаем новый чат поддержки с участниками: указанный пользователь и все поддерживающие агенты
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
        include: {
          participants: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  number: true,
                  images: true,
                  role: true,
                  position: true,
                  airlineId: true,
                  airlineDepartmentId: true,
                  hotelId: true,
                  dispatcher: true
                }
              }
            }
          }
        }
      })

      return chat
    }
  }
}

export default supportResolver

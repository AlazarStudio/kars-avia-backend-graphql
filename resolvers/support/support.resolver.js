// Импорт Prisma для работы с базой данных и PubSub для публикации событий в реальном времени
import { prisma } from "../../prisma.js"
import { GraphQLError } from "graphql"
import GraphQLUpload from "graphql-upload/GraphQLUpload.mjs"
import { uploadImage } from "../../exports/uploadImage.js"
import { uploadFiles } from "../../exports/uploadFiles.js"
import { pubsub } from "../../exports/pubsub.js"
import {
  allMiddleware,
  superAdminMiddleware
} from "../../middlewares/authMiddleware.js"

// Резольвер для поддержки (support) чатов.
// Этот резольвер отвечает за получение списка чатов поддержки, создание нового чата поддержки для пользователя,
// а также за поиск чата поддержки, связанного с конкретным пользователем.
const supportResolver = {
  Upload: GraphQLUpload,

  Query: {
    getAllPatchNotes: async (_, __, context) => {
      await allMiddleware(context)
      return await prisma.patchNote.findMany({
        orderBy: { date: "desc" }
      })
    },

    getAllDocumentations: async (_, __, context) => {
      await allMiddleware(context)
      return await prisma.documentation.findMany({
        orderBy: { name: "desc" },
        include: { children: true, parent: true }
      })
    },

    getPatchNote: async (_, { id }, context) => {
      await allMiddleware(context)
      return await prisma.patchNote.findUnique({
        where: { id }
      })
    },

    getDocumentation: async (_, { id }, context) => {
      await allMiddleware(context)
      const doc = await prisma.documentation.findUnique({ where: { id } })
      if (!doc) throw new GraphQLError("Документация не найдена")
      return doc
    },
    documentationTree: async (_, { id }, context) => {
      await allMiddleware(context) // проверка авторизации
      const tree = await buildDocumentationTree(id)
      return tree // возвращаем JSON
    },
    // Query: supportChats
    // Возвращает список всех чатов поддержки.
    // Доступ разрешён только для пользователей, у которых свойство support задано (например, это агент поддержки).
    // Каждый чат включает участников (participants) с данными о пользователе и сообщения (messages).
    supportChats: async (_, __, context) => {
      await allMiddleware(context)
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
      await allMiddleware(context)
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
    createPatchNote: async (_, { data, images }, context) => {
      await superAdminMiddleware(context)

      let imagePaths = []
      if (images && images.length > 0) {
        for (const image of images) {
          const uploadedPath = await uploadImage(image)
          imagePaths.push(uploadedPath)
        }
      }

      return await prisma.patchNote.create({
        data: { data, imagePaths }
      })
    },

    updatePatchNote: async (_, { id, data, images }, context) => {
      await superAdminMiddleware(context)

      let imagePaths = []
      if (images && images.length > 0) {
        for (const image of images) {
          const uploadedPath = await uploadImage(image)
          imagePaths.push(uploadedPath)
        }
      }

      return await prisma.patchNote.update({
        where: { id },
        data: { data, imagePaths }
      })
    },

    createDocumentation: async (_, { data: input, images }, context) => {
      await superAdminMiddleware(context)

      const data = prepareCreateInput(input)

      let imagePaths = []
      if (images && images.length > 0) {
        for (const image of images) {
          const uploadedPath = await uploadImage(image)
          imagePaths.push(uploadedPath)
        }
      }

      if (!data.name) {
        throw new GraphQLError("Поле 'name' обязательно")
      }

      return await prisma.documentation.create({
        data: { data, images: imagePaths /*files: filePath*/ },
        include: { children: true, parent: true }
      })
    },
    updateDocumentation: async (_, { id, data, images }, context) => {
      await superAdminMiddleware(context)
      const exists = await prisma.documentation.findUnique({ where: { id } })
      if (!exists) throw new GraphQLError("Документация не найдена")

      if (data.parentId && data.parentId === id) {
        throw new GraphQLError("Элемент не может быть своим же родителем")
      }

      if (input.parentId) {
        const descendants = await getDescendantIds(id)
        if (descendants.includes(input.parentId)) {
          throw new GraphQLError(
            "Нельзя установить потомка в качестве родителя"
          )
        }
      }

      let imagePaths = []
      if (images && images.length > 0) {
        for (const image of images) {
          const uploadedPath = await uploadImage(image)
          imagePaths.push(uploadedPath)
        }
      }

      return await prisma.documentation.update({
        where: { id },
        data: { data, imagePaths }
      })
    },
    // 🔁 Переместить элемент
    moveDocumentation: async (_, { id, newParentId, newOrder }, context) => {
      await superAdminMiddleware(context)
      const doc = await prisma.documentation.findUnique({ where: { id } })
      if (!doc) throw new GraphQLError("Документация не найдена")

      // 🛑 Сам себе родитель
      if (newParentId === id) {
        throw new GraphQLError("Элемент не может быть своим же родителем")
      }

      // 🛑 Потомок как родитель
      if (newParentId) {
        const descendants = await getDescendantIds(id)
        if (descendants.includes(newParentId)) {
          throw new GraphQLError(
            "Нельзя установить потомка в качестве родителя"
          )
        }
      }

      // 1. Получаем всех соседей нового родителя, кроме текущего элемента
      const siblings = await prisma.documentation.findMany({
        where: {
          parentId: newParentId ?? null,
          NOT: { id }
        },
        orderBy: { order: "asc" }
      })

      // 2. Вставляем наш элемент на позицию newOrder, остальным — сдвиг
      const reordered = [
        ...siblings.slice(0, newOrder),
        { ...doc, id }, // временно вставляем текущий, для понимания позиции
        ...siblings.slice(newOrder)
      ]

      // 3. Обновляем порядок у всех
      const updatePromises = reordered.map((item, index) => {
        return prisma.documentation.update({
          where: { id: item.id },
          data: { order: index }
        })
      })

      await Promise.all(updatePromises)

      // 4. Обновляем parentId (отдельно, если он изменился)
      const updated = await prisma.documentation.update({
        where: { id },
        data: {
          parentId: newParentId ?? null
        }
      })

      return updated
    },
    deleteDocumentation: async (_, { id }) => {
      await superAdminMiddleware(context)
      const exists = await prisma.documentation.findUnique({ where: { id } })
      if (!exists) throw new GraphQLError("Документация не найдена")

      // Опционально: каскадно удалить детей — не забудь, что Prisma не делает это по умолчанию
      const children = await prisma.documentation.findMany({
        where: { parentId: id }
      })
      if (children.length > 0) {
        throw new GraphQLError("Сначала удалите дочерние элементы")
      }

      await prisma.documentation.delete({ where: { id } })
      return true
    },
    createSupportChat: async (_, { userId }, context) => {
      await allMiddleware(context)
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
  },
  Documentation: {
    parent: async (doc) => {
      if (!doc.parentId) return null
      return await prisma.documentation.findUnique({
        where: { id: doc.parentId }
      })
    },
    children: async (doc) => {
      return await prisma.documentation.findMany({
        where: { parentId: doc.id },
        orderBy: { order: "asc" }
      })
    }
  }
}

// рекурсивно получаем всех потомков
async function getDescendantIds(id) {
  const children = await prisma.documentation.findMany({
    where: { parentId: id }
  })
  let ids = children.map((c) => c.id)
  for (const child of children) {
    const childDescendants = await getDescendantIds(child.id)
    ids = ids.concat(childDescendants)
  }
  return ids
}

async function buildDocumentationTree(id) {
  const rootDoc = await prisma.documentation.findUnique({
    where: { id },
    select: {
      id: true,
      parentId: true,
      name: true,
      description: true,
      type: true,
      order: true,
      files: true
    }
  })

  if (!rootDoc) return null

  const children = await prisma.documentation.findMany({
    where: { parentId: rootDoc.id },
    select: {
      id: true,
      parentId: true,
      name: true,
      description: true,
      type: true,
      order: true,
      files: true
    },
    orderBy: { order: "asc" }
  })

  const childrenTree = await Promise.all(
    children.map((child) => buildDocumentationTree(child.id))
  )

  return { ...rootDoc, children: childrenTree }
}

function prepareCreateInput(node) {
  if (!node || typeof node !== "object") return {}

  const { children, ...rest } = node

  const cleaned = {
    ...rest,
    children:
      Array.isArray(children) && children.length > 0
        ? {
            create: children
              .map(prepareCreateInput)
              .filter((child) => child && child.name)
          }
        : undefined
  }

  return cleaned
}

export default supportResolver

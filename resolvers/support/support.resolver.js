// Импорт Prisma для работы с базой данных и PubSub для публикации событий в реальном времени
import { prisma } from "../../prisma.js"
import { GraphQLError } from "graphql"
import GraphQLUpload from "graphql-upload/GraphQLUpload.mjs"
import { deleteImage, uploadImage } from "../../exports/uploadImage.js"
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
        where: { parentId: { not: { not: null } } }, // ← только корневые
        orderBy: { name: "asc" } // можно "asc", если нужен алфавит
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
        data: { ...data, images: imagePaths }
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
        data: { ...data, images: imagePaths }
      })
    },

    createDocumentation: async (_, { data: input, imageGroupsByKey }, ctx) => {
      await superAdminMiddleware(ctx)

      const keyMap = {}
      for (const grp of imageGroupsByKey ?? []) {
        keyMap[grp.key] = []
        for (const img of grp.images)
          keyMap[grp.key].push(await uploadImage(img))
      }

      function transform(node) {
        const { children, clientKey, ...rest } = node
        const currentImages =
          clientKey && keyMap[clientKey] ? keyMap[clientKey] : []
        const out = {
          ...rest,
          ...(currentImages.length ? { images: currentImages } : {})
        }
        if (Array.isArray(children) && children.length) {
          out.children = { create: children.map(transform) }
        }
        return out
      }

      const data = transform(input)
      return prisma.documentation.create({
        data,
        include: { children: true, parent: true }
      })
    },

    updateDocumentation: async (
      _,
      { id, data, imageGroupsByKey, pruneMissingChildren },
      context
    ) => {
      await superAdminMiddleware(context)

      const root = await prisma.documentation.findUnique({ where: { id } })
      if (!root) throw new GraphQLError("Документация не найдена")

      // ---------- 1) Загрузка новых картинок: key -> [url] ----------
      const keyToNewUrls = {}
      if (Array.isArray(imageGroupsByKey)) {
        for (const grp of imageGroupsByKey) {
          const urls = []
          for (const img of grp.images ?? []) {
            urls.push(await uploadImage(img))
          }
          keyToNewUrls[grp.key] = urls
        }
      }

      // ---------- 2) Снять текущую «снимок» поддерева (clientKey, images, parentId) ----------
      const existingNodes = await fetchSubtreeByRoot(id) // массив узлов
      // строим полезные мапы
      const keyToExisting = new Map()
      for (const n of existingNodes) {
        if (n.clientKey) keyToExisting.set(n.clientKey, n)
      }
      // также добавим сам корень (вдруг у корня есть clientKey)
      if (root.clientKey)
        keyToExisting.set(root.clientKey, {
          id: root.id,
          clientKey: root.clientKey,
          parentId: root.parentId,
          images: root.images ?? []
        })

      // ---------- 3) Собрать множество ключей, которые должны ОСТАТЬСЯ ----------
      const keepKeys = new Set()
      ;(function collectKeys(node) {
        if (!node) return
        if (node.clientKey) keepKeys.add(node.clientKey)
        for (const ch of node.children ?? []) collectKeys(ch)
      })(data)

      // ---------- 4) Построить nested upsert по clientKey (с заменой картинок) ----------
      function buildNestedUpserts(node) {
        const { children, clientKey, ...rest } = node ?? {}
        const newUrls =
          clientKey && keyToNewUrls[clientKey] ? keyToNewUrls[clientKey] : []

        // Для замены изображений используем set; если нужно дополнять — поменяй на push
        const updateSelf = {
          ...rest,
          ...(newUrls.length ? { images: { set: newUrls } } : {})
        }

        const createSelf = {
          ...rest,
          ...(clientKey ? { clientKey } : {}),
          ...(newUrls.length ? { images: newUrls } : {})
        }

        let childUpserts = []
        if (Array.isArray(children) && children.length) {
          childUpserts = children.map((ch, index) => {
            const built = buildNestedUpserts(ch)
            if (!built.clientKey) {
              throw new GraphQLError(
                "Для дочерних узлов при обновлении обязателен clientKey"
              )
            }
            // гарантируем order по индексу
            built.update.order ??= index
            built.create.order ??= index
            return {
              where: { clientKey: built.clientKey },
              update: built.update,
              create: built.create
            }
          })
        }

        const update = {
          ...updateSelf,
          ...(childUpserts.length ? { children: { upsert: childUpserts } } : {})
        }

        const create = {
          ...createSelf,
          ...(childUpserts.length
            ? { children: { create: childUpserts.map((u) => u.create) } }
            : {})
        }

        return { clientKey, update, create }
      }

      const built = buildNestedUpserts(data || {})

      // ---------- 5) Посчитать какие ключи/узлы нужно УДАЛИТЬ (если pruneMissingChildren=true) ----------
      let keysToDelete = []
      if (pruneMissingChildren) {
        // Все существующие в поддереве (кроме корня, если у корня нет clientKey)
        const existingKeys = new Set(
          existingNodes.map((n) => n.clientKey).filter(Boolean)
        )
        // Если у корня есть key — он тоже в existingKeys
        if (root.clientKey) existingKeys.add(root.clientKey)

        // Удаляем всё, чего нет в keepKeys (НО корень не трогаем)
        keysToDelete = [...existingKeys].filter((k) => !keepKeys.has(k))
        // На всякий случай исключим ключ корня
        if (root.clientKey) {
          keysToDelete = keysToDelete.filter((k) => k !== root.clientKey)
        }
      }

      // ---------- 6) Вычислить список файлов к удалению ----------
      // 6.1. Файлы удаляемых узлов (включая их потомков)
      const imagesFromDeletedNodes = []
      for (const key of keysToDelete) {
        const node = keyToExisting.get(key)
        if (node?.images?.length) imagesFromDeletedNodes.push(...node.images)
      }

      // 6.2. Файлы заменённых картинок у оставшихся узлов: старые - новые
      const imagesFromReplaced = []
      for (const [key, newUrls] of Object.entries(keyToNewUrls)) {
        const node = keyToExisting.get(key)
        if (!node) continue
        const oldSet = new Set(node.images ?? [])
        for (const oldUrl of oldSet) {
          if (!newUrls.includes(oldUrl)) {
            imagesFromReplaced.push(oldUrl)
          }
        }
      }

      const imagesToDelete = dedupe([
        ...imagesFromDeletedNodes,
        ...imagesFromReplaced
      ])

      // ---------- 7) Обновление БД: сначала upsert дерева, затем deleteMany по keysToDelete ----------
      // ВАЖНО: если у тебя есть триггеры/внешние ключи — может понадобиться каскадное удаление в БД
      const updated = await prisma.$transaction(async (tx) => {
        // апдейт корня
        const updatedRoot = await tx.documentation.update({
          where: { id },
          data: built.update,
          include: { children: true, parent: true }
        })

        // если нужно удалять отсутствующих — делаем это после upsert
        if (keysToDelete.length) {
          await tx.documentation.deleteMany({
            where: {
              clientKey: { in: keysToDelete }
            }
          })
        }

        return updatedRoot
      })

      // ---------- 8) Удаляем файлы на диске (после успешной транзакции) ----------
      for (const p of imagesToDelete) {
        try {
          await deleteImage(p)
        } catch (e) {
          /* логируй при необходимости */
        }
      }

      return updated
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

function dedupe(arr) {
  return Array.from(new Set(arr.filter(Boolean)))
}

// Забираем всё поддерево под корнем id (плоским списком)
async function fetchSubtreeByRoot(rootId) {
  const out = []
  const queue = [rootId]

  while (queue.length) {
    const parentId = queue.shift()
    const kids = await prisma.documentation.findMany({
      where: { parentId },
      select: { id: true, parentId: true, clientKey: true, images: true }
    })
    out.push(...kids)
    for (const k of kids) queue.push(k.id)
  }

  return out
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
      files: true,
      images: true
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
      files: true,
      images: true
    },
    orderBy: { order: "asc" }
  })

  const childrenTree = await Promise.all(
    children.map((child) => buildDocumentationTree(child.id))
  )

  return { ...rootDoc, children: childrenTree }
}

function sanitizeTreeInput(node) {
  if (!node || typeof node !== "object") return {}
  const { images, files, children, ...rest } = node // Вырезаем files/images из input
  return {
    ...rest,
    ...(Array.isArray(children) && children.length > 0
      ? { children: { create: children.map(sanitizeTreeInput) } }
      : {})
  }
}

export default supportResolver

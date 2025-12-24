import { prisma } from "../../prisma.js"
import {
  pubsub,
  TRANSFER_CREATED,
  TRANSFER_UPDATED,
  TRANSFER_MESSAGE_SENT,
  TRANSFER_MESSAGE_READ
} from "../../services/infra/pubsub.js"
import { allMiddleware } from "../../middlewares/authMiddleware.js"
import { GraphQLError } from "graphql"
import { withFilter } from "graphql-subscriptions"

const transferResolver = {
  Query: {
    transfers: async (_, { pagination }, context) => {
      const {
        skip,
        take,
        all,
        driverId,
        personId,
        dispatcherId,
        organizationId,
        airlineId
      } = pagination

      let whereInput = {}

      if (driverId != undefined) {
        whereInput.driverId = driverId
      }
      if (personId != undefined) {
        whereInput.personId = personId
      }
      if (dispatcherId != undefined) {
        whereInput.dispatcherId = dispatcherId
      }
      if (organizationId != undefined) {
        whereInput.organizationId = organizationId
      }
      if (airlineId != undefined) {
        whereInput.airlineId = airlineId
      }

      const transfers = all
        ? await prisma.transfer.findMany({
            where: whereInput
          }) // добавить позже фильтрацию
        : await prisma.transfer.findMany({
            where: whereInput,
            skip: skip,
            take: take
          })

      const totalCount = await prisma.transfer.count({ where: whereInput })

      return { transfers, totalCount }
    },
    transfer: async (_, { id }) => {
      const transfer = await prisma.transfer.findUnique({
        // Находим transfer по id
        where: { id: id },
        include: { driver: true, persons: true }
      })

      const dateKeys = [
        "scheduledPickupAt",
        "driverAssignmentAt",
        "orderAcceptanceAt",
        "arrivedToPassengerAt",
        "departedAt",
        "arrivedAt",
        "finishedAt",
        "createdAt",
        "updatedAt"
      ]

      return transfer
    },
    transferChat: async (_, { chatId }, context) => {
      await allMiddleware(context)
      return await prisma.transferChat.findUnique({
        where: { id: chatId },
        include: {
          messages: {
            include: {
              senderUser: true,
              senderDriver: true,
              senderPersonal: true,
              readBy: true
            },
            orderBy: { createdAt: "asc" }
          }
        }
      })
    },
    transferChats: async (_, { transferId }, context) => {
      await allMiddleware(context)
      return await prisma.transferChat.findMany({
        where: { transferId },
        include: {
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1
          }
        },
        orderBy: { createdAt: "asc" }
      })
    },
    transferMessages: async (_, { chatId }, context) => {
      await allMiddleware(context)
      return await prisma.transferMessage.findMany({
        where: { chatId },
        include: {
          senderUser: true,
          senderDriver: true,
          senderPersonal: true,
          readBy: true
        },
        orderBy: { createdAt: "asc" }
      })
    },
    transferChatByType: async (_, { transferId, type }, context) => {
      await allMiddleware(context)
      return await prisma.transferChat.findUnique({
        where: {
          transferId_type: {
            transferId,
            type
          }
        },
        include: {
          messages: {
            include: {
              senderUser: true,
              senderDriver: true,
              senderPersonal: true,
              readBy: true
            },
            orderBy: { createdAt: "asc" }
          }
        }
      })
    }
  },
  Mutation: {
    createTransfer: async (_, { input }, context) => {
      const {
        dispatcherId,
        driverId,
        personsId,
        airlineId: inputAirlineId,
        ...restInput
      } = input

      const dateFields = [
        "scheduledPickupAt",
        "driverAssignmentAt",
        "orderAcceptanceAt",
        "arrivedToPassengerAt",
        "departedAt",
        "arrivedAt",
        "finishedAt",
        "createdAt",
        "updatedAt"
      ]

      const data = {}

      const ctxAirlineId = context.user?.airlineId || null
      let finalAirlineId = ctxAirlineId || inputAirlineId || null

      if (ctxAirlineId && inputAirlineId && ctxAirlineId !== inputAirlineId) {
        throw new Error("Forbidden: airlineId mismatch with current user")
      }

      if (!finalAirlineId) {
        throw new Error("airlineId is required")
      }

      for (let key in restInput) {
        if (restInput[key] === undefined || restInput[key] === null) continue

        if (dateFields.includes(key)) {
          data[key] = new Date(restInput[key])
        } else {
          data[key] = restInput[key]
        }
      }

      // связи dispatcher/driver
      if (dispatcherId) {
        data.dispatcher = { connect: { id: dispatcherId } }
      }
      if (driverId) {
        data.driver = { connect: { id: driverId } }
      }

      data.airline = { connect: { id: finalAirlineId } }

      // ПАССАЖИРЫ: personsId -> persons.create(...)
      if (Array.isArray(personsId) && personsId.length) {
        data.persons = {
          create: personsId.map((personalId) => ({
            personal: { connect: { id: personalId } } // TransferPassenger.personalId
          }))
        }
      }

      const newTransfer = await prisma.transfer.create({
        data
        // если нужно сразу вернуть связанные сущности:
        // include: { driver: true, dispatcher: true, persons: { include: { personal: true } } }
      })

      // Создание чата для заявки
      // const newChat = await prisma.chat.create({
      //   data: {
      //     passengerRequest: { connect: { id: newTransfer.id } },
      //     // separator: "transfer",
      //     // airline: { connect: { id: airlineId } }
      //   }
      // })

      // // Добавление отправителя в созданный чат
      // await prisma.chatUser.create({
      //   data: {
      //     chat: { connect: { id: newChat.id } },
      //     user: { connect: { id: senderId } }
      //   }
      // })

      // Автоматическое создание чатов
      await ensureTransferChats(newTransfer)

      pubsub.publish(TRANSFER_CREATED, { transferCreated: newTransfer })

      return newTransfer
    },
    updateTransfer: async (_, { id, input }, context) => {
      const existing = await prisma.transfer.findUnique({ where: { id } })
      if (!existing) {
        throw new Error(`Transfer с id ${id} не найден`)
      }

      const { dispatcherId, driverId, personsId, ...restInput } = input

      const data = {}

      // скаляры + даты
      for (const key in restInput) {
        const value = restInput[key]
        if (value === undefined) continue // не трогаем поле

        if (DATE_FIELDS.includes(key)) {
          data[key] = value === null ? null : new Date(value) // null = очистить дату
        } else {
          data[key] = value
        }
      }

      // связь с диспетчером
      if (dispatcherId !== undefined) {
        data.dispatcher =
          dispatcherId === null
            ? { disconnect: true } // убрать диспетчера
            : { connect: { id: dispatcherId } }
      }

      // связь с водителем
      if (driverId !== undefined) {
        data.driver =
          driverId === null
            ? { disconnect: true } // убрать водителя
            : { connect: { id: driverId } }
      }

      // ПАССАЖИРЫ (полная замена)
      if (Array.isArray(personsId) && personsId.length) {
        data.persons = {
          deleteMany: {}, // удалить ВСЕ старые связи
          create: personsId.map((personalId) => ({
            personal: { connect: { id: personalId } }
          }))
        }
      }

      const updatedTransfer = await prisma.transfer.update({
        where: { id }, // если id числовой — Number(id)
        data
      })

      pubsub.publish(TRANSFER_UPDATED, { transferUpdated: updatedTransfer })

      // Автоматическое создание чатов при обновлении трансфера
      await ensureTransferChats(updatedTransfer)

      return updatedTransfer
    },
    createTransferChat: async (_, { input }, context) => {
      await allMiddleware(context)
      const { transferId, type, dispatcherId, driverId, personalId } = input

      // Проверяем, что трансфер существует
      const transfer = await prisma.transfer.findUnique({
        where: { id: transferId },
        include: {
          dispatcher: true,
          driver: true,
          persons: { include: { personal: true } }
        }
      })

      if (!transfer) {
        throw new GraphQLError(`Transfer с id ${transferId} не найден`, {
          extensions: { code: "NOT_FOUND" }
        })
      }

      // Проверяем, что чат такого типа еще не существует
      // Для DISPATCHER_PERSONAL и DRIVER_PERSONAL проверяем с personalId
      let existingChat = null
      if (type === "DISPATCHER_PERSONAL" || type === "DRIVER_PERSONAL") {
        if (!personalId) {
          throw new GraphQLError(
            `personalId обязателен для типа чата ${type}`,
            {
              extensions: { code: "INVALID_INPUT" }
            }
          )
        }
        existingChat = await prisma.transferChat.findUnique({
          where: {
            transferId_type_personalId: {
              transferId,
              type,
              personalId
            }
          }
        })
      } else {
        // Для DISPATCHER_DRIVER personalId должен быть null
        // Используем findFirst, так как findUnique не работает с null в составном ключе
        existingChat = await prisma.transferChat.findFirst({
          where: {
            transferId,
            type,
            personalId: null
          }
        })
      }

      if (existingChat) {
        throw new GraphQLError(
          `Чат типа ${type} уже существует для этого трансфера`,
          {
            extensions: { code: "ALREADY_EXISTS" }
          }
        )
      }

      // Определяем участников на основе типа чата
      const chatData = {
        transfer: { connect: { id: transferId } },
        type
      }

      // Устанавливаем участников в зависимости от типа чата
      if (type === "DISPATCHER_DRIVER") {
        if (!transfer.dispatcherId || !transfer.driverId) {
          throw new GraphQLError(
            "Для создания чата DISPATCHER_DRIVER нужны и диспетчер, и водитель",
            {
              extensions: { code: "INVALID_INPUT" }
            }
          )
        }
        chatData.dispatcher = { connect: { id: transfer.dispatcherId } }
        chatData.driver = { connect: { id: transfer.driverId } }
      } else if (type === "DISPATCHER_PERSONAL") {
        // personalId обязателен для DISPATCHER_PERSONAL
        if (!personalId) {
          throw new GraphQLError(
            "Для создания чата DISPATCHER_PERSONAL нужен пассажир (personalId)",
            {
              extensions: { code: "INVALID_INPUT" }
            }
          )
        }
        // dispatcherId опционален - если null, чат доступен всем диспетчерам
        if (transfer.dispatcherId) {
          chatData.dispatcher = { connect: { id: transfer.dispatcherId } }
        }
        chatData.personal = { connect: { id: personalId } }
      } else if (type === "DRIVER_PERSONAL") {
        if (!transfer.driverId) {
          throw new GraphQLError(
            "Для создания чата DRIVER_PERSONAL нужен водитель",
            {
              extensions: { code: "INVALID_INPUT" }
            }
          )
        }
        if (!personalId) {
          throw new GraphQLError(
            "Для создания чата DRIVER_PERSONAL нужен пассажир (personalId)",
            {
              extensions: { code: "INVALID_INPUT" }
            }
          )
        }
        chatData.driver = { connect: { id: transfer.driverId } }
        chatData.personal = { connect: { id: personalId } }
      }

      const newChat = await prisma.transferChat.create({
        data: chatData,
        include: {
          dispatcher: true,
          driver: true,
          personal: true,
          messages: true
        }
      })

      return newChat
    },
    sendTransferMessage: async (_, { input }, context) => {
      await allMiddleware(context)
      const {
        chatId,
        text,
        authorType,
        senderUserId,
        senderDriverId,
        senderPersonalId
      } = input

      // Проверяем, что чат существует
      const chat = await prisma.transferChat.findUnique({
        where: { id: chatId },
        include: { transfer: true }
      })

      if (!chat) {
        throw new GraphQLError(`Chat с id ${chatId} не найден`, {
          extensions: { code: "NOT_FOUND" }
        })
      }

      // Валидация автора в зависимости от типа
      let messageData = {
        chat: { connect: { id: chatId } },
        text,
        authorType,
        isRead: false
      }

      if (authorType === "USER") {
        if (!senderUserId) {
          throw new GraphQLError(
            "senderUserId обязателен для authorType USER",
            {
              extensions: { code: "INVALID_INPUT" }
            }
          )
        }
        // Проверяем, что пользователь является участником чата
        if (chat.dispatcherId !== senderUserId) {
          throw new GraphQLError(
            "Пользователь не является участником этого чата",
            {
              extensions: { code: "FORBIDDEN" }
            }
          )
        }
        messageData.senderUser = { connect: { id: senderUserId } }
      } else if (authorType === "DRIVER") {
        if (!senderDriverId) {
          throw new GraphQLError(
            "senderDriverId обязателен для authorType DRIVER",
            {
              extensions: { code: "INVALID_INPUT" }
            }
          )
        }
        if (chat.driverId !== senderDriverId) {
          throw new GraphQLError("Водитель не является участником этого чата", {
            extensions: { code: "FORBIDDEN" }
          })
        }
        messageData.senderDriver = { connect: { id: senderDriverId } }
      } else if (authorType === "PERSONAL") {
        if (!senderPersonalId) {
          throw new GraphQLError(
            "senderPersonalId обязателен для authorType PERSONAL",
            {
              extensions: { code: "INVALID_INPUT" }
            }
          )
        }
        if (chat.personalId !== senderPersonalId) {
          throw new GraphQLError("Пассажир не является участником этого чата", {
            extensions: { code: "FORBIDDEN" }
          })
        }
        messageData.senderPersonal = { connect: { id: senderPersonalId } }
      }

      const message = await prisma.transferMessage.create({
        data: messageData,
        include: {
          senderUser: true,
          senderDriver: true,
          senderPersonal: true,
          chat: {
            include: {
              transfer: true
            }
          }
        }
      })

      // Автоматически помечаем сообщение как прочитанное отправителем
      await prisma.transferMessageRead.create({
        data: {
          message: { connect: { id: message.id } },
          readerType: authorType,
          ...(authorType === "USER" && {
            user: { connect: { id: senderUserId } }
          }),
          ...(authorType === "DRIVER" && {
            driver: { connect: { id: senderDriverId } }
          }),
          ...(authorType === "PERSONAL" && {
            personal: { connect: { id: senderPersonalId } }
          })
        }
      })

      // Публикуем событие с transferId для удобной фильтрации
      pubsub.publish(TRANSFER_MESSAGE_SENT, {
        transferMessageSent: {
          ...message,
          transferId: chat.transferId
        }
      })

      // Публикуем обновление трансфера
      const updatedTransfer = await prisma.transfer.findUnique({
        where: { id: chat.transferId },
        include: { chats: true }
      })
      pubsub.publish(TRANSFER_UPDATED, { transferUpdated: updatedTransfer })

      return message
    },
    markTransferMessageAsRead: async (_, { input }, context) => {
      await allMiddleware(context)
      const { messageId, readerType, userId, driverId, personalId } = input

      // Проверяем существование сообщения
      const message = await prisma.transferMessage.findUnique({
        where: { id: messageId },
        include: { chat: true }
      })

      if (!message) {
        throw new GraphQLError(`Message с id ${messageId} не найден`, {
          extensions: { code: "NOT_FOUND" }
        })
      }

      // Проверяем, не прочитано ли уже это сообщение этим читателем
      const existingRead = await prisma.transferMessageRead.findFirst({
        where: {
          messageId,
          readerType,
          ...(readerType === "USER" && userId && { userId }),
          ...(readerType === "DRIVER" && driverId && { driverId }),
          ...(readerType === "PERSONAL" && personalId && { personalId })
        }
      })

      if (existingRead) {
        // Обновляем время прочтения
        const updatedRead = await prisma.transferMessageRead.update({
          where: { id: existingRead.id },
          data: { readAt: new Date() }
        })

        pubsub.publish(TRANSFER_MESSAGE_READ, {
          transferMessageRead: updatedRead
        })

        return updatedRead
      }

      // Создаем новую запись о прочтении
      const readData = {
        message: { connect: { id: messageId } },
        readerType,
        readAt: new Date()
      }

      if (readerType === "USER" && userId) {
        readData.user = { connect: { id: userId } }
      } else if (readerType === "DRIVER" && driverId) {
        readData.driver = { connect: { id: driverId } }
      } else if (readerType === "PERSONAL" && personalId) {
        readData.personal = { connect: { id: personalId } }
      } else {
        throw new GraphQLError(
          "Необходимо указать userId, driverId или personalId в соответствии с readerType",
          {
            extensions: { code: "INVALID_INPUT" }
          }
        )
      }

      const messageRead = await prisma.transferMessageRead.create({
        data: readData,
        include: {
          user: true,
          driver: true,
          personal: true,
          message: {
            include: {
              chat: true
            }
          }
        }
      })

      // Обновляем статус isRead сообщения, если все участники прочитали
      const chat = await prisma.transferChat.findUnique({
        where: { id: message.chatId },
        include: {
          messages: {
            include: {
              readBy: true
            }
          }
        }
      })

      // Проверяем, все ли участники прочитали сообщение
      const participants = []
      if (chat.dispatcherId)
        participants.push({ type: "USER", id: chat.dispatcherId })
      if (chat.driverId)
        participants.push({ type: "DRIVER", id: chat.driverId })
      if (chat.personalId)
        participants.push({ type: "PERSONAL", id: chat.personalId })

      const readByCurrentMessage = await prisma.transferMessageRead.findMany({
        where: { messageId }
      })

      const allRead = participants.every((participant) => {
        return readByCurrentMessage.some(
          (read) =>
            read.readerType === participant.type &&
            (read.userId === participant.id ||
              read.driverId === participant.id ||
              read.personalId === participant.id)
        )
      })

      if (allRead) {
        await prisma.transferMessage.update({
          where: { id: messageId },
          data: { isRead: true }
        })
      }

      pubsub.publish(TRANSFER_MESSAGE_READ, {
        transferMessageRead: messageRead
      })

      return messageRead
    },
    markAllTransferMessagesAsRead: async (
      _,
      { chatId, readerType, userId, driverId, personalId },
      context
    ) => {
      await allMiddleware(context)

      // Проверяем существование чата
      const chat = await prisma.transferChat.findUnique({
        where: { id: chatId }
      })

      if (!chat) {
        throw new GraphQLError(`Chat с id ${chatId} не найден`, {
          extensions: { code: "NOT_FOUND" }
        })
      }

      // Получаем все сообщения в чате
      const messages = await prisma.transferMessage.findMany({
        where: { chatId }
      })

      const currentTime = new Date()
      const readPromises = []

      for (const message of messages) {
        // Проверяем, существует ли уже запись о прочтении
        const existingRead = await prisma.transferMessageRead.findFirst({
          where: {
            messageId: message.id,
            readerType,
            ...(readerType === "USER" && userId && { userId }),
            ...(readerType === "DRIVER" && driverId && { driverId }),
            ...(readerType === "PERSONAL" && personalId && { personalId })
          }
        })

        if (existingRead) {
          // Обновляем время прочтения
          readPromises.push(
            prisma.transferMessageRead.update({
              where: { id: existingRead.id },
              data: { readAt: currentTime }
            })
          )
        } else {
          // Создаем новую запись
          const readData = {
            message: { connect: { id: message.id } },
            readerType,
            readAt: currentTime
          }

          if (readerType === "USER" && userId) {
            readData.user = { connect: { id: userId } }
          } else if (readerType === "DRIVER" && driverId) {
            readData.driver = { connect: { id: driverId } }
          } else if (readerType === "PERSONAL" && personalId) {
            readData.personal = { connect: { id: personalId } }
          }

          readPromises.push(
            prisma.transferMessageRead.create({ data: readData })
          )
        }
      }

      await Promise.all(readPromises)

      // Обновляем статус isRead для всех сообщений
      await prisma.transferMessage.updateMany({
        where: { chatId },
        data: { isRead: true }
      })

      return true
    }
  },
  Subscription: {
    transferCreated: {
      subscribe: withFilter(
        () => pubsub.asyncIterator([TRANSFER_CREATED]),
        (payload, variables, context) => {
          const { subject, subjectType } = context

          if (!subject) return false

          const transfer = payload.transferCreated

          // SUPERADMIN и диспетчеры видят все
          if (
            subjectType === "USER" &&
            (subject.role === "SUPERADMIN" || subject.dispatcher === true)
          ) {
            return true
          }

          // Проверяем права по airlineId
          if (
            subjectType === "USER" &&
            subject.airlineId &&
            transfer.airlineId === subject.airlineId
          ) {
            return true
          }

          // Водители видят свои трансферы
          if (subjectType === "DRIVER" && transfer.driverId === subject.id) {
            return true
          }

          // Проверяем, является ли персонал пассажиром
          if (subjectType === "AIRLINE_PERSONAL" && transfer.persons) {
            const isPassenger = transfer.persons.some(
              (person) => person.personalId === subject.id
            )
            if (isPassenger) return true
          }

          return false
        }
      )
    },
    transferUpdated: {
      subscribe: withFilter(
        () => pubsub.asyncIterator([TRANSFER_UPDATED]),
        (payload, variables, context) => {
          const { subject, subjectType } = context

          if (!subject) return false

          const transfer = payload.transferUpdated

          // SUPERADMIN и диспетчеры видят все
          if (
            subjectType === "USER" &&
            (subject.role === "SUPERADMIN" || subject.dispatcher === true)
          ) {
            return true
          }

          // Проверяем права по airlineId
          if (
            subjectType === "USER" &&
            subject.airlineId &&
            transfer.airlineId === subject.airlineId
          ) {
            return true
          }

          // Водители видят свои трансферы
          if (subjectType === "DRIVER" && transfer.driverId === subject.id) {
            return true
          }

          // Проверяем, является ли персонал пассажиром
          if (subjectType === "AIRLINE_PERSONAL" && transfer.persons) {
            const isPassenger = transfer.persons.some(
              (person) => person.personalId === subject.id
            )
            if (isPassenger) return true
          }

          return false
        }
      )
    },
    transferMessageSent: {
      subscribe: withFilter(
        (_, { transferId }) => pubsub.asyncIterator(TRANSFER_MESSAGE_SENT),
        async (payload, variables, context) => {
          const message = payload.transferMessageSent

          // Получаем transferId из сообщения (теперь он передается в payload)
          const messageTransferId =
            message.transferId || (message.chat && message.chat.transferId)

          // Фильтруем по transferId
          if (
            variables.transferId &&
            messageTransferId !== variables.transferId
          ) {
            return false
          }

          // Проверяем права доступа на основе контекста
          const { subject, subjectType } = context

          if (!subject) return false

          // SUPERADMIN и диспетчеры видят все
          if (
            subjectType === "USER" &&
            (subject.role === "SUPERADMIN" || subject.dispatcher === true)
          ) {
            return true
          }

          // Загружаем чат для проверки участия
          if (!message.chatId) return false

          const chat = await prisma.transferChat.findUnique({
            where: { id: message.chatId }
          })

          if (!chat) return false

          // Проверяем, является ли пользователь участником чата
          // Диспетчеры имеют доступ к чатам DISPATCHER_PERSONAL с dispatcherId = null (доступ всем диспетчерам)
          if (subjectType === "USER") {
            if (
              subject.dispatcher === true &&
              chat.type === "DISPATCHER_PERSONAL" &&
              chat.dispatcherId === null
            ) {
              return true
            }
            if (chat.dispatcherId === subject.id) {
              return true
            }
          }
          if (subjectType === "DRIVER" && chat.driverId === subject.id) {
            return true
          }
          if (
            subjectType === "AIRLINE_PERSONAL" &&
            chat.personalId === subject.id
          ) {
            return true
          }

          return false
        }
      )
    },
    transferMessageRead: {
      subscribe: withFilter(
        (_, { chatId }) => pubsub.asyncIterator(TRANSFER_MESSAGE_READ),
        async (payload, variables, context) => {
          const { subject, subjectType } = context

          if (!subject) return false

          const read = payload.transferMessageRead

          // Фильтруем по chatId
          if (variables.chatId && read.message?.chatId !== variables.chatId) {
            return false
          }

          // Проверяем права доступа
          if (!read.message || !read.message.chatId) return false

          const chat = await prisma.transferChat.findUnique({
            where: { id: read.message.chatId }
          })

          if (!chat) return false

          // SUPERADMIN и диспетчеры видят все
          if (
            subjectType === "USER" &&
            (subject.role === "SUPERADMIN" || subject.dispatcher === true)
          ) {
            return true
          }

          // Проверяем, является ли пользователь участником чата
          // Диспетчеры имеют доступ к чатам DISPATCHER_PERSONAL с dispatcherId = null (доступ всем диспетчерам)
          if (subjectType === "USER") {
            if (
              subject.dispatcher === true &&
              chat.type === "DISPATCHER_PERSONAL" &&
              chat.dispatcherId === null
            ) {
              return true
            }
            if (chat.dispatcherId === subject.id) {
              return true
            }
          }
          if (subjectType === "DRIVER" && chat.driverId === subject.id) {
            return true
          }
          if (
            subjectType === "AIRLINE_PERSONAL" &&
            chat.personalId === subject.id
          ) {
            return true
          }

          return false
        }
      )
    }
  },
  Transfer: {
    dispatcher: async (parent, _) => {
      if (parent.dispatcherId) {
        return await prisma.user.findUnique({
          where: { id: parent.dispatcherId, dispatcher: true }
        })
      }
      return null
    },
    driver: async (parent, _) => {
      if (parent.driverId) {
        const driver = await prisma.driver.findUnique({
          where: { id: parent.driverId }
        })
        return driver
      }
      return null
    },
    persons: async (parent, _) => {
      if (!parent.id) return []

      const passengers = await prisma.transferPassenger.findMany({
        where: { transferId: parent.id },
        include: { personal: true }
      })

      return passengers.map((p) => p.personal).filter(Boolean)
    },
    chats: async (parent, _) => {
      if (parent.id) {
        return await prisma.transferChat.findMany({
          where: { transferId: parent.id }
        })
      }
      return null
    },
    reviews: async (parent, _) => {
      if (parent.id) {
        return await prisma.transferReview.findMany({
          where: { transferId: parent.id }
        })
      }
      return null
    },
    airline: async (parent, _) => {
      if (parent.airlineId) {
        return await prisma.airline.findUnique({
          where: { id: parent.airlineId }
        })
      }
    }
  },
  TransferChat: {
    transfer: async (parent) => {
      if (parent.transferId) {
        return await prisma.transfer.findUnique({
          where: { id: parent.transferId }
        })
      }
      return null
    },
    dispatcher: async (parent) => {
      if (parent.dispatcherId) {
        return await prisma.user.findUnique({
          where: { id: parent.dispatcherId }
        })
      }
      return null
    },
    driver: async (parent) => {
      if (parent.driverId) {
        return await prisma.driver.findUnique({
          where: { id: parent.driverId }
        })
      }
      return null
    },
    personal: async (parent) => {
      if (parent.personalId) {
        return await prisma.airlinePersonal.findUnique({
          where: { id: parent.personalId }
        })
      }
      return null
    },
    messages: async (parent) => {
      return await prisma.transferMessage.findMany({
        where: { chatId: parent.id },
        include: {
          senderUser: true,
          senderDriver: true,
          senderPersonal: true,
          readBy: {
            include: {
              user: true,
              driver: true,
              personal: true
            }
          }
        },
        orderBy: { createdAt: "asc" }
      })
    }
  },
  TransferMessage: {
    chat: async (parent) => {
      if (parent.chatId) {
        return await prisma.transferChat.findUnique({
          where: { id: parent.chatId }
        })
      }
      return null
    },
    senderUser: async (parent) => {
      if (parent.senderUserId) {
        return await prisma.user.findUnique({
          where: { id: parent.senderUserId }
        })
      }
      return null
    },
    senderDriver: async (parent) => {
      if (parent.senderDriverId) {
        return await prisma.driver.findUnique({
          where: { id: parent.senderDriverId }
        })
      }
      return null
    },
    senderPersonal: async (parent) => {
      if (parent.senderPersonalId) {
        return await prisma.airlinePersonal.findUnique({
          where: { id: parent.senderPersonalId }
        })
      }
      return null
    },
    readBy: async (parent) => {
      return await prisma.transferMessageRead.findMany({
        where: { messageId: parent.id },
        include: {
          user: true,
          driver: true,
          personal: true
        }
      })
    }
  },
  TransferMessageRead: {
    message: async (parent) => {
      if (parent.messageId) {
        return await prisma.transferMessage.findUnique({
          where: { id: parent.messageId }
        })
      }
      return null
    },
    user: async (parent) => {
      if (parent.userId) {
        return await prisma.user.findUnique({
          where: { id: parent.userId }
        })
      }
      return null
    },
    driver: async (parent) => {
      if (parent.driverId) {
        return await prisma.driver.findUnique({
          where: { id: parent.driverId }
        })
      }
      return null
    },
    personal: async (parent) => {
      if (parent.personalId) {
        return await prisma.airlinePersonal.findUnique({
          where: { id: parent.personalId }
        })
      }
      return null
    }
  }
}

const DATE_FIELDS = [
  "scheduledPickupAt",
  "driverAssignmentAt",
  "orderAcceptanceAt",
  "arrivedToPassengerAt",
  "departedAt",
  "arrivedAt",
  "finishedAt",
  "createdAt",
  "updatedAt"
]

/**
 * Автоматически создает чаты для трансфера на основе доступных участников
 */
async function ensureTransferChats(transfer) {
  const transferData = await prisma.transfer.findUnique({
    where: { id: transfer.id },
    include: {
      dispatcher: true,
      driver: true,
      persons: { include: { personal: true } }
    }
  })

  if (!transferData) return

  const chatTypes = []

  // DISPATCHER_PERSONAL - создается для каждого пассажира ВСЕГДА
  // dispatcherId = null означает доступ для всех диспетчеров
  if (transferData.persons && transferData.persons.length > 0) {
    for (const passenger of transferData.persons) {
      if (passenger.personalId) {
        chatTypes.push({
          type: "DISPATCHER_PERSONAL",
          dispatcherId: transferData.dispatcherId || null, // null = доступ всем диспетчерам
          personalId: passenger.personalId
        })
      }
    }
  }

  // DISPATCHER_DRIVER - если есть и диспетчер, и водитель
  if (transferData.dispatcherId && transferData.driverId) {
    chatTypes.push({
      type: "DISPATCHER_DRIVER",
      dispatcherId: transferData.dispatcherId,
      driverId: transferData.driverId
    })
  }

  // DRIVER_PERSONAL - для каждого пассажира, если есть водитель
  if (
    transferData.driverId &&
    transferData.persons &&
    transferData.persons.length > 0
  ) {
    for (const passenger of transferData.persons) {
      if (passenger.personalId) {
        chatTypes.push({
          type: "DRIVER_PERSONAL",
          driverId: transferData.driverId,
          personalId: passenger.personalId
        })
      }
    }
  }

  // Создаем чаты, которых еще нет
  for (const chatConfig of chatTypes) {
    let existing = null

    // Для DISPATCHER_PERSONAL и DRIVER_PERSONAL проверяем с personalId
    if (
      chatConfig.type === "DISPATCHER_PERSONAL" ||
      chatConfig.type === "DRIVER_PERSONAL"
    ) {
      if (!chatConfig.personalId) continue

      existing = await prisma.transferChat.findUnique({
        where: {
          transferId_type_personalId: {
            transferId: transfer.id,
            type: chatConfig.type,
            personalId: chatConfig.personalId
          }
        }
      })
    } else {
      // Для DISPATCHER_DRIVER ищем чат без personalId
      // Используем findFirst, так как findUnique не работает с null в составном ключе
      existing = await prisma.transferChat.findFirst({
        where: {
          transferId: transfer.id,
          type: chatConfig.type,
          personalId: null
        }
      })
    }

    if (!existing) {
      const chatData = {
        transfer: { connect: { id: transfer.id } },
        type: chatConfig.type
      }

      // Для DISPATCHER_PERSONAL dispatcherId может быть null (доступ всем диспетчерам)
      if (chatConfig.type === "DISPATCHER_PERSONAL") {
        if (chatConfig.dispatcherId) {
          chatData.dispatcher = { connect: { id: chatConfig.dispatcherId } }
        }
        // Если dispatcherId null, не добавляем связь - это означает доступ всем диспетчерам
      } else if (chatConfig.dispatcherId) {
        // Для других типов чатов dispatcherId обязателен, если указан
        chatData.dispatcher = { connect: { id: chatConfig.dispatcherId } }
      }
      if (chatConfig.driverId) {
        chatData.driver = { connect: { id: chatConfig.driverId } }
      }
      if (chatConfig.personalId) {
        chatData.personal = { connect: { id: chatConfig.personalId } }
      }

      await prisma.transferChat.create({ data: chatData })
    }
  }
}

export default transferResolver

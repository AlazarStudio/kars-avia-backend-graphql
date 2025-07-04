import { prisma } from "../../prisma.js"
import {
  pubsub,
  MESSAGE_SENT,
  NOTIFICATION,
  RESERVE_UPDATED,
  REQUEST_UPDATED
} from "../../exports/pubsub.js"
import { withFilter } from "graphql-subscriptions"
import { subscribe } from "graphql"
import { allMiddleware } from "../../middlewares/authMiddleware.js"

// import leoProfanity from "leo-profanity"
// leoProfanity.loadDictionary("ru")

const chatResolver = {
  Query: {
    // Возвращает чаты по указанным параметрам: requestId или reserveId.
    // Если передан reserveId, дополнительно проверяется наличие hotelId у пользователя.
    chat: async (_, { chatId }, context) => {
      allMiddleware(context)
      const chat = await prisma.chat.findUnique({
        where: { id: chatId },
        include: {
          messages: {
            include: {
              sender: {
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
              },
              readBy: {
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
          }
        }
      })
      return chat
    },
    chats: async (_, { requestId, reserveId }, context) => {
      allMiddleware(context)
      // Извлекаем идентификатор отеля из контекста пользователя
      const hotelId = context.user.hotelId
      // Инициализируем условие запроса с массивом для OR-условий
      const whereCondition = {
        OR: []
      }

      // Если указан requestId, добавляем его в условия поиска
      if (requestId) {
        whereCondition.OR.push({ requestId })
      }

      // Если указан reserveId, то добавляем условие. Если у пользователя есть hotelId, учитываем его при поиске.
      if (reserveId) {
        if (hotelId) {
          whereCondition.OR.push({ reserveId, hotelId })
        } else {
          whereCondition.OR.push({ reserveId })
        }
      }

      // Выполняем запрос к базе данных: если условия OR заполнены, используем их,
      // иначе передаем пустой объект для получения всех чатов.
      const chats = await prisma.chat.findMany({
        where: whereCondition.OR.length > 0 ? whereCondition : {},
        include: { hotel: true } // Включаем данные об отеле, связанном с чатом
      })

      return chats
    },

    // Возвращает список сообщений для заданного чата (chatId),
    // которые ещё не прочитаны указанным пользователем (userId).
    unreadMessages: async (_, { chatId, userId }, context) => {
      allMiddleware(context)
      const unreadMessages = await prisma.message.findMany({
        where: {
          chatId,
          // Исключаем те сообщения, у которых уже есть запись о прочтении данным пользователем
          NOT: {
            readBy: {
              some: { userId }
            }
          }
        },
        include: {
          sender: {
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
        } // Включаем данные отправителя для каждого сообщения
      })
      return unreadMessages
    },

    // Подсчитывает количество непрочитанных сообщений в чате для конкретного пользователя.
    // Сначала извлекаются все сообщения чата, затем – сообщения, которые пользователь уже прочитал,
    // и, наконец, вычисляется разница.
    unreadMessagesCount: async (_, { chatId, userId }, context) => {
      allMiddleware(context)
      const unreadMessages = await prisma.message.count({
        where: {
          chatId,
          // Исключаем те сообщения, у которых уже есть запись о прочтении данным пользователем
          NOT: {
            readBy: {
              some: { userId }
            }
          }
        }
      })

      return unreadMessages
    },

    // Возвращает все сообщения для указанного чата с включением информации об отправителе.
    messages: async (_, { chatId }, context) => {
      allMiddleware(context)
      return await prisma.message.findMany({
        where: { chatId },
        include: {
          sender: {
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
      })
    }
  },

  Mutation: {
    // Создание нового сообщения в чате.
    // В данном резольвере происходит:
    // 1. Корректировка времени создания сообщения (сдвиг на 3 часа).
    // 2. Создание записи сообщения в базе данных с привязкой к отправителю и чату.
    // 3. Публикация события через PubSub для уведомления подписчиков.

    // sendMessage: async (_, { chatId, senderId, text }, context) => {
    //   const currentTime = new Date()
    //   const adjustedTime = new Date(currentTime.getTime() + 3 * 60 * 60 * 1000)
    //   const formattedTime = adjustedTime.toISOString()

    //   // const filteredText = leoProfanity.clean(text)
    //   // Создаем сообщение и сразу получаем связанные данные о чате
    //   const message = await prisma.message.create({
    //     data: {
    //       text,
    //       sender: { connect: { id: senderId } },
    //       chat: { connect: { id: chatId } },
    //       createdAt: formattedTime
    //     },
    //     include: {
    //       sender: {
    //         select: {
    //           id: true,
    //           name: true,
    //           number: true,
    //           images: true,
    //           role: true,
    //           position: true,
    //           airlineId: true,
    //           airlineDepartmentId: true,
    //           hotelId: true,
    //           dispatcher: true
    //         }
    //       },
    //       chat: {
    //         select: {
    //           id: true,
    //           requestId: true,
    //           reserveId: true
    //         }
    //       }
    //     }
    //   })

    //   // Формируем массив промисов для обновлений и уведомлений
    //   const tasks = []

    //   if (message.chat.requestId) {
    //     tasks.push(
    //       prisma.request
    //         .findUnique({
    //           where: { id: message.chat.requestId },
    //           include: { chat: true }
    //         })
    //         .then((updatedRequest) => {
    //           prisma.notification.create({
    //             data: {
    //               chat: message.chat,
    //               request: { connect: { id: message.chat.requestId } }
    //             }
    //           })
    //           pubsub.publish(NOTIFICATION, {
    //             notification: {
    //               __typename: "MessageSentNotification",
    //               requestId: message.chat.requestId,
    //               chat: message.chat,
    //               text: message.text
    //             }
    //           })
    //           pubsub.publish(REQUEST_UPDATED, {
    //             requestUpdated: updatedRequest
    //           })
    //         })
    //     )
    //   }

    //   if (message.chat.reserveId) {
    //     tasks.push(
    //       prisma.reserve
    //         .findUnique({
    //           where: { id: message.chat.reserveId },
    //           include: { chat: true }
    //         })
    //         .then((updatedReserve) => {
    //           prisma.notification.create({
    //             data: {
    //               chat: message.chat,
    //               reserve: { connect: { id: message.chat.reserveId } }
    //             }
    //           })
    //           pubsub.publish(NOTIFICATION, {
    //             notification: {
    //               __typename: "MessageSentNotification",
    //               reserveId: message.chat.reserveId,
    //               chat: message.chat,
    //               text: message.text
    //             }
    //           })
    //           pubsub.publish(RESERVE_UPDATED, {
    //             reserveUpdated: updatedReserve
    //           })
    //         })
    //     )
    //   }

    //   // Обновляем данные о прочтении сообщений
    //   tasks.push(
    //     prisma.messageRead.upsert({
    //       where: {
    //         messageId_userId: { messageId: message.id, userId: senderId }
    //       },
    //       update: { readAt: new Date() },
    //       create: {
    //         messageId: message.id,
    //         userId: senderId,
    //         readAt: new Date()
    //       }
    //     })
    //   )

    //   // Ожидаем завершения всех задач
    //   await Promise.all(tasks)

    //   // Публикуем событие отправки сообщения
    //   pubsub.publish(`${MESSAGE_SENT}_${chatId}`, { messageSent: message })

    //   return message
    // },

    sendMessage: async (_, { chatId, senderId, text }, context) => {
      allMiddleware(context)
      const currentTime = new Date()
      const adjustedTime = new Date(currentTime.getTime() + 3 * 60 * 60 * 1000)
      const formattedTime = adjustedTime.toISOString()

      // Создаем сообщение и сразу получаем связанные данные о чате
      const message = await prisma.message.create({
        data: {
          text,
          sender: { connect: { id: senderId } },
          chat: { connect: { id: chatId } },
          createdAt: formattedTime
        },
        include: {
          sender: {
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
          },
          chat: {
            select: {
              id: true,
              requestId: true,
              reserveId: true,
              airlineId: true,
              hotelId: true
            }
          }
        }
      })

      // Формируем массив промисов для обновлений и уведомлений
      const tasks = []

      if (message.chat.requestId) {
        const updatedRequest = await prisma.request.findUnique({
          where: { id: message.chat.requestId },
          include: { chat: true }
        })

        await prisma.notification.create({
          data: {
            chatId: message.chat.id, // ❗ Используем `chatId`
            requestId: message.chat.requestId, // ❗ Используем `requestId`
            airlineId: message.chat.airlineId || null, // ❗ Используем `airlineId`
            hotelId: message.chat.hotelId || null, // ❗ Используем `hotelId`
            description: {
              action: "new_message"
            }
          }
        })

        pubsub.publish(NOTIFICATION, {
          notification: {
            __typename: "MessageSentNotification",
            requestId: message.chat.requestId,
            chat: message.chat,
            text: message.text
          }
        })

        pubsub.publish(REQUEST_UPDATED, {
          requestUpdated: updatedRequest
        })
      }

      if (message.chat.reserveId) {
        const updatedReserve = await prisma.reserve.findUnique({
          where: { id: message.chat.reserveId },
          include: { chat: true }
        })

        await prisma.notification.create({
          data: {
            chatId: message.chat.id, // ❗ Используем `chatId`
            reserveId: message.chat.reserveId, // ❗ Используем `reserveId`
            airlineId: message.chat.airlineId || null, // ❗ Используем `airlineId`
            hotelId: message.chat.hotelId || null, // ❗ Используем `hotelId`
            description: {
              action: "new_message"
            }
          }
        })

        pubsub.publish(NOTIFICATION, {
          notification: {
            __typename: "MessageSentNotification",
            reserveId: message.chat.reserveId,
            chat: message.chat,
            text: message.text
          }
        })

        pubsub.publish(RESERVE_UPDATED, {
          reserveUpdated: updatedReserve
        })
      }

      // Обновляем данные о прочтении сообщений
      tasks.push(
        prisma.messageRead.upsert({
          where: {
            messageId_userId: { messageId: message.id, userId: senderId }
          },
          update: { readAt: new Date() },
          create: {
            messageId: message.id,
            userId: senderId,
            readAt: new Date()
          }
        })
      )

      // Ожидаем завершения всех задач
      await Promise.all(tasks)

      // Публикуем событие отправки сообщения
      pubsub.publish(`${MESSAGE_SENT}_${chatId}`, { messageSent: message })

      return message
    },

    // Помечает конкретное сообщение как прочитанное указанным пользователем.
    // Используется метод upsert для создания или обновления записи в таблице messageRead.
    // markMessageAsRead: async (_, { messageId, userId }, context) => {
    //   const messageRead = await prisma.messageRead.upsert({
    //     where: {
    //       messageId_userId: { messageId, userId }
    //     },
    //     update: {
    //       readAt: new Date()
    //     },
    //     create: {
    //       messageId,
    //       userId,
    //       readAt: new Date()
    //     }
    //   })

    //   return messageRead
    // },

    markMessageAsRead: async (_, { messageId, userId }, context) => {
      allMiddleware(context)
      const currentTime = new Date()

      // Обновляем статус прочтения конкретного сообщения
      const messageRead = await prisma.messageRead.upsert({
        where: { messageId_userId: { messageId, userId } },
        update: { readAt: currentTime },
        create: { messageId, userId, readAt: currentTime }
      })

      // Получаем чат, связанный с этим сообщением
      const message = await prisma.message.findUnique({
        where: { id: messageId },
        select: {
          chat: { select: { id: true, requestId: true, reserveId: true } }
        }
      })

      if (message && message.chat) {
        const { requestId, reserveId } = message.chat

        if (requestId) {
          const updatedRequest = await prisma.request.findUnique({
            where: { id: requestId },
            include: { chat: true }
          })
          if (updatedRequest) {
            pubsub.publish(REQUEST_UPDATED, { requestUpdated: updatedRequest })
          }
        }

        if (reserveId) {
          const updatedReserve = await prisma.reserve.findUnique({
            where: { id: reserveId },
            include: { chat: true }
          })
          if (updatedReserve) {
            pubsub.publish(RESERVE_UPDATED, { reserveUpdated: updatedReserve })
          }
        }
      }

      return messageRead
    },

    // Помечает все сообщения в чате как прочитанные для конкретного пользователя.
    // Здесь происходит обновление поля lastReadMessageAt в таблице chatUser,
    // а также (опционально) обновление статуса isRead для сообщений.

    // markAllMessagesAsRead: async (_, { chatId, userId }, context) => {
    //   const currentTime = new Date()

    //   // Обновляем дату последнего прочтения сообщений для пользователя в данном чате
    //   await prisma.chatUser.upsert({
    //     where: { chatId_userId: { chatId, userId } },
    //     update: { lastReadMessageAt: currentTime },
    //     create: { chatId, userId, lastReadMessageAt: currentTime }
    //   })

    //   // Обновляем все существующие записи MessageRead для сообщений в этом чате
    //   await prisma.messageRead.updateMany({
    //     where: {
    //       message: { chatId },
    //       userId
    //     },
    //     data: { readAt: currentTime }
    //   })

    //   // Находим все сообщения в чате, для которых нет записи MessageRead для данного пользователя
    //   const unreadMessages = await prisma.message.findMany({
    //     where: {
    //       chatId,
    //       readBy: { none: { userId } }
    //     },
    //     select: { id: true }
    //   })

    //   // Для каждого такого сообщения создаём новую запись MessageRead
    //   await Promise.all(
    //     unreadMessages.map((msg) =>
    //       prisma.messageRead.create({
    //         data: {
    //           message: { connect: { id: msg.id } },
    //           user: { connect: { id: userId } },
    //           readAt: currentTime
    //         }
    //       })
    //     )
    //   )

    //   return true
    // },

    markAllMessagesAsRead: async (_, { chatId, userId }, context) => {
      allMiddleware(context)
      const currentTime = new Date()

      // Обновляем дату последнего прочтения сообщений для пользователя в данном чате
      await prisma.chatUser.upsert({
        where: { chatId_userId: { chatId, userId } },
        update: { lastReadMessageAt: currentTime },
        create: { chatId, userId, lastReadMessageAt: currentTime }
      })

      // Обновляем все существующие записи MessageRead для сообщений в этом чате
      await prisma.messageRead.updateMany({
        where: { message: { chatId }, userId },
        data: { readAt: currentTime }
      })

      // Находим все непрочитанные сообщения и помечаем их как прочитанные
      const unreadMessages = await prisma.message.findMany({
        where: { chatId, readBy: { none: { userId } } },
        select: { id: true }
      })

      await Promise.all(
        unreadMessages.map((msg) =>
          prisma.messageRead.create({
            data: {
              message: { connect: { id: msg.id } },
              user: { connect: { id: userId } },
              readAt: currentTime
            }
          })
        )
      )

      // Получаем данные о чате
      const chat = await prisma.chat.findUnique({
        where: { id: chatId },
        select: { requestId: true, reserveId: true }
      })

      if (chat) {
        if (chat.requestId) {
          const updatedRequest = await prisma.request.findUnique({
            where: { id: chat.requestId },
            include: { chat: true }
          })
          if (updatedRequest) {
            pubsub.publish(REQUEST_UPDATED, { requestUpdated: updatedRequest })
          }
        }

        if (chat.reserveId) {
          const updatedReserve = await prisma.reserve.findUnique({
            where: { id: chat.reserveId },
            include: { chat: true }
          })
          if (updatedReserve) {
            pubsub.publish(RESERVE_UPDATED, { reserveUpdated: updatedReserve })
          }
        }
      }

      return true
    },

    // Создает новый чат, связанный с конкретной заявкой (requestId),
    // и добавляет указанных пользователей (userIds) в качестве участников.
    createChat: async (_, { requestId, userIds }, context) => {
      allMiddleware(context)
      // Создаем чат, привязанный к заявке
      const chat = await prisma.chat.create({
        data: {
          request: { connect: { id: requestId } }
        }
      })
      // Для каждого пользователя создаем запись в таблице chatUser для связи с чатом
      const chatUserPromises = userIds.map((userId) =>
        prisma.chatUser.create({
          data: {
            chat: { connect: { id: chat.id } },
            user: { connect: { id: userId } }
          }
        })
      )
      // Ожидаем завершения создания всех связей с участниками
      await Promise.all(chatUserPromises)
      return chat
    }
  },

  Subscription: {
    // Подписка на событие отправки нового сообщения в чате.
    // Событие идентифицируется с использованием chatId.
    // messageSent: {
    //   subscribe: (_, { chatId }) =>
    //     pubsub.asyncIterator(`${MESSAGE_SENT}_${chatId}`)
    // },
    requestUpdated: {
      subscribe: withFilter(
        () => pubsub.asyncIterator(REQUEST_UPDATED),
        (payload, variables, context) => {
          const user = context.user
          const message = payload.requestUpdated

          if (user.role === "SUPERADMIN") {
            return true
          }
          if (user.dispatcher === true) {
            return true
          }
          if (user.airlineId && user.airlineId === message.chat.airlineId) {
            return true
          }
          if (user.hotelId && user.hotelId === message.chat.hotelId) {
            return true
          }
          return false
        }
      )
    },
    reserveUpdated: {
      subscribe: withFilter(
        () => pubsub.asyncIterator(RESERVE_UPDATED),
        (payload, variables, context) => {
          const user = context.user
          const message = payload.reserveUpdated

          if (user.dispatcher === true) {
            return true
          }
          if (user.airlineId && user.airlineId === message.chat.airlineId) {
            return true
          }
          if (user.hotelId && user.hotelId === message.chat.hotelId) {
            return true
          }
          return false
        }
      )
    },

    messageSent: {
      subscribe: withFilter(
        (_, { chatId }) => pubsub.asyncIterator(`${MESSAGE_SENT}_${chatId}`),
        (payload, variables, context) => {
          const user = context.user
          const message = payload.messageSent
          const chatIdMatches =
            message.chat && message.chat.id === variables.chatId
          if (!chatIdMatches) return false

          if (user.dispatcher === true) {
            return true
          }
          if (user.airlineId && user.airlineId === message.chat.airlineId) {
            return true
          }
          if (user.hotelId && user.hotelId === message.chat.hotelId) {
            return true
          }
          return false
        }
      )
    },

    // Подписка на событие получения нового непрочитанного сообщения для конкретного пользователя.
    // Имя события включает как chatId, так и userId.
    newUnreadMessage: {
      subscribe: (_, { chatId, userId }) =>
        pubsub.asyncIterator(`NEW_UNREAD_MESSAGE_${chatId}_${userId}`),
      resolve: (payload) => payload.newUnreadMessage
    },
    // Подписка на событие, когда сообщение помечено как прочитанное.
    messageRead: {
      subscribe: (_, { chatId }) =>
        pubsub.asyncIterator(`MESSAGE_READ_${chatId}`),
      resolve: (payload) => payload.messageRead
    },
    // Подписка на уведомления
    notification: {
      subscribe: () => pubsub.asyncIterator([NOTIFICATION])
    }
  },

  // Резольверы для полей типа Chat
  Chat: {
    // Возвращает список участников чата, извлекая данные пользователей из связей в таблице chatUser.
    participants: async (parent) => {
      const chatUsers = await prisma.chatUser.findMany({
        where: { chatId: parent.id },
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
      })
      return chatUsers.map((chatUser) => chatUser.user)
    },

    // Вычисляет количество непрочитанных сообщений в чате для конкретного пользователя.
    // Для этого определяется время последнего прочтения сообщений и считается число сообщений,
    // созданных после этого момента.
    unreadMessagesCount: async (parent, { chatId }, context) => {
      const { user } = context
      const response = await prisma.message.count({
        where: {
          chatId: chatId ? chatId : parent.id,
          // Исключаем те сообщения, у которых уже есть запись о прочтении данным пользователем
          NOT: {
            readBy: {
              some: { userId: user.id }
            }
          }
        }
      })
      return response
    },

    // Возвращает все сообщения чата с включением данных об отправителе для каждого сообщения.
    messages: async (parent) => {
      return await prisma.message.findMany({
        where: { chatId: parent.id },
        include: {
          sender: {
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
          },
          readBy: {
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
    }
  },
  MessageRead: {
    user: async (parent, args, context) => {
      if (parent.user) {
        return parent.user
      }
      if (parent.userId) {
        return await prisma.user.findUnique({
          where: { id: parent.userId }
        })
      }
      return null
    }
  }
}

export default chatResolver

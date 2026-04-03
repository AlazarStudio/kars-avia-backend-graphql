import { prisma } from "../../prisma.js"
import {
  pubsub,
  MESSAGE_SENT,
  NOTIFICATION,
  newUnreadMessageTopic,
  messageReadTopic
} from "../../services/infra/pubsub.js"
import {
  publishRequestUpdated,
  publishReserveUpdated
} from "../../services/infra/subscriptionPayloads.js"
import { subscriptionAuthMiddleware } from "../../services/infra/subscriptionAuth.js"
import { withFilter } from "graphql-subscriptions"
import { allMiddleware } from "../../middlewares/authMiddleware.js"
import { shouldSendNotification } from "../../services/notification/notificationRateGuard.js"

// import leoProfanity from "leo-profanity"
// leoProfanity.loadDictionary("ru")

const chatResolver = {
  Query: {
    // Возвращает чаты по указанным параметрам: requestId или reserveId.
    // Если передан reserveId, дополнительно проверяется наличие hotelId у пользователя.
    chat: async (_, { chatId }, context) => {
      if (context.subjectType !== "EXTERNAL_USER") {
        await allMiddleware(context)
      }
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
    chats: async (_, { requestId, reserveId, passengerRequestId }, context) => {
      const isExternal = context.subjectType === "EXTERNAL_USER"
      if (!isExternal) {
        await allMiddleware(context)
      }

      if (passengerRequestId) {
        let chats = await prisma.chat.findMany({
          where: { passengerRequestId },
          include: { hotel: true }
        })
        if (chats.length === 0) {
          const newChat = await prisma.chat.create({
            data: { passengerRequest: { connect: { id: passengerRequestId } } },
            include: { hotel: true }
          })
          chats = [newChat]
        }
        return chats
      }

      const hotelId = context.user?.hotelId
      const whereCondition = { OR: [] }

      if (requestId) {
        whereCondition.OR.push({ requestId })
      }

      if (reserveId) {
        if (hotelId) {
          whereCondition.OR.push({ reserveId, hotelId })
        } else {
          whereCondition.OR.push({ reserveId })
        }
      }

      const chats = await prisma.chat.findMany({
        where: whereCondition.OR.length > 0 ? whereCondition : {},
        include: { hotel: true }
      })

      return chats
    },

    // Возвращает список сообщений для заданного чата (chatId),
    // которые ещё не прочитаны указанным пользователем (userId).
    unreadMessages: async (_, { chatId, userId }, context) => {
      if (context.subjectType !== "EXTERNAL_USER") {
        await allMiddleware(context)
      }
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
      if (context.subjectType !== "EXTERNAL_USER") {
        await allMiddleware(context)
      }
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
      if (context.subjectType !== "EXTERNAL_USER") {
        await allMiddleware(context)
      }
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
      const isExternal = context.subjectType === "EXTERNAL_USER"
      if (!isExternal) {
        await allMiddleware(context)
      }

      const currentTime = new Date()
      const adjustedTime = new Date(currentTime.getTime() + 3 * 60 * 60 * 1000)
      const formattedTime = adjustedTime.toISOString()

      const chat = await prisma.chat.findUnique({
        where: { id: chatId },
        include: {
          tickets: { orderBy: { ticketNumber: "desc" } }
        }
      })
      if (!chat) throw new Error("Чат не найден")

      let currentTicketId = null
      if (chat.isSupport && !isExternal) {
        const sender = await prisma.user.findUnique({
          where: { id: senderId },
          select: { id: true, support: true }
        })
        if (!sender) throw new Error("Отправитель не найден")
        if (sender.support) {
          if (chat.assignedToId !== senderId) {
            throw new Error("Ответить в чате техподдержки может только агент, принявший тикет. Сначала возьмите тикет в работу.")
          }
        } else {
          if (chat.supportStatus === "RESOLVED") {
            const maxTicketNumber =
              chat.tickets?.length > 0
                ? Math.max(...chat.tickets.map((t) => t.ticketNumber))
                : 0
            const newTicket = await prisma.supportTicket.create({
              data: {
                chatId,
                ticketNumber: maxTicketNumber + 1,
                status: "OPEN"
              }
            })
            currentTicketId = newTicket.id
            await prisma.chat.update({
              where: { id: chatId },
              data: {
                supportStatus: "OPEN",
                assignedToId: null,
                resolvedAt: null,
                resolvedById: null
              }
            })
          }
        }
        if (!currentTicketId) {
          const activeTicket = chat.tickets?.find(
            (t) => t.status === "OPEN" || t.status === "IN_PROGRESS"
          )
          if (activeTicket) {
            currentTicketId = activeTicket.id
          } else if (chat.tickets?.length === 0) {
            const firstTicket = await prisma.supportTicket.create({
              data: {
                chatId,
                ticketNumber: 1,
                status: chat.supportStatus || "OPEN"
              }
            })
            currentTicketId = firstTicket.id
          }
        }
      }

      const messageData = {
        text,
        chat: { connect: { id: chatId } },
        createdAt: formattedTime
      }

      if (isExternal) {
        messageData.senderExternalUserId = context.subject.id
        let extName = context.subject.name || ""
        const scope = context.subject.scope
        if (scope === "HOTEL" && context.subject.hotelId) {
          const hotel = await prisma.hotel.findUnique({
            where: { id: context.subject.hotelId },
            select: { name: true }
          })
          extName = hotel?.name ? `Гостиница «${hotel.name}»` : (extName || "Гостиница")
        } else if (scope === "DRIVER" && context.subject.driverId) {
          const driver = await prisma.user.findUnique({
            where: { id: context.subject.driverId },
            select: { name: true }
          })
          extName = driver?.name ? `Водитель: ${driver.name}` : (extName || "Водитель")
        } else if (!extName) {
          extName = "Внешний пользователь"
        }
        messageData.senderName = extName
      } else {
        messageData.sender = { connect: { id: senderId } }
      }

      if (currentTicketId) {
        messageData.supportTicket = { connect: { id: currentTicketId } }
      }

      const message = await prisma.message.create({
        data: messageData,
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
              passengerRequestId: true,
              airlineId: true,
              hotelId: true
            }
          }
        }
      })

      const tasks = []

      if (message.chat.requestId) {
        const siteNotificationGuard = shouldSendNotification({
          channel: "site",
          action: "new_message",
          entityType: "chat",
          entityId: message.chat.id
        })

        if (siteNotificationGuard.allowed) {
          await prisma.notification.create({
            data: {
              chatId: message.chat.id,
              requestId: message.chat.requestId,
              airlineId: message.chat.airlineId || null,
              hotelId: message.chat.hotelId || null,
              description: {
                action: "new_message"
              }
            }
          })

          pubsub.publish(NOTIFICATION, {
            notification: {
              __typename: "MessageSentNotification",
              action: "new_message",
              requestId: message.chat.requestId,
              chat: message.chat,
              text: message.text
            }
          })
        }

        await publishRequestUpdated(message.chat.requestId)
      }

      if (message.chat.reserveId) {
        const siteNotificationGuard = shouldSendNotification({
          channel: "site",
          action: "new_message",
          entityType: "chat",
          entityId: message.chat.id
        })

        if (siteNotificationGuard.allowed) {
          await prisma.notification.create({
            data: {
              chatId: message.chat.id,
              reserveId: message.chat.reserveId,
              airlineId: message.chat.airlineId || null,
              hotelId: message.chat.hotelId || null,
              description: {
                action: "new_message"
              }
            }
          })

          pubsub.publish(NOTIFICATION, {
            notification: {
              __typename: "MessageSentNotification",
              action: "new_message",
              reserveId: message.chat.reserveId,
              chat: message.chat,
              text: message.text
            }
          })
        }

        await publishReserveUpdated(message.chat.reserveId)
      }

      if (senderId && !isExternal) {
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
      }

      await Promise.all(tasks)

      const participantRows = await prisma.chatUser.findMany({
        where: { chatId },
        select: { userId: true }
      })
      for (const { userId: participantId } of participantRows) {
        if (!isExternal && senderId && participantId === senderId) continue
        pubsub.publish(newUnreadMessageTopic(participantId), {
          newUnreadMessage: message
        })
      }

      pubsub.publish(MESSAGE_SENT, { messageSent: message })

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
      if (context.subjectType !== "EXTERNAL_USER") {
        await allMiddleware(context)
      }
      const currentTime = new Date()

      // Обновляем статус прочтения конкретного сообщения
      const messageRead = await prisma.messageRead.upsert({
        where: { messageId_userId: { messageId, userId } },
        update: { readAt: currentTime },
        create: { messageId, userId, readAt: currentTime }
      })

      const messageReadForSub = await prisma.messageRead.findUnique({
        where: { messageId_userId: { messageId, userId } },
        include: {
          message: {
            select: {
              id: true,
              text: true,
              createdAt: true,
              chatId: true,
              senderId: true,
              senderExternalUserId: true,
              senderName: true,
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
          },
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

      if (messageReadForSub?.message?.chatId) {
        pubsub.publish(messageReadTopic(messageReadForSub.message.chatId), {
          messageRead: {
            ...messageReadForSub,
            chatId: messageReadForSub.message.chatId
          }
        })
      }

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
          await publishRequestUpdated(requestId)
        }

        if (reserveId) {
          await publishReserveUpdated(reserveId)
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
      if (context.subjectType !== "EXTERNAL_USER") {
        await allMiddleware(context)
      }
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
          await publishRequestUpdated(chat.requestId)
        }

        if (chat.reserveId) {
          await publishReserveUpdated(chat.reserveId)
        }
      }

      const latestBulkRead = await prisma.messageRead.findFirst({
        where: { userId, message: { chatId } },
        orderBy: { readAt: "desc" },
        include: {
          message: {
            select: {
              id: true,
              text: true,
              createdAt: true,
              chatId: true,
              senderId: true,
              senderExternalUserId: true,
              senderName: true,
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
          },
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
      if (latestBulkRead?.message?.chatId) {
        pubsub.publish(messageReadTopic(chatId), {
          messageRead: {
            ...latestBulkRead,
            chatId
          }
        })
      }

      return true
    },

    // Создает новый чат, связанный с конкретной заявкой (requestId),
    // и добавляет указанных пользователей (userIds) в качестве участников.
    createChat: async (_, { requestId, userIds }, context) => {
      await allMiddleware(context) // MIDDLEWARE_REVIEW: allMiddleware
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
    // requestUpdated / reserveUpdated — резолверы в request.resolver.js и reserve.resolver.js
    // messageSent: {
    //   subscribe: withFilter(
    //     (_, { chatId }) => pubsub.asyncIterator(MESSAGE_SENT),
    //     (payload, variables, context) => {
    //       const user = context.user
    //       const message = payload.messageSent
    //       const chatIdMatches =
    //         message.chat && message.chat.id === variables.chatId
    //       if (!chatIdMatches) return false

    //       if (user.dispatcher === true) {
    //         return true
    //       }
    //       if (user.role === "SUPERADMIN") {
    //         return true
    //       }
    //       if (user.airlineId && user.airlineId === message.chat.airlineId) {
    //         return true
    //       }
    //       if (user.hotelId && user.hotelId === message.chat.hotelId) {
    //         return true
    //       }
    //       return false
    //     }
    //   )
    // },
    messageSent: {
      subscribe: withFilter(
        (_, { chatId }) => pubsub.asyncIterator(MESSAGE_SENT),
        async (payload, variables, context) => {
          const isExternal = context.subjectType === "EXTERNAL_USER"
          if (!isExternal) {
            if (
              !(await subscriptionAuthMiddleware(
                allMiddleware,
                context,
                "chat.messageSent"
              ))
            ) {
              return false
            }
          }
          const { subject, subjectType } = context

          if (!subject) return false

          const message = payload.messageSent

          if (variables.chatId && message.chat && message.chat.id !== variables.chatId) {
            return false
          }

          if (isExternal) {
            if (message.chat?.passengerRequestId) return true
            if (message.chatId && !message.chat) {
              const chat = await prisma.chat.findUnique({ where: { id: message.chatId }, select: { passengerRequestId: true } })
              return !!chat?.passengerRequestId
            }
            return false
          }

          if (subjectType !== "USER") return false

          if (subject.role === "SUPERADMIN" || subject.dispatcher === true) {
            return true
          }

          if (message.chat) {
            if (subject.airlineId && message.chat.airlineId === subject.airlineId) {
              return true
            }
            if (subject.hotelId && message.chat.hotelId === subject.hotelId) {
              return true
            }
            if (message.chat.participants) {
              const isParticipant = message.chat.participants.some(
                (participant) => participant.id === subject.id
              )
              if (isParticipant) return true
            }
          }

          if (!message.chat && message.chatId) {
            const chat = await prisma.chat.findUnique({
              where: { id: message.chatId },
              include: {
                participants: {
                  include: {
                    user: { select: { id: true } }
                  }
                }
              }
            })

            if (chat) {
              if (subject.airlineId && chat.airlineId === subject.airlineId) {
                return true
              }
              if (subject.hotelId && chat.hotelId === subject.hotelId) {
                return true
              }
              const isParticipant = chat.participants?.some(
                (participant) => participant.userId === subject.id || participant.user?.id === subject.id
              )
              if (isParticipant) return true
            }
          }

          return false
        }
      )
    },

    // Подписка на событие получения нового непрочитанного сообщения для конкретного пользователя.
    // Имя события включает как chatId, так и userId.
    newUnreadMessage: {
      subscribe: withFilter(
        (_, { userId }) => pubsub.asyncIterator(newUnreadMessageTopic(userId)),
        async (payload, variables, context) => {
          if (
            !(await subscriptionAuthMiddleware(
              allMiddleware,
              context,
              "chat.newUnreadMessage"
            ))
          ) {
            return false
          }

          const { subject, subjectType } = context
          if (!subject || subjectType !== "USER") return false

          if (subject.role === "SUPERADMIN" || subject.dispatcher === true) {
            return true
          }

          return subject.id === variables.userId
        }
      ),
      resolve: (payload) => payload.newUnreadMessage
    },
    // Подписка на событие, когда сообщение помечено как прочитанное.
    messageRead: {
      subscribe: withFilter(
        (_, { chatId }) => pubsub.asyncIterator(messageReadTopic(chatId)),
        async (payload, variables, context) => {
          if (
            !(await subscriptionAuthMiddleware(
              allMiddleware,
              context,
              "chat.messageRead"
            ))
          ) {
            return false
          }

          const { subject, subjectType } = context
          if (!subject || subjectType !== "USER") return false

          if (subject.role === "SUPERADMIN" || subject.dispatcher === true) {
            return true
          }

          const eventChatId = payload?.messageRead?.chatId || variables.chatId
          if (!eventChatId || eventChatId !== variables.chatId) return false

          const chat = await prisma.chat.findUnique({
            where: { id: eventChatId }
          })

          if (!chat) return false
          if (subject.airlineId && chat.airlineId === subject.airlineId) {
            return true
          }
          if (subject.hotelId && chat.hotelId === subject.hotelId) {
            return true
          }
          return false
        }
      ),
      resolve: (payload) => payload.messageRead
    }
    // notification — подписка с фильтром NotificationMenu в dispatcher.resolver.js
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
              dispatcher: true,
              support: true
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
      const userId = context.user?.id || context.subject?.id
      if (!userId) return 0
      const response = await prisma.message.count({
        where: {
          chatId: chatId ? chatId : parent.id,
          NOT: {
            readBy: {
              some: { userId }
            }
          }
        }
      })
      return response
    },

    messages: async (parent) => {
      const msgs = await prisma.message.findMany({
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
      return msgs.map((m) => ({
        ...m,
        senderName: m.senderName || m.sender?.name || null
      }))
    },
    assignedTo: async (parent) => {
      if (parent.assignedTo) return parent.assignedTo
      if (!parent.assignedToId) return null
      return prisma.user.findUnique({
        where: { id: parent.assignedToId },
        select: { id: true, name: true, email: true, images: true, support: true }
      })
    },
    resolvedBy: async (parent) => {
      if (parent.resolvedBy) return parent.resolvedBy
      if (!parent.resolvedById) return null
      return prisma.user.findUnique({
        where: { id: parent.resolvedById },
        select: { id: true, name: true, email: true, images: true, support: true }
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

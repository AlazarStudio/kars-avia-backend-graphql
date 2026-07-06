import { prisma } from "../../prisma.js"
import { pubsub, newUnreadMessageTopic } from "../infra/pubsub.js"
import { isSupportChatClient } from "../support/supportAgent.js"

export async function isUserChatParticipant(userId, chatId) {
  const row = await prisma.chatUser.findFirst({
    where: { chatId, userId },
    select: { id: true }
  })
  return Boolean(row)
}

export async function canReceiveChatSubscription(subject, message) {
  if (!subject?.id) return false
  const chatId = message?.chatId || message?.chat?.id
  if (!chatId) return false

  let chat = message.chat
  if (!chat || chat.isSupport == null) {
    chat = await prisma.chat.findUnique({
      where: { id: chatId },
      select: { id: true, isSupport: true, airlineId: true, hotelId: true }
    })
  }
  if (!chat) return false

  if (chat.isSupport) {
    return isUserChatParticipant(subject.id, chatId)
  }

  if (subject.airlineId && chat.airlineId === subject.airlineId) return true
  if (subject.hotelId && chat.hotelId === subject.hotelId) return true
  return isUserChatParticipant(subject.id, chatId)
}

export async function canReceiveChatReadSubscription(subject, chatId) {
  if (!subject?.id || !chatId) return false

  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    select: { isSupport: true, airlineId: true, hotelId: true }
  })
  if (!chat) return false

  if (chat.isSupport) {
    return isUserChatParticipant(subject.id, chatId)
  }

  if (subject.airlineId && chat.airlineId === subject.airlineId) return true
  if (subject.hotelId && chat.hotelId === subject.hotelId) return true
  return isUserChatParticipant(subject.id, chatId)
}

export async function publishNewUnreadToSupportClients(chatId, message) {
  const participants = await prisma.chatUser.findMany({
    where: { chatId },
    include: {
      user: {
        select: {
          id: true,
          role: true,
          dispatcher: true,
          support: true
        }
      }
    }
  })
  for (const { user } of participants) {
    if (!isSupportChatClient(user)) continue
    pubsub.publish(newUnreadMessageTopic(user.id), { newUnreadMessage: message })
  }
}

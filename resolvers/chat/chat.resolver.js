import { prisma } from "../../prisma.js";
import { PubSub } from "graphql-subscriptions";

const pubsub = new PubSub();
const CHAT_CHANNEL = "CHAT_CHANNEL";
const MESSAGE_SENT = "MESSAGE_SENT" 
const MESSAGE_RECEIVED = "MESSAGE_RECEIVED"  

const chatResolver = {
  Query: {
    // Получить чаты по заявке
    chats: async (_, { requestId }) => {
      return await prisma.chat.findMany({
        where: { requestId },
        include: { Message: true, User: true },
      });
    },

    // Получить сообщения в чате
    messages: async (_, { chatId }) => {
      return await prisma.message.findMany({
        where: { chatId },
        include: { sender: true, receiver: true, chat: true },
      });
    },
  },

  Mutation: {
    // Отправить сообщение в чат
    sendMessage: async (_, { chatId, senderId, receiverId, text }) => {
      const message = await prisma.message.create({
        data: {
          text,
          senderId,
          receiverId,
          // chatId,
        },
        include: { sender: true, receiver: true },
      });

      // Отправляем сообщение в подписку
      // pubsub.publish(`${CHAT_CHANNEL}_${chatId}`, { messageSent: message });
      pubsub.publish(`${MESSAGE_RECEIVED}`, { messageReceived: message });

      return message;
    },

    // Создать новый чат (например, для заявки)
    createChat: async (_, { requestId, userIds }) => {
      const chat = await prisma.chat.create({
        data: {
          requestId,
          participants: {
            connect: userIds.map((id) => ({ id })),
          },
        },
        include: { Message: true, User: true },
      });

      return chat;
    },
  },

  Subscription: {
    // Подписка на новые сообщения
    messageSent: {
      subscribe: (_, { chatId }) => pubsub.asyncIterator(`${CHAT_CHANNEL}_${chatId}`),
    },
    messageReceived: {
      subscribe: () => pubsub.asyncIterator([MESSAGE_RECEIVED])
    }
  },
};

export default chatResolver;

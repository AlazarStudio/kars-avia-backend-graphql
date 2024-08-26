import { prisma } from "../../prisma.js"
import { PubSub } from 'graphql-subscriptions';

const pubsub = new PubSub()
const chats = []
const CHAT_CHANNEL = "CHAT_CHANNEL"

const chatResolver = {
  Query: {
    chats(_, args, context) {
      return chats
    }
  },

  Mutation: {
    sendMessage(_, { from, message }, { pubsub }) {
      const chat = { id: chats.length + 1, from, message }

      chats.push(chat)
      pubsub.publish("CHAT_CHANNEL", { messageSent: chat })

      return chat
    }
  },

  Subscription: {
    messageSent: {
      subscribe: (_, args, { pubsub }) => {
        return pubsub.asyncIterator(CHAT_CHANNEL)
      }
    }
  }
}

export default chatResolver

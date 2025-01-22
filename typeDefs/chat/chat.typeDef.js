const chatTypeDef = `#graphql

scalar Date

  type Message {
    id: ID!
    text: String!
    sender: User!
    chat: Chat!
    createdAt: Date!
    isRead: Boolean!
  }

  type Chat {
    id: ID!
    requestId: ID
    reserveId: ID
    messages: [Message]
    participants: [User!]
    createdAt: Date!
    separator: String
  }

  type ChatUser {
    id: ID!
    chat: Chat!
    user: User!
  }

  type Query {
    chats(requestId: ID, reserveId: ID): [Chat!]!
    messages(chatId: ID!): [Message!]!
    messagesFrom(senderId: ID!): [Message!]!
    messagesTo(receiverId: ID!): [Message!]!
    unreadMessages(receiverId: ID!): [Message!]!
  }

  type Mutation {
    sendMessage(chatId: ID, senderId: ID!, text: String!): Message!
    createChat(requestId: ID!, userIds: [ID!]!): Chat!
    markMessageAsRead(messageId: ID!): Message!
  }

  type Subscription {
    messageSent(chatId: ID!): Message
    messageReceived(senderId: ID!, receiverId: ID!): Message!
  }

`

export default chatTypeDef

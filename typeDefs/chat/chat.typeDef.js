const chatTypeDef = `#graphql
  type Message {
    id: ID!
    text: String!
    sender: User!
    chat: Chat!
    createdAt: String!
  }

  type Chat {
    id: ID!
    requestId: ID!
    messages: [Message!]
    participants: [User!]
    createdAt: String!
  }

  type ChatUser {
    id: ID!
    chat: Chat!
    user: User!
  }

  type Query {
    chats(requestId: ID!): [Chat!]!
    messages(chatId: ID!): [Message!]!
    messagesFrom(senderId: ID!): [Message!]!
    messagesTo(receiverId: ID!): [Message!]!
  }

  type Mutation {
    sendMessage(chatId: ID, senderId: ID!, text: String!): Message!
    createChat(requestId: ID!, userIds: [ID!]!): Chat!
  }

  type Subscription {
    messageSent(chatId: ID!): Message
    messageReceived(senderId: ID!, receiverId: ID!): Message!
  }
`
export default chatTypeDef

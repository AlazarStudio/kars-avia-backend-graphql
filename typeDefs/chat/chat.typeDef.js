const chatTypeDef = `#graphql
  type Message {
    id: ID!
    text: String!
    sender: User!
    receiver: User
    chat: Chat
    createdAt: String!
  }

  type Chat {
    id: ID!
    requestId: ID!
    messages: [Message!]!
    participants: [User!]!
    createdAt: String!
  }

  type Query {
    chats(requestId: ID!): [Chat!]!
    messages(chatId: ID!): [Message!]!
  }

  type Mutation {
    sendMessage(chatId: ID, senderId: ID!, receiverId: ID, text: String!): Message!
    createChat(requestId: ID!, userIds: [ID!]!): Chat!
  }

  type Subscription {
    messageSent(chatId: ID!): Message
    messageReceived(senderId: ID!, receiverId: ID!): Message!
  }
`
export default chatTypeDef

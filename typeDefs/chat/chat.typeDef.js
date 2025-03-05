const chatTypeDef = `#graphql
scalar Date

type Message {
  id: ID!
  text: String!
  sender: User!
  chat: Chat!
  createdAt: Date!
  isRead: Boolean!
  readBy: [MessageRead!]
  separator: String
}

type MessageRead {
  id: ID
  message: Message
  user: User
  readAt: Date
}

type Chat {
  id: ID!
  requestId: ID
  reserveId: ID
  messages: [Message!]!
  participants: [User!]!
  createdAt: Date!
  isSupport: Boolean!
  unreadMessagesCount: Int 
  separator: String
  airlineId: ID
  hotelId: ID
  hotel: Hotel
  airline: Airline
}

type Query {
  chat(chatId: ID!): Chat 
  chats(requestId: ID, reserveId: ID): [Chat!]!
  messages(chatId: ID!): [Message!]!
  unreadMessages(chatId: ID!, userId: ID!): [Message!]!
  unreadMessagesInChat(chatId: ID!, userId: ID!): [Message!]!
  readMessages(chatId: ID!, userId: ID!): [Message!]!
}

type Mutation {
  sendMessage(chatId: ID!, senderId: ID!, text: String!): Message!
  createChat(requestId: ID!, userIds: [ID!]!): Chat!
  markMessageAsRead(messageId: ID!, userId: ID!): MessageRead! 
  markAllMessagesAsRead(chatId: ID!, userId: ID!): Boolean! 
}

type Subscription {
  messageSent(chatId: ID!): Message
  newUnreadMessage(chatId: ID!, userId: ID!): Message!
  messageRead(chatId: ID!): MessageRead!
}
`

export default chatTypeDef

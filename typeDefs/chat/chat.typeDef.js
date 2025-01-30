const chatTypeDef = `#graphql

scalar Date

type Message {
  id: ID!
  text: String!
  sender: User!
  chat: Chat!
  createdAt: Date!
  isRead: Boolean! # Используется только для приватных чатов
  readBy: [MessageRead!]! # Список пользователей, которые прочитали сообщение
}

type MessageRead {
  id: ID!
  message: Message!
  user: User!
  readAt: Date!
}

type Chat {
  id: ID!
  requestId: ID
  reserveId: ID
  messages: [Message]
  participants: [User!]
  createdAt: Date!
  unreadMessagesCount(userId: ID!): Int! # Непрочитанные сообщения для конкретного пользователя
  separator: String
  
}

type Query {
  chats(requestId: ID, reserveId: ID): [Chat!]!
  messages(chatId: ID!): [Message!]!
  unreadMessages(receiverId: ID!): [Message!]!
  unreadMessagesInChat(chatId: ID!, userId: ID!): [Message!]! # Непрочитанные сообщения в конкретном чате
  readMessages(chatId: ID!, userId: ID!): [Message!]! # Сообщения, которые пользователь прочитал
}

type Mutation {
  sendMessage(chatId: ID, senderId: ID!, text: String!): Message!
  createChat(requestId: ID!, userIds: [ID!]!): Chat!
  markMessageAsRead(messageId: ID!, userId: ID!): MessageRead! # Индивидуальная пометка сообщения
  markAllMessagesAsRead(chatId: ID!, userId: ID!): Boolean! # Пометка всех сообщений как прочитанных
}

type Subscription {
  messageSent(chatId: ID!): Message
  newUnreadMessage(chatId: ID!, userId: ID!): Message! # Подписка на новые непрочитанные сообщения
  messageRead(chatId: ID!): MessageRead! # Подписка на событие прочтения сообщения
}

`

export default chatTypeDef

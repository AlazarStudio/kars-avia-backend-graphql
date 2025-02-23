const chatTypeDef = `#graphql
scalar Date

type Message {
  id: ID!
  text: String!
  sender: User!
  chat: Chat!
  createdAt: Date!
  isRead: Boolean!            # Используется только для приватных чатов
  readBy: [MessageRead!]!     # Список пользователей, которые прочитали сообщение
  separator: String
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
  messages: [Message!]!
  participants: [User!]!      # Резолвер должен извлекать пользователей через связь ChatUser
  createdAt: Date!
  isSupport: Boolean!         # Соответствует полю isSupport в модели Chat
  unreadMessagesCount(userId: ID!): Int!  # Вычисляемое поле для непрочитанных сообщений конкретного пользователя
  separator: String
  airlineId: ID
  hotelId: ID
  hotel: Hotel
  airline: Airline            # При необходимости, если нужна связь с авиакомпанией
}

type Query {
  chats(requestId: ID, reserveId: ID): [Chat!]!
  messages(chatId: ID!): [Message!]!
  unreadMessages(receiverId: ID!): [Message!]!
  unreadMessagesInChat(chatId: ID!, userId: ID!): [Message!]!  # Непрочитанные сообщения в конкретном чате
  readMessages(chatId: ID!, userId: ID!): [Message!]!         # Сообщения, которые пользователь прочитал
}

type Mutation {
  sendMessage(chatId: ID!, senderId: ID!, text: String!): Message!
  createChat(requestId: ID!, userIds: [ID!]!): Chat!
  markMessageAsRead(messageId: ID!, userId: ID!): MessageRead!   # Индивидуальная пометка сообщения как прочитанного
  markAllMessagesAsRead(chatId: ID!, userId: ID!): Boolean!       # Пометка всех сообщений в чате как прочитанных
}

type Subscription {
  messageSent(chatId: ID!): Message
  newUnreadMessage(chatId: ID!, userId: ID!): Message!   # Подписка на новые непрочитанные сообщения
  messageRead(chatId: ID!): MessageRead!               # Подписка на событие прочтения сообщения
}
`

export default chatTypeDef

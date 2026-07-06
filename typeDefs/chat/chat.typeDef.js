const chatTypeDef = /* GraphQL */ `
  #graphql
  scalar Date

  enum ChannelType {
    INTERNAL
    TELEGRAM
    WHATSAPP
    MAX
  }

  type Message {
    id: ID!
    text: String!
    sender: User
    senderExternalUserId: ID
    senderName: String
    chat: Chat!
    createdAt: Date!
    isRead: Boolean!
    readBy: [MessageRead!]
    separator: String

    #Поля для ботов из сторонних сервисов
    channelType: ChannelType!            # Откуда пришло (MAX, TELEGRAM, WHATSAPP)
    externalMessageId: String            # ID сообщения в мессенджере
  }

  # Минимальный набор для управления ботами
  type BotConfig {
    id: ID!
    channelType: ChannelType!
    name: String!
    isActive: Boolean!
    webhookUrl: String
    createdAt: Date!
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
    passengerRequestId: ID
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
    supportStatus: String
    assignedTo: User
    resolvedAt: Date
    resolvedBy: User

    # Поля для ботов из сторонних сервисов
    channelType: ChannelType!                # Откуда пришло (MAX, TELEGRAM, WHATSAPP)
    externalChatId: String                   # ID чата в мессенджере 
    externalUserId: String                   # ID пользователя в мессенджере
    botMetadata: Json                        # Доп. данные (имя пользователя и т.д.)
  }

  type Query {
    chat(chatId: ID!): Chat
    chats(requestId: ID, reserveId: ID, passengerRequestId: ID): [Chat!]!
    messages(chatId: ID!): [Message!]!
    unreadMessages(chatId: ID!, userId: ID!): [Message!]!
    unreadMessagesCount(chatId: ID!, userId: ID!): Int
    readMessages(chatId: ID!, userId: ID!): [Message!]!

    # Получение конфигов всех ботов
    botConfigs: [BotConfig!]!
  }

  type Mutation {
    sendMessage(chatId: ID!, senderId: ID, text: String!): Message!
    createChat(requestId: ID!, userIds: [ID!]!): Chat!
    markMessageAsRead(messageId: ID!, userId: ID!): MessageRead!
    markAllMessagesAsRead(chatId: ID!, userId: ID!): Boolean!

    # Добавление бота в БД
    registerBot(channelType: ChannelType!, name: String!, token: String!): BotConfig!
    
    # Получение бота по id и активности (работает или нет)
    toggleBot(id: ID!, isActive: Boolean!): BotConfig!
  }

  type Subscription {
    messageSent(chatId: ID): Message
    newUnreadMessage(userId: ID!): Message!
    messageRead(chatId: ID!): MessageRead!
  }
`

export default chatTypeDef

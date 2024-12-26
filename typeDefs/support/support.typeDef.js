const supportTypeDef = `#graphql

type Query {
  supportChats: [Chat!]! # Для поддержки: все чаты с пользователями
  userSupportChat(userId: ID!): Chat! # Для пользователя: один чат с поддержкой
}

type Mutation {
  createSupportChat(userId: ID!): Chat! # Создает чат между пользователем и поддержкой
}

`

export default supportTypeDef

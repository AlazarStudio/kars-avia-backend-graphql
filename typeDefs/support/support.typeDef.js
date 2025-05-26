const supportTypeDef = `#graphql
scalar Upload
scalar Date

type PatchNote {
  id: ID!
  date: Date
  name: String!
  description: String!
  files: [String]
}

input PatchNoteInput {
  date: Date
  name: String!
  description: String!
  files: [String!]
}

input PatchNoteUpdateInput {
  name: String
  description: String
  files: [String!]
  date: Date
}

type Query {
  getAllPatchNotes: [PatchNote!]!
  getPatchNote(id: ID!): PatchNote
  supportChats: [Chat!]! # Для поддержки: все чаты с пользователями
  userSupportChat(userId: ID!): Chat! # Для пользователя: один чат с поддержкой
}

type Mutation {
  createSupportChat(userId: ID!): Chat! # Создает чат между пользователем и поддержкой
  createPatchNote(data: PatchNoteInput!): PatchNote!
  updatePatchNote(id: ID!, data: PatchNoteUpdateInput!): PatchNote!
}

`

export default supportTypeDef

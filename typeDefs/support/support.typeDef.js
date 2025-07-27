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

type Documentation {
  id: ID!
  chapter: String
  category: String
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

input DocumentationInput {
  chapter: String
  category: String
  name: String!
  description: String!
  files: [String!]
}

input DocumentationUpdateInput {
  chapter: String
  category: String
  name: String
  description: String
  files: [String!]
  date: Date
}

type Query {
  getAllPatchNotes: [PatchNote!]!
  getAllDocumentations: [Documentation!]!
  getPatchNote(id: ID!): PatchNote
  getDocumentation(id: ID!): Documentation
  supportChats: [Chat!]! # Для поддержки: все чаты с пользователями
  userSupportChat(userId: ID!): Chat! # Для пользователя: один чат с поддержкой
}

type Mutation {
  createSupportChat(userId: ID!): Chat! # Создает чат между пользователем и поддержкой
  createPatchNote(data: PatchNoteInput!): PatchNote!
  createDocumentation(data: DocumentationInput!): Documentation!
  updatePatchNote(id: ID!, data: PatchNoteUpdateInput!): PatchNote!
  updateDocumentation(id: ID!, data: DocumentationUpdateInput!): Documentation!
}

`

export default supportTypeDef

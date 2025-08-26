const supportTypeDef = `#graphql
scalar Upload
scalar Date

type PatchNote {
  id: ID!
  date: Date
  name: String!
  description: String!
  files: [String]
  images: [String]
}

enum DocumentationType {
  documentation
  update
  etc
}

type Documentation {
  id: ID!
  parentId: ID
  parent: Documentation
  children: [Documentation]
  order: Int
  type: DocumentationType
  name: String!
  description: String
  files: [String]
  images: [String]
}

input PatchNoteInput {
  date: Date
  name: String!
  description: String!
  # files: [String]
  # images: [String]
}

input PatchNoteUpdateInput {
  date: Date
  name: String
  description: String
  # files: [String]
  # images: [String]
}

input DocumentationInput {
  parentId: ID
  order: Int
  type: DocumentationType
  name: String!
  description: String
  # files: [String]
  # images: [String]
  children: [DocumentationInput]
}

input DocumentationUpdateInput {
  parentId: ID
  order: Int
  type: DocumentationType
  name: String
  description: String
  # files: [String]
  # images: [String]
  children: [DocumentationInput]
}

type Query {
  getAllPatchNotes: [PatchNote!]!
  getAllDocumentations: [Documentation!]!
  documentationTree(id: ID!): Json
  getPatchNote(id: ID!): PatchNote
  getDocumentation(id: ID!): Documentation
  supportChats: [Chat!]! # Для поддержки: все чаты с пользователями
  userSupportChat(userId: ID!): Chat! # Для пользователя: один чат с поддержкой
}

type Mutation {
  createSupportChat(userId: ID!): Chat! # Создает чат между пользователем и поддержкой
  createPatchNote(data: PatchNoteInput!, images: [Upload!]): PatchNote!
  updatePatchNote(id: ID!, data: PatchNoteUpdateInput!, images: [Upload!]): PatchNote!
  createDocumentation(data: DocumentationInput!, images: [Upload!]): Documentation!
  updateDocumentation(id: ID!, data: DocumentationUpdateInput!, images: [Upload!]): Documentation!
  moveDocumentation(id: ID!, newParentId: ID, newOrder: Int): Documentation!
  deleteDocumentation(id: ID!): Documentation
}

`

export default supportTypeDef

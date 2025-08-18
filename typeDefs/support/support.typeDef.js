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

enum DocumentationType {
  documentation
  update
  etc
}


# type Documentation {
#   id: ID!
#   chapter: String
#   category: String
#   name: String!
#   description: String!
#   files: [String]
# }

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
}

input PatchNoteInput {
  date: Date
  name: String!
  description: String!
  files: [String]
}

input PatchNoteUpdateInput {
  name: String
  description: String
  files: [String]
  date: Date
}

input DocumentationInput {
  parentId: ID
  order: Int
  type: DocumentationType
  name: String!
  description: String
  files: [String]
  children: [DocumentationInput]
}

input DocumentationUpdateInput {
  parentId: ID
  order: Int
  type: DocumentationType
  name: String
  description: String
  files: [String]
  children: [DocumentationInput]
}

type Query {
  getAllPatchNotes: [PatchNote!]!
  getAllDocumentations: [Documentation!]!
  # documentationTree: [Documentation!]!
  documentationTree: [Documentation!]!
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
  moveDocumentation(id: ID!, newParentId: ID, newOrder: Int): Documentation!
  deleteDocumentation(id: ID!): Documentation
}

`

export default supportTypeDef

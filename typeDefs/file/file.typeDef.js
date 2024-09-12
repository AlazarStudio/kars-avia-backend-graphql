import GraphQLUpload from "graphql-upload/GraphQLUpload.mjs"

const fileTypeDef = `#graphql
# file.typeDef.js
scalar Upload

# Определяем тип файла, который возвращается после загрузки
type File {
  filename: String!
  mimetype: String!
  encoding: String!
}

# Запросы
type Query {
  # Пример запроса, если необходим
  otherFields: Boolean!
}

# Мутации
type Mutation {
  # Мутация для загрузки файла с объектом ввода
  singleUpload(file: Upload!): File!
}
`

export default fileTypeDef

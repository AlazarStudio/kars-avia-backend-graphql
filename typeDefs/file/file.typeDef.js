import GraphQLUpload from "graphql-upload/GraphQLUpload.mjs"

const fileTypeDef = `#graphql

scalar Upload

type File {
  filename: String!
  mimetype: String!
  encoding: String!
}

type Mutation {
  singleUpload(file: Upload!): File!
}

`

export default fileTypeDef

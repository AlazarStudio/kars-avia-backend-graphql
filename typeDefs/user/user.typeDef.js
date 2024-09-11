const userTypeDef = `#graphql

  enum Role {
    ADMIN
    SUPADMIN
    SUBADMIN
    MODERATOR
  }

  type User {
    id: ID!
    name: String!
    email: String!
    login: String!
    password: String!
    role: String!
    token: String
  }

  type Query {
    users: [User!]
    authUser: User
    user(userId: ID!): User
  }

  type Mutation {
    signUp(input: SignUpInput!): AuthPayload
    signIn(input: SignInInput!): AuthPayload
    registerUser(input: RegisterUserInput!): User
    logout: LogoutResponse
  }

  input SignUpInput {
    name: String!
    email: String!
    login: String!
    password: String!
  }

  input SignInInput {
    login: String!
    password: String!
  }

  input RegisterUserInput {
    name: String!
    email: String!
    login: String!
    password: String!
    role: String
  }

  type AuthPayload {
    id: ID!
    name: String!
    email: String!
    login: String!
    role: String!
    token: String!
  }

  type LogoutResponse {
    message: String!
  }
`

export default userTypeDef

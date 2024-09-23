const userTypeDef = `#graphql

  enum Role {
    SUPERADMIN
    ADMIN
    HOTELADMIN
    AIRLINEADMIN
    MODERATOR
    HOTELMODERATOR
    AIRLINEMODERATOR
    USER
    HOTELUSER
    AIRLINEUSER
  }

  type User {
    id: ID!
    name: String!
    email: String!
    login: String!
    password: String!
    role: String!
    token: String
    hotelId: String
    airlineId: String
    images: [String!]!
  }

  type Query {
    users: [User!]
    authUser: User
    user(userId: ID!): User
    hotelUsers(hotelId: ID!): [User!]
    airlineUsers(airlineId: ID!): [User!]
  }

  type Mutation {
    signUp(input: SignUpInput!,  images: [Upload!]): AuthPayload
    signIn(input: SignInInput!): AuthPayload
    registerUser(input: RegisterUserInput!,  images: [Upload!]): User
    updateUser(input: UpdateUserInput!,  images: [Upload!]): AuthPayload
    logout: LogoutResponse
    deleteUser(id: ID!): User!
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
    hotelId: String
    airlineId: String
  }

  input UpdateUserInput {
    id: ID
    name: String
    email: String
    login: String
    password: String
    role: String
    hotelId: String
    airlineId: String
  }

  type AuthPayload {
    id: ID
    name: String
    email: String
    login: String
    role: String
    token: String
    images: [String!]
  }

  type LogoutResponse {
    message: String!
  }
`

export default userTypeDef

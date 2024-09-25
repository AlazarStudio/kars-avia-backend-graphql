const userTypeDef = `#graphql

  enum Role {
    SUPERADMIN
    DISPATCHERADMIN
    HOTELADMIN
    AIRLINEADMIN
    DISPATCHERMODERATOR
    HOTELMODERATOR
    AIRLINEMODERATOR
    DISPATCHERUSER
    HOTELUSER
    AIRLINEUSER
    USER
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
    dispatcher: Boolean
  }

  type Query {
    users: [User!]
    authUser: User
    user(userId: ID!): User
    hotelUsers(hotelId: ID!): [User!]
    airlineUsers(airlineId: ID!): [User!]
    dispatcherUsers: [User!]
  }

  type Mutation {
    signUp(input: SignUpInput!,  images: [Upload!]): AuthPayload
    signIn(input: SignInInput!): AuthPayload
    registerUser(input: RegisterUserInput!,  images: [Upload!]): User
    updateUser(input: UpdateUserInput!,  images: [Upload!]): AuthPayload
    logout: LogoutResponse
    deleteUser(id: ID!): User!
    # ---- 2FA ---- ↓↓↓↓
    enable2FA: QRCodeResponse
    verify2FA(token: String!): SuccessResponse
  }

  input SignUpInput {
    name: String!
    email: String!
    login: String!
    password: String!
    token2FA: String
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
    dispatcher: Boolean
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

  type QRCodeResponse {
    qrCodeUrl: String!
  }

  type SuccessResponse {
    success: Boolean!
  }

  type LogoutResponse {
    message: String!
  }
`

export default userTypeDef

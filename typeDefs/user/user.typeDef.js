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

  enum TwoFAMethod {
    HOTP
    TOTP
  }

  type User {
    id: ID!
    name: String!
    email: String!
    login: String!
    password: String!
    role: String!
    position: String
    token: String
    hotelId: String
    airlineId: String
    images: [String]
    dispatcher: Boolean
    twoFASecret: String
    twoFAMethod: TwoFAMethod
    airlineDepartmentId: String
    support: Boolean
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
    refreshToken(refreshToken: String!): AuthPayload
    enable2FA(input: TwoFAMethodInput): QRCodeResponse
    verify2FA(token: String!): SuccessResponse
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
    token2FA: String
  }

  input RegisterUserInput {
    name: String!
    email: String!
    login: String!
    password: String!
    role: String
    position: String
    hotelId: String
    airlineId: String
    dispatcher: Boolean
    airlineDepartmentId: ID
  }

  input UpdateUserInput {
    id: ID
    name: String
    email: String
    login: String
    password: String
    role: String
    position: String
    hotelId: String
    airlineId: String
    airlineDepartmentId: ID
  }

  input TwoFAMethodInput {
    method: TwoFAMethod
  }

  type AuthPayload {
    id: ID
    name: String
    email: String
    login: String
    role: String
    position: String
    token: String
    refreshToken: String
    images: [String!]
  }

  type QRCodeResponse {
    qrCodeUrl: String
  }

  type SuccessResponse {
    success: Boolean!
  }

  type LogoutResponse {
    message: String!
  }

  type Subscription {
    userCreated: User!
  }

`

export default userTypeDef

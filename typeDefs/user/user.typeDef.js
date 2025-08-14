const userTypeDef = `#graphql
scalar Date

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
  lastSeen: Date
  name: String!
  email: String!
  login: String!
  password: String!
  role: Role!
  # position: String
  position: Position
  token: String
  hotelId: ID
  airlineId: ID
  images: [String]
  dispatcher: Boolean
  twoFASecret: String
  twoFAMethod: TwoFAMethod
  airlineDepartmentId: ID
  support: Boolean
  active: Boolean
  refreshToken: String
  fingerprint: String
  online: Boolean
}

type Position {
  id: ID!
  name: String!
  separator: String!
  category: String
  user: [User]
  airlinePersonal: [AirlinePersonal]
  airlineDepartment: [AirlineDepartment]
  # hotelId: ID
  # airlineId: ID
}

input UserPaginationInput {
  skip: Int
  take: Int
  all: Boolean
  search: String
}

type UserConnection {
  totalPages: Int!
  totalCount: Int!
  users: [User!]!
}

type Query {
  users(pagination: UserPaginationInput): UserConnection!
  authUser: User
  user(userId: ID!): User
  hotelUsers(pagination: UserPaginationInput, hotelId: ID!): UserConnection!
  airlineUsers(pagination: UserPaginationInput, airlineId: ID!): UserConnection!
  dispatcherUsers(pagination: UserPaginationInput): UserConnection!
}

type Mutation {
  signUp(input: SignUpInput!, images: [Upload!]): AuthPayload
  signIn(input: SignInInput!): AuthPayload
  registerUser(input: RegisterUserInput!, images: [Upload!]): User
  updateUser(input: UpdateUserInput!, images: [Upload!]): AuthPayload
  logout: LogoutResponse
  deleteUser(id: ID!): User!
  refreshToken(refreshToken: String!, fingerprint: String!): AuthPayload
  enable2FA(input: TwoFAMethodInput): QRCodeResponse
  verify2FA(token: String!): SuccessResponse
  requestResetPassword(email: String!): String!
  resetPassword(token: String!, newPassword: String!): String!
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
  fingerprint: String!
  token2FA: String
}

input PositionInput {
  name: String!
  separator: String
  category: String
  # hotelId: ID
  # airlineId: ID
  # airlineDepartmentId: ID
  }

input RegisterUserInput {
  name: String!
  email: String!
  login: String!
  password: String!
  role: Role
  # position: String
  positionId: ID
  hotelId: ID
  airlineId: ID
  dispatcher: Boolean
  airlineDepartmentId: ID
}

input UpdateUserInput {
  id: ID!
  name: String
  email: String
  login: String
  password: String
  oldPassword: String
  role: Role
  # position: String
  positionId: ID
  hotelId: ID
  airlineId: ID
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
  role: Role
  # position: String
  position: Position
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
  userOnline: Boolean
}
`

export default userTypeDef

const externalAuthTypeDef = /* GraphQL */ `
  #graphql

  enum ExternalSubjectType {
    EXTERNAL_USER
  }

  enum ExternalAccessType {
    CRM
    PWA
  }

  enum ExternalScope {
    HOTEL
    DRIVER
  }

  type ExternalUser {
    id: ID!
    createdAt: Date!
    updatedAt: Date!
    email: String!
    name: String
    scope: ExternalScope!
    accessType: ExternalAccessType!
    hotelId: ID
    driverId: ID
    active: Boolean!
    sessionExpiresAt: Date
  }

  type ExternalAuthPayload {
    token: String!
    refreshToken: String!
    subjectType: ExternalSubjectType!
    externalUser: ExternalUser
  }

  type AdminMagicLinkIssueResult {
    success: Boolean!
    emailed: Boolean!
    link: String!
  }

  type ExternalUserConnection {
    totalPages: Int!
    totalCount: Int!
    users: [ExternalUser!]!
  }

  input ExternalUserFilterInput {
    hotelId: ID
    driverId: ID
    scope: ExternalScope
    accessType: ExternalAccessType
    active: Boolean
  }

  input ExternalUserPaginationInput {
    skip: Int
    take: Int
    all: Boolean
    search: String
  }

  input CreateExternalAuthLinkInput {
    email: String!
    name: String
    scope: ExternalScope!
    accessType: ExternalAccessType!
    hotelId: ID
    driverId: ID
  }

  type Query {
    externalUsers(
      pagination: ExternalUserPaginationInput
      filter: ExternalUserFilterInput
    ): ExternalUserConnection!
  }

  type Mutation {
    createExternalAuthLink(
      input: CreateExternalAuthLinkInput!
    ): AdminMagicLinkIssueResult!
    authorizeExternalAuth(token: String!): ExternalAuthPayload!
    adminExtendExternalAuthSession(externalUserId: ID!): Boolean!
  }
`

export default externalAuthTypeDef

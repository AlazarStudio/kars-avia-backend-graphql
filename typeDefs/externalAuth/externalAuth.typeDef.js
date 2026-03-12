const externalAuthTypeDef = /* GraphQL */ `
  #graphql

  enum ExternalSubjectType {
    EXTERNAL_USER
    PASSENGER_REQUEST_EXTERNAL_USER
  }

  enum PassengerRequestExternalAccountType {
    CRM
    PVA
    REPRESENTATIVE
  }

  type ExternalUser {
    id: ID!
    createdAt: Date!
    updatedAt: Date!
    email: String!
    name: String
    hotelId: ID
    organizationId: ID
    airlineId: ID
    active: Boolean!
    sessionExpiresAt: Date
  }

  type PassengerRequestExternalUser {
    id: ID!
    createdAt: Date!
    updatedAt: Date!
    email: String
    login: String!
    accountType: PassengerRequestExternalAccountType!
    name: String
    passengerRequestId: ID!
    passengerServiceHotelItemId: String
    active: Boolean!
    sessionExpiresAt: Date
  }

  type ExternalAuthPayload {
    token: String!
    refreshToken: String!
    subjectType: ExternalSubjectType!
    externalUser: ExternalUser
    passengerRequestExternalUser: PassengerRequestExternalUser
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
    organizationId: ID
    airlineId: ID
    active: Boolean
  }

  input ExternalUserPaginationInput {
    skip: Int
    take: Int
    all: Boolean
    search: String
  }

  input AdminIssueExternalUserMagicLinkInput {
    email: String!
    name: String
    hotelId: ID
    organizationId: ID
    airlineId: ID
  }

  input AdminIssuePassengerRequestExternalUserMagicLinkInput {
    email: String
    accountType: PassengerRequestExternalAccountType!
    name: String
    passengerRequestId: ID!
    passengerServiceHotelItemId: String
  }

  type Query {
    externalUsers(
      pagination: ExternalUserPaginationInput
      filter: ExternalUserFilterInput
    ): ExternalUserConnection!
    passengerRequestExternalUsers(
      passengerRequestId: ID!
    ): [PassengerRequestExternalUser!]!
  }

  type Mutation {
    adminIssueExternalUserMagicLink(
      input: AdminIssueExternalUserMagicLinkInput!
    ): AdminMagicLinkIssueResult!
    externalUserSignInWithMagicLink(
      token: String!
      fingerprint: String
    ): ExternalAuthPayload!
    adminExtendExternalUserSession(externalUserId: ID!): Boolean!
    adminReissueExternalUserMagicLink(
      externalUserId: ID!
    ): AdminMagicLinkIssueResult!

    adminIssuePassengerRequestExternalUserMagicLink(
      input: AdminIssuePassengerRequestExternalUserMagicLinkInput!
    ): AdminMagicLinkIssueResult!
    passengerRequestExternalUserSignInWithMagicLink(
      token: String!
      fingerprint: String
    ): ExternalAuthPayload!
    adminExtendPassengerRequestExternalUserSession(id: ID!): Boolean!
    adminReissuePassengerRequestExternalUserMagicLink(
      id: ID!
    ): AdminMagicLinkIssueResult!
  }
`

export default externalAuthTypeDef

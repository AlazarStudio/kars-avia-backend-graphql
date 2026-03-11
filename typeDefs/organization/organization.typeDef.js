const organizationTypeDef = /* GraphQL */ `
  #graphql

  scalar Upload

  type Organization {
    id: String!
    name: String!
    information: Information
    images: [String]
    drivers: [Driver!]!
    active: Boolean!
    transferPrices: [TransferPrice!]
  }

  input OrganizationPaginationInput {
    skip: Int
    take: Int
    all: Boolean
  }

  type OrganizationConnection {
    totalPages: Int!
    totalCount: Int!
    organizations: [Organization!]!
  }

  input OrganizationInput {
    name: String!
    information: InformationInput
    transferPrices: [TransferPriceInput!]
  }

  input UpdateOrganizationInput {
    name: String
    information: InformationInput
    transferPrices: [TransferPriceInput!]
  }

  type Query {
    organizations(
      pagination: OrganizationPaginationInput
    ): OrganizationConnection!
    organization(id: ID!): Organization
  }

  type Mutation {
    createOrganization(
      input: OrganizationInput
      images: [Upload!]
    ): Organization!
    updateOrganization(
      id: ID!
      input: UpdateOrganizationInput
      images: [Upload!]
    ): Organization!
    deleteOrganization(id: ID!): Organization!
    deleteOrganizationTransferPrice(id: ID!): Boolean!
    #добавить Update Delete
  }

  type Subscription {
    organizationCreated: Organization!
  }
`

export default organizationTypeDef

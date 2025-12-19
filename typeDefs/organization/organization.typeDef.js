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
  }

  input UpdateOrganizationInput {
    name: String
    information: InformationInput
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
    #добавить Update Delete
  }

  type Subscription {
    organizationCreated: Organization!
  }
`

export default organizationTypeDef

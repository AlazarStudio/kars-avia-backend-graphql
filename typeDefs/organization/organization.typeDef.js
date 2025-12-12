const organizationTypeDef = /* GraphQL */ `
  #graphql
  type Organization {
    id: String!
    name: String!
    information: Information
    drivers: [Driver!]!
    active: Boolean!
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
    organizations: [Organization!]!
    organization(id: ID!): Organization
  }

  type Mutation {
    createOrganization(input: OrganizationInput): Organization!
    updateOrganization(id: ID!, input: UpdateOrganizationInput): Organization!
    deleteOrganization(id: ID!): Organization!
    #добавить Update Delete
  }

  type Subscription {
    organizationCreated: Organization!
  }
`

export default organizationTypeDef

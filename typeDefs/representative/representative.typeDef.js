const representativeTypeDef = /* GraphQL */ `
  #graphql

  type RepresentativeDepartment {
    id: ID!
    createdAt: Date!
    updatedAt: Date!
    name: String!
    email: String
    active: Boolean
    accessMenu: AccessMenu
    notificationMenu: NotificationMenu
    representatives: [User!]!
    airlines: [Airline!]!
    airports: [Airport!]!
  }

  input RepresentativeDepartmentInput {
    name: String
    email: String
    accessMenu: AccessMenuInput
    notificationMenu: NotificationMenuInput
    representativeIds: [ID!]
    airlineIds: [ID!]
    airportIds: [ID!]
  }

  input RepresentativeDepartmentPaginationInput {
    skip: Int
    take: Int
    all: Boolean
  }

  type RepresentativeDepartmentConnection {
    totalPages: Int!
    totalCount: Int!
    departments: [RepresentativeDepartment!]!
  }

  type Query {
    representatives(pagination: UserPaginationInput): UserConnection!
    representativeDepartments(
      pagination: RepresentativeDepartmentPaginationInput
    ): RepresentativeDepartmentConnection!
    representativeDepartment(id: ID!): RepresentativeDepartment
  }

  type Mutation {
    createRepresentativeDepartment(
      input: RepresentativeDepartmentInput!
    ): RepresentativeDepartment!
    updateRepresentativeDepartment(
      id: ID!
      input: RepresentativeDepartmentInput!
    ): RepresentativeDepartment!
    deleteRepresentativeDepartment(id: ID!): RepresentativeDepartment!
  }

  type Subscription {
    representativeDepartmentCreated: RepresentativeDepartment!
    representativeDepartmentUpdated: RepresentativeDepartment!
  }
`

export default representativeTypeDef

const logTypeDef = /* GraphQL */ `
  #graphql
  scalar Date

  type Log {
    id: ID!
    user: User
    hotel: Hotel
    airline: Airline
    action: String!
    description: String
    oldData: String
    newData: String
    createdAt: Date!
  }

  input LogPaginationInput {
    skip: Int
    take: Int
  }

  type LogConnection {
    totalCount: Int!
    totalPages: Int!
    logs: [Log!]!
  }

  type Query {
    logs(requestId: ID!, pagination: LogPaginationInput): LogConnection!
  }
`

export default logTypeDef

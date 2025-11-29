const cityTypeDef = /* GraphQL */ `
  #graphql
  type City {
    id: ID!
    city: String!
    region: String!
  }

  type Query {
    citys: [City!]!
    city(city: String): [City!]!
  }

  # type Mutation {
  # }
`

export default cityTypeDef

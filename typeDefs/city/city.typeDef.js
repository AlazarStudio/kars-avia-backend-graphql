const cityTypeDef = /* GraphQL */ `
  #graphql
  type Region {
    id: ID!
    name: String!
  }

  type City {
    id: ID!
    city: String!
    region: String!
    regionRef: Region
  }

  type Query {
    citys: [City!]!
    city(city: String): [City!]!
    cityRegions: [String!]!
    regions: [Region!]!
    citiesByRegion(region: String!): [City!]!
    citiesByRegionId(regionId: ID!): [City!]!
  }

  # type Mutation {
  # }
`

export default cityTypeDef

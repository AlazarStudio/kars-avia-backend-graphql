const airportTypeDef = /* GraphQL */ `
  #graphql
  type Airport {
    id: ID
    name: String
    city: String
    code: String
  }

  type Query {
    airports: [Airport!]!
    airport(id: ID): Airport
    airportCity(city: String): [Airport!]!
  }
`

export default airportTypeDef

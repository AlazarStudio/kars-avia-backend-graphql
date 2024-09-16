const airportTypeDef = `#graphql
    type Airport {
        id: ID!
        name: String!
        city: String!
        code: String!
    }

    type Query {
        airports: [Airport!]!
        airport(id:ID): Airport
    }

`

export default airportTypeDef
const reportTypeDef = `#graphql

# dispatcherReport
# airlineReport
# hotelReport

type Query {
    dispatcherReport(startDate: String!, endDate: String!): [Request!]!
    airlineReport(startDate: String!, endDate: String!, airlineId: ID!): [Request!]!
    hotelReport(startDate: String!, endDate: String!, hotelId: ID!): [Request!]!
}
`
export default reportTypeDef
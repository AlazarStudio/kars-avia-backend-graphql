const reportTypeDef = `#graphql

# dispatcherReport
# airlineReport
# hotelReport

type Query {
    airlineReport(startDate: String!, endDate: String!, airlineId: ID!): [Request!]!
    dispatcherReport(startDate: String!, endDate: String!): [Request!]!
    hotelReport(startDate: String!, endDate: String!, hotelId: ID!): [Request!]!
}
`
export default reportTypeDef
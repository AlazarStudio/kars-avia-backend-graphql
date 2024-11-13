const reportTypeDef = `#graphql

scalar Date

# dispatcherReport
# airlineReport
# hotelReport

type Query {
    dispatcherReport(startDate: Date!, endDate: Date!): [Request!]!
    airlineReport(startDate: Date!, endDate: Date!, airlineId: ID!): [Request!]!
    hotelReport(startDate: Date!, endDate: Date!, hotelId: ID!): [Request!]!
}
`
export default reportTypeDef
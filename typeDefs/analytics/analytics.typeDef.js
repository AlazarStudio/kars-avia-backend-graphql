const analyticsTypeDef = `#graphql
scalar Upload
scalar Date

enum entityType {
  dispatcher
  airline
  hotel
}

type Analytics {
  createdByPeriod: [PeriodCount]
  totalCreatedRequests: Int
  totalCancelledRequests: Int
  cancelledRequests: Int
  receivedRequests: Int
  acceptedRequests: Int
}

type PeriodCount {
  date: String
  count_created: Int
  count_canceled: Int
}

input AnalyticsInput {
  startDate: Date
  endDate: Date
  filters: FiltersInput
}

input FiltersInput {
  airlineId: String
  hotelId: String
  personId: String
}

type Query {
  analyticsEntityRequests(input: AnalyticsInput): Analytics
}



`

export default analyticsTypeDef

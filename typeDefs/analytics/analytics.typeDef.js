const analyticsTypeDef = `#graphql
scalar Upload
scalar Date

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
  airlineId: String
  hotelId: String
  startDate: Date
  endDate: Date
}

type Query {
  analiticsAirlineRequests(input: AnalyticsInput): Analytics
  analiticsHotelRequests(input: AnalyticsInput): Analytics
}

`

export default analyticsTypeDef

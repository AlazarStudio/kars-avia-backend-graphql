const analyticsTypeDef = /* GraphQL */ `
  #graphql
  scalar Upload
  scalar Date
  scalar Json

  enum entityType {
    dispatcher
    airline
    hotel
  }

  type Analytics {
    createdByPeriod: [PeriodCount]
    # statusCounts: [StatusCount]
    statusCounts: Json
    totalCancelledRequests: Int
    totalCreatedRequests: Int
    cancelledRequests: Int
    receivedRequests: Int
    acceptedRequests: Int
  }

  type AnalyticsUser {
    createdRequests: Int
    processedRequests: Int
    cancelledRequests: Int
  }

  type UserShort {
    id: ID!
    name: String
  }

  type PersonStaySummary {
    personId: ID!
    personName: String
    personPosition: String
    totalDays: Int
    createdBy: [UserShort]
    postedBy: [UserShort]
  }

  type PeriodCount {
    date: String
    count_created: Int
    count_canceled: Int
  }

  type StatusCount {
    status: String
    count: Int
  }

  input AnalyticsInput {
    startDate: Date
    endDate: Date
    filters: FiltersInput
  }

  input AnalyticsUserInput {
    filters: FiltersInput
    startDate: Date
    endDate: Date
  }

  input FiltersInput {
    airlineId: String
    hotelId: String
    personId: String
  }

  type Query {
    analyticsEntityRequests(input: AnalyticsInput): Analytics
    analyticsEntityUsers(input: AnalyticsUserInput): AnalyticsUser
    analyticsPersonStaySummary(input: AnalyticsInput): [PersonStaySummary!]!
  }
`

export default analyticsTypeDef

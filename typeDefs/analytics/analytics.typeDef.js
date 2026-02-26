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

  enum AnalyticsPeriod {
    WEEK
    MONTH
    CUSTOM
  }

  type UserTimeDayStat {
    date: String!
    minutes: Int!
    hours: Float!
  }

  type UserTimeAnalytics {
    periodStart: Date
    periodEnd: Date
    totalMinutes: Int!
    totalHours: Float!
    periodTotalMinutes: Int!
    periodTotalHours: Float!
    averageMinutesPerActiveDay: Int!
    days: [UserTimeDayStat!]!
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

  input UserTimeAnalyticsInput {
    userId: ID
    period: AnalyticsPeriod = WEEK
    startDate: Date
    endDate: Date
  }

  type Query {
    analyticsEntityRequests(input: AnalyticsInput): Analytics
    analyticsEntityUsers(input: AnalyticsUserInput): AnalyticsUser
    analyticsPersonStaySummary(input: AnalyticsInput): [PersonStaySummary!]!
    analyticsUsersTime(input: UserTimeAnalyticsInput): UserTimeAnalytics!
  }
`

export default analyticsTypeDef

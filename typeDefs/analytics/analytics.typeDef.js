const analyticsTypeDef = /* GraphQL */ `
  #graphql
  scalar Upload
  scalar Date
  scalar Json

  enum AnalyticsServiceType {
    LIVING
    MEAL
    TRANSFER
  }

  enum AnalyticsCrewFilterMode {
    ALL
    SQUADRON
    TECHNICIAN
    POSITIONS
  }

  input AnalyticsDateRangeInput {
    startDate: Date!
    endDate: Date!
  }

  input AnalyticsCrewFilterInput {
    mode: AnalyticsCrewFilterMode! = ALL
    positionNames: [String!]
  }

  input AnalyticsAirlineServiceComparisonInput {
    airlineId: ID!
    period1: AnalyticsDateRangeInput!
    period2: AnalyticsDateRangeInput!
    services: [AnalyticsServiceType!]! = [LIVING, MEAL, TRANSFER]
    crew: AnalyticsCrewFilterInput
    regions: [String!]
  }

  type AnalyticsComparisonMetrics {
    peopleCount: Int!
    budgetRub: Float!
    roomsUsed: Int!
  }

  type AnalyticsComparisonDiff {
    peopleDelta: Int!
    peopleDeltaPct: Float
    budgetDeltaRub: Float!
    budgetDeltaPct: Float
    roomsDelta: Int!
    roomsDeltaPct: Float
  }

  type AirlineServiceComparisonRow {
    region: String!
    service: AnalyticsServiceType!
    period1: AnalyticsComparisonMetrics!
    period2: AnalyticsComparisonMetrics!
    diff: AnalyticsComparisonDiff!
  }

  input DispatchersAnalyticsInput {
    startDate: Date!
    endDate: Date!
    dispatcherIds: [ID!]
  }

  type DispatcherMetrics {
    processedPlacementRequests: Int!
    processedTransferRequests: Int!
    processedHotels: Int!
    processedContracts: Int!
    avgReactionMinutes: Float
    avgProcessingMinutes: Float
    avgWorkHours: Float
  }

  type DispatcherMetricsRow {
    dispatcher: UserShort!
    metrics: DispatcherMetrics!
  }

  type DispatchersAnalyticsResult {
    totals: DispatcherMetrics!
    byDispatcher: [DispatcherMetricsRow!]!
  }

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

  input AirlineAnalyticsPeriodInput {
    dateFrom: Date!
    dateTo: Date!
    airportIds: [ID!]
    positionIds: [ID!]
  }

  input AirlineAnalyticsInput {
    airlineId: ID!
    services: [AnalyticsServiceType!]
    period1: AirlineAnalyticsPeriodInput!
    period2: AirlineAnalyticsPeriodInput
  }

  type AirlineAnalyticsPositionItem {
    positionId: ID
    positionName: String!
    count: Int!
    percent: Float!
    budget: Float!
  }

  type AirlineAnalyticsAirportItem {
    airportId: ID
    airportName: String
    airportCode: String
    requestsCount: Int!
    uniquePeopleCount: Int!
    budget: Float!
    usedRoomsCount: Int
  }

  type AirlineAnalyticsRequestItem {
    requestId: ID!
    personId: ID
    personName: String
    positionId: ID
    positionName: String
    airportId: ID
    airportName: String
    budget: Float!
    livingBudget: Float!
    mealBudget: Float!
    transferBudget: Float!
  }

  type AirlineAnalyticsTransferItem {
    transferId: ID!
    requestNumber: String
    fromAddress: String
    toAddress: String
    passengersCount: Int!
    uniquePeopleCount: Int!
    budget: Float!
  }

  type AirlineAnalyticsServiceBlock {
    service: AnalyticsServiceType!
    totalRequests: Int!
    uniquePeopleCount: Int!
    totalBudget: Float!
    usedRoomsCount: Int
    airports: [AirlineAnalyticsAirportItem!]!
    positions: [AirlineAnalyticsPositionItem!]!
    requests: [AirlineAnalyticsRequestItem!]!
    transfers: [AirlineAnalyticsTransferItem!]!
  }

  type AirlineAnalyticsPeriodBlock {
    dateFrom: Date!
    dateTo: Date!
    services: [AirlineAnalyticsServiceBlock!]!
  }

  type AirlineAnalyticsResult {
    period1: AirlineAnalyticsPeriodBlock!
    period2: AirlineAnalyticsPeriodBlock
  }

  type Query {
    analyticsEntityRequests(input: AnalyticsInput): Analytics
    analyticsEntityUsers(input: AnalyticsUserInput): AnalyticsUser
    analyticsPersonStaySummary(input: AnalyticsInput): [PersonStaySummary!]!
    analyticsUsersTime(input: UserTimeAnalyticsInput): UserTimeAnalytics!
    analyticsAirlineServiceComparison(
      input: AnalyticsAirlineServiceComparisonInput!
    ): [AirlineServiceComparisonRow!]!
    analyticsDispatchersPerformance(
      input: DispatchersAnalyticsInput!
    ): DispatchersAnalyticsResult!
    airlineAnalytics(
      input: AirlineAnalyticsInput!
    ): AirlineAnalyticsResult!
  }
`

export default analyticsTypeDef

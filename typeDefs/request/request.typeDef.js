const requestTypeDef = /* GraphQL */ `
  #graphql
  scalar Date
  scalar Upload

  # Основные типы
  type Request {
    id: ID!
    person: AirlinePersonal
    personId: ID
    airportId: ID!
    airport: Airport!
    arrival: Date!
    departure: Date!
    actualCheckInAt: Date
    roomCategory: String
    mealPlan: MealPlan
    senderId: ID!
    receiverId: ID
    createdAt: Date
    updatedAt: Date
    hotelId: ID
    hotel: Hotel
    hotelChess: HotelChess
    roomNumber: String
    airlineId: ID
    airline: Airline!
    airlineDepartmentId: ID
    airlineDepartment: AirlineDepartment
    status: String
    requestNumber: String
    archive: Boolean
    chat: [Chat]
    # logs: [Log]
    logs(pagination: LogPaginationInput): LogConnection!
    reserve: Boolean
    defaultTimesUsed: Boolean
    note: String
    files: [String]
    requestAirlinePrice: RequestPrice
    requestHotelPrice: RequestPrice
    externalBookingNumber: String
    externalSource: String
    bulkGroupId: String
    linkNumber: String
    arrivalFlightNumber: String
    arrivalAircraftType: String
    arrivalFlightStatus: String
    departureFlightNumber: String
    departureAircraftType: String
    departureFlightStatus: String
    singleRoomCount: Int
    doubleRoomCount: Int
  }

  # type Log {
  #   id: ID!
  #   user: User
  #   hotel: Hotel
  #   airline: Airline
  #   action: String!
  #   description: String
  #   oldData: String
  #   newData: String
  #   createdAt: Date!
  # }

  type RequestConnection {
    totalPages: Int!
    totalCount: Int!
    requests: [Request!]!
  }

  type RequestGroup {
    key: String!
    label: String!
    isBulk: Boolean!
    bulkGroupId: String
    airlineId: ID!
    airline: Airline!
    airportId: ID
    airport: Airport
    year: Int
    month: Int
    requestCount: Int!
    requests: [Request!]!
  }

  type RequestGroupConnection {
    totalGroups: Int!
    totalPages: Int!
    groups: [RequestGroup!]!
  }

  # Входные типы
  input CreateRequestInput {
    personId: ID
    airportId: ID!
    arrival: Date!
    departure: Date!
    roomCategory: String
    mealPlan: MealPlanInput
    airlineId: ID!
    senderId: ID!
    status: String
    reserve: Boolean
    defaultTimesUsed: Boolean
    note: String
  }

  input UpdateRequestInput {
    personId: ID
    airlineId: ID
    arrival: Date
    departure: Date
    actualCheckInAt: Date
    roomCategory: String
    mealPlan: MealPlanInput
    hotelId: ID
    roomId: ID
    place: Float
    status: String
    note: String
  }

  # input MealPlanInput {
  #   included: Boolean
  #   breakfast: Int
  #   lunch: Int
  #   dinner: Int
  # }

  input MealPlanInput {
    included: Boolean!
    breakfastEnabled: Boolean
    lunchEnabled: Boolean
    dinnerEnabled: Boolean
  }

  input DailyMealInput {
    date: Date!
    breakfast: Int
    lunch: Int
    dinner: Int
  }

  input ModifyDailyMealsInput {
    requestId: ID!
    dailyMeals: [DailyMealInput!]!
  }

  input PaginationInput {
    skip: Int
    take: Int
    status: [String]
    airportId: ID
    airlineId: ID
    personId: ID
    hotelId: ID
    arrival: Date
    departure: Date
    search: String
    bulkGroupId: String
    linkNumber: String
  }

  input RequestGroupPaginationInput {
    skip: Int
    take: Int
    status: [String]
    airportId: ID
    airlineId: ID
    personId: ID
    hotelId: ID
    arrival: Date
    departure: Date
    search: String
    bulkGroupId: String
    linkNumber: String
    groupYear: Int
    groupMonth: Int
  }

  input BulkRequestImportInput {
    airportId: ID!
    airlineId: ID!
    senderId: ID!
    mealPlan: MealPlanInput
    reserve: Boolean
    defaultTimesUsed: Boolean
    bulkGroupId: String
  }

  type BulkRequestImportRowError {
    row: Int!
    message: String!
  }

  type BulkRequestImportResult {
    bulkGroupId: String!
    createdCount: Int!
    linkNumbers: [String!]!
    errors: [BulkRequestImportRowError!]!
    sourceFile: String
  }

  input ExtendRequestDatesInput {
    requestId: ID!
    newStart: Date
    newEnd: Date
    status: String
  }

  # Запросы
  type Query {
    requests(pagination: PaginationInput): RequestConnection!
    requestsByGroup(
      pagination: RequestGroupPaginationInput
    ): RequestGroupConnection!
    request(id: ID): Request
    requestArchive(pagination: PaginationInput): RequestConnection!
  }

  # Мутации
  type Mutation {
    createRequest(input: CreateRequestInput!, files: [Upload!]): Request!
    importBulkRequests(
      file: Upload!
      input: BulkRequestImportInput!
    ): BulkRequestImportResult!
    updateRequest(id: ID!, input: UpdateRequestInput!): Request!
    modifyDailyMeals(input: ModifyDailyMealsInput!): MealPlan!
    cancelRequest(id: ID!): Request!
  }

  extend type Mutation {
    extendRequestDates(input: ExtendRequestDatesInput!): Request!
    archivingRequest(id: ID!): Request!
  }

  # Подписки
  type Subscription {
    requestCreated: Request!
    requestUpdated: Request!
  }
`

export default requestTypeDef

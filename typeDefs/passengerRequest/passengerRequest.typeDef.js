const passengerRequestTypeDef = /* GraphQL */ `
  #graphql
  scalar Date

  enum PassengerRequestStatus {
    CREATED
    ACCEPTED
    IN_PROGRESS
    COMPLETED
    CANCELLED
  }

  enum PassengerServiceStatus {
    NEW
    ACCEPTED
    IN_PROGRESS
    COMPLETED
    CANCELLED
  }

  """
  Для операций над конкретным сервисом
  """
  enum PassengerServiceKind {
    WATER
    MEAL
    LIVING
    TRANSFER
    BAGGAGE_DELIVERY
  }

  """
  Сервисы только вода/питание (для people)
  """
  enum PassengerWaterFoodKind {
    WATER
    MEAL
  }

  type PassengerStatusTimes {
    acceptedAt: Date
    inProgressAt: Date
    finishedAt: Date
    cancelledAt: Date
  }

  type PassengerServicePlan {
    enabled: Boolean!
    peopleCount: Int
    plannedAt: Date
    plannedFromAt: Date
    plannedToAt: Date
  }

  type PassengerServicePerson {
    fullName: String!
    issuedAt: Date
    phone: String
    seat: String
  }

  type PassengerWaterFoodService {
    plan: PassengerServicePlan
    status: PassengerServiceStatus!
    times: PassengerStatusTimes
    earlyCompletionReason: String
    earlyCompletedAt: Date
    people: [PassengerServicePerson!]!
  }

  type PassengerServiceHotelPerson {
    fullName: String!
    phone: String
    roomNumber: String
    arrival: Date
    departure: Date
    roomCategory: String
    roomKind: String
    accommodationChesses: [PassengerAccommodationChess!]!
  }

  type PassengerAccommodationChess {
    hotelIndex: Int
    hotelName: String
    startAt: Date
    endAt: Date
    reason: String
  }

  type PassengerLivingServiceEviction {
    person: PassengerServiceHotelPerson
    hotelIndex: Int
    hotelName: String
    reason: String!
    evictedAt: Date
  }

  type PassengerServiceHotel {
    itemId: String
    hotelId: ID
    name: String!
    peopleCount: Int!
    address: String
    link: String
    linkCRM: String
    linkPWA: String
    people: [PassengerServiceHotelPerson!]!
  }

  type PassengerServiceDriverPerson {
    fullName: String!
    phone: String
  }

  type PassengerServiceDriver {
    fullName: String!
    phone: String
    peopleCount: Int
    pickupAt: Date
    link: String
    addressFrom: String
    addressTo: String
    description: String
    deliveryCompletedAt: Date
    people: [PassengerServiceDriverPerson!]!
  }

  type PassengerLivingService {
    plan: PassengerServicePlan
    status: PassengerServiceStatus!
    times: PassengerStatusTimes
    earlyCompletionReason: String
    earlyCompletedAt: Date
    hotels: [PassengerServiceHotel!]!
    evictions: [PassengerLivingServiceEviction!]!
  }

  type PassengerTransferService {
    plan: PassengerServicePlan
    status: PassengerServiceStatus!
    times: PassengerStatusTimes
    earlyCompletionReason: String
    earlyCompletedAt: Date
    drivers: [PassengerServiceDriver!]!
  }

  type PassengerRequest {
    id: ID!
    createdAt: Date!
    updatedAt: Date!

    airlineId: ID!
    airline: Airline!

    airportId: ID
    airport: Airport

    flightNumber: String!
    flightDate: Date
    routeFrom: String
    routeTo: String

    plannedPassengersCount: Int

    waterService: PassengerWaterFoodService
    mealService: PassengerWaterFoodService
    livingService: PassengerLivingService
    transferService: PassengerTransferService
    baggageDeliveryService: PassengerTransferService

    status: PassengerRequestStatus!
    statusTimes: PassengerStatusTimes
    earlyCompletionReason: String
    earlyCompletedAt: Date

    createdById: ID!
    createdBy: User!

    chats: [Chat!]!

    """Сохранённый отчёт по отелю (по индексу отеля в livingService.hotels)"""
    hotelReport(hotelIndex: Int!): PassengerRequestHotelReport
    hotelReports: [PassengerRequestHotelReport!]!

    """История действий по заявке ФАП"""
    logs(pagination: LogPaginationInput): LogConnection!
  }

  """Одна строка таблицы отчёта по отелю"""
  type PassengerRequestHotelReportRow {
    fullName: String!
    roomNumber: String
    roomCategory: String
    roomKind: String
    daysCount: Float
    breakfast: Int
    lunch: Int
    dinner: Int
    foodCost: Float
    accommodationCost: Float
  }

  """Сохранённая запись отчёта по отелю"""
  type PassengerRequestHotelReport {
    id: ID!
    createdAt: Date!
    updatedAt: Date!
    passengerRequestId: ID!
    hotelIndex: Int!
    reportRows: [PassengerRequestHotelReportRow!]!
  }

  """
  Фильтр + пагинация
  """
  input PassengerRequestFilterInput {
    airlineId: ID
    airportId: ID
    status: PassengerRequestStatus
    search: String
  }

  input PassengerServicePlanInput {
    enabled: Boolean
    peopleCount: Int
    plannedAt: Date
    plannedFromAt: Date
    plannedToAt: Date
  }

  input PassengerWaterFoodServiceInput {
    plan: PassengerServicePlanInput
  }

  input PassengerLivingServiceInput {
    plan: PassengerServicePlanInput
  }

  input PassengerTransferServiceInput {
    plan: PassengerServicePlanInput
  }

  input PassengerBaggageDeliveryServiceInput {
    plan: PassengerServicePlanInput
  }

  input PassengerServicePersonInput {
    fullName: String!
    issuedAt: Date
    phone: String
    seat: String
  }

  input PassengerServiceHotelPersonInput {
    fullName: String!
    phone: String
    roomNumber: String
    arrival: Date
    departure: Date
    roomCategory: String
    roomKind: String
  }

  input PassengerServiceHotelInput {
    itemId: String
    hotelId: ID
    name: String!
    peopleCount: Int!
    address: String
    link: String
  }

  input PassengerServiceDriverPersonInput {
    fullName: String!
    phone: String
  }

  input PassengerServiceDriverInput {
    fullName: String!
    phone: String
    peopleCount: Int
    pickupAt: Date
    link: String
    addressFrom: String
    addressTo: String
    description: String
  }

  input PassengerRequestHotelReportRowInput {
    fullName: String!
    roomNumber: String
    roomCategory: String
    roomKind: String
    daysCount: Float
    breakfast: Int
    lunch: Int
    dinner: Int
    foodCost: Float
    accommodationCost: Float
  }

  input PassengerRequestCreateInput {
    airlineId: ID!
    airportId: ID
    flightNumber: String!
    flightDate: Date
    routeFrom: String
    routeTo: String
    plannedPassengersCount: Int

    waterService: PassengerWaterFoodServiceInput
    mealService: PassengerWaterFoodServiceInput
    livingService: PassengerLivingServiceInput
    transferService: PassengerTransferServiceInput
    baggageDeliveryService: PassengerBaggageDeliveryServiceInput

    status: PassengerRequestStatus

    """
    если не используешь auth в контексте — можно передать явно
    """
    createdById: ID
  }

  input PassengerRequestUpdateInput {
    airlineId: ID
    airportId: ID
    flightNumber: String
    flightDate: Date
    routeFrom: String
    routeTo: String
    plannedPassengersCount: Int
    status: PassengerRequestStatus

    waterService: PassengerWaterFoodServiceInput
    mealService: PassengerWaterFoodServiceInput
    livingService: PassengerLivingServiceInput
    transferService: PassengerTransferServiceInput
    baggageDeliveryService: PassengerBaggageDeliveryServiceInput
  }

  type Query {
    passengerRequests(
      filter: PassengerRequestFilterInput
      skip: Int
      take: Int
    ): [PassengerRequest!]!

    passengerRequest(id: ID!): PassengerRequest
  }

  type Mutation {
    createPassengerRequest(
      input: PassengerRequestCreateInput!
    ): PassengerRequest!
    updatePassengerRequest(
      id: ID!
      input: PassengerRequestUpdateInput!
    ): PassengerRequest!
    deletePassengerRequest(id: ID!): Boolean!

    setPassengerRequestStatus(
      id: ID!
      status: PassengerRequestStatus!
    ): PassengerRequest!

    setPassengerRequestServiceStatus(
      id: ID!
      service: PassengerServiceKind!
      status: PassengerServiceStatus!
    ): PassengerRequest!

    addPassengerRequestPerson(
      requestId: ID!
      service: PassengerWaterFoodKind!
      person: PassengerServicePersonInput!
    ): PassengerRequest!

    addPassengerRequestHotel(
      requestId: ID!
      hotel: PassengerServiceHotelInput!
    ): PassengerRequest!

    addPassengerRequestHotelPerson(
      requestId: ID!
      hotelIndex: Int!
      person: PassengerServiceHotelPersonInput!
    ): PassengerRequest!

    removePassengerRequestHotelPerson(
      requestId: ID!
      hotelIndex: Int!
      personIndex: Int!
    ): PassengerRequest!

    updatePassengerRequestHotelPerson(
      requestId: ID!
      hotelIndex: Int!
      personIndex: Int!
      person: PassengerServiceHotelPersonInput!
    ): PassengerRequest!

    addPassengerRequestDriver(
      requestId: ID!
      driver: PassengerServiceDriverInput!
    ): PassengerRequest!

    addPassengerRequestBaggageDriver(
      requestId: ID!
      driver: PassengerServiceDriverInput!
    ): PassengerRequest!

    """Отметить доставку багажа выполненной для водителя по индексу (driverIndex с 0)."""
    completePassengerRequestBaggageDriverDelivery(
      requestId: ID!
      driverIndex: Int!
    ): PassengerRequest!

    addPassengerRequestDriverPerson(
      requestId: ID!
      driverIndex: Int!
      person: PassengerServiceDriverPersonInput!
    ): PassengerRequest!

    updatePassengerRequestDriverPerson(
      requestId: ID!
      driverIndex: Int!
      personIndex: Int!
      person: PassengerServiceDriverPersonInput!
    ): PassengerRequest!

    removePassengerRequestDriverPerson(
      requestId: ID!
      driverIndex: Int!
      personIndex: Int!
    ): PassengerRequest!

    completePassengerRequestWaterEarly(
      requestId: ID!
      reason: String!
    ): PassengerRequest!

    completePassengerRequestMealEarly(
      requestId: ID!
      reason: String!
    ): PassengerRequest!

    completePassengerRequestBaggageEarly(
      requestId: ID!
      reason: String!
    ): PassengerRequest!

    completePassengerRequestTransferEarly(
      requestId: ID!
      reason: String!
    ): PassengerRequest!

    completePassengerRequestLivingEarly(
      requestId: ID!
      reason: String!
    ): PassengerRequest!

    completePassengerRequestEarly(id: ID!, reason: String!): PassengerRequest!

    relocatePassengerRequestHotelPerson(
      requestId: ID!
      fromHotelIndex: Int!
      toHotelIndex: Int!
      personIndex: Int!
      reason: String!
      movedAt: Date
    ): PassengerRequest!

    evictPassengerRequestHotelPerson(
      requestId: ID!
      hotelIndex: Int!
      personIndex: Int!
      reason: String!
      evictedAt: Date
    ): PassengerRequest!

    """Сохранить отчёт по отелю (данные таблицы). Один отчёт на (заявка, отель)."""
    savePassengerRequestHotelReport(
      requestId: ID!
      hotelIndex: Int!
      reportRows: [PassengerRequestHotelReportRowInput!]!
    ): PassengerRequestHotelReport!
  }

  type Subscription {
    passengerRequestCreated: PassengerRequest!
    passengerRequestUpdated: PassengerRequest!
  }
`

export default passengerRequestTypeDef

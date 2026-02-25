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
    people: [PassengerServicePerson!]!
  }

  type PassengerServiceHotel {
    hotelId: ID
    name: String!
    peopleCount: Int!
    address: String
    link: String
  }

  type PassengerServiceDriver {
    fullName: String!
    phone: String
    peopleCount: Int
    pickupAt: Date
    link: String
  }

  type PassengerLivingService {
    plan: PassengerServicePlan
    status: PassengerServiceStatus!
    times: PassengerStatusTimes
    hotels: [PassengerServiceHotel!]!
  }

  type PassengerTransferService {
    plan: PassengerServicePlan
    status: PassengerServiceStatus!
    times: PassengerStatusTimes
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

    status: PassengerRequestStatus!
    statusTimes: PassengerStatusTimes

    createdById: ID!
    createdBy: User!

    chats: [Chat!]!
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

  input PassengerServicePersonInput {
    fullName: String!
    issuedAt: Date
    phone: String
    seat: String
  }

  input PassengerServiceHotelInput {
    hotelId: ID
    name: String!
    peopleCount: Int!
    address: String
    link: String
  }

  input PassengerServiceDriverInput {
    fullName: String!
    phone: String
    peopleCount: Int
    pickupAt: Date
    link: String
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

    addPassengerRequestDriver(
      requestId: ID!
      driver: PassengerServiceDriverInput!
    ): PassengerRequest!
  }

  type Subscription {
    passengerRequestCreated: PassengerRequest!
    passengerRequestUpdated: PassengerRequest!
  }
`

export default passengerRequestTypeDef

const passengerRequestTypeDef = /* GraphQL */ `
  #graphql
  scalar Date
  scalar Upload

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
    DEPARTURE_TRANSFER
    INTERCITY_TRANSFER
    BAGGAGE_DELIVERY
  }

  """
  Сервисы только вода/питание (для people)
  """
  enum PassengerWaterFoodKind {
    WATER
    MEAL
  }

  """
  Тип персоны: пассажир или член экипажа
  """
  enum PassengerPersonType {
    PASSENGER
    CREW
  }

  enum PassengerPersonCategory {
    ADULT
    CHILD
    INFANT
  }

  """
  Направление трансфера
  """
  enum TransferDirection {
    ARRIVAL
    DEPARTURE
    INTERCITY
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
    personId: ID
    fullName: String!
    personCategory: PassengerPersonCategory
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
    personId: ID
    fullName: String!
    phone: String
    roomNumber: String
    arrival: Date
    departure: Date
    roomCategory: String
    roomKind: String
    personType: PassengerPersonType!
    personCategory: PassengerPersonCategory
    airlinePersonalId: ID
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
    personId: ID
    fullName: String!
    personCategory: PassengerPersonCategory
    phone: String
    personType: PassengerPersonType!
    airlinePersonalId: ID
  }

  type PassengerServiceDriver {
    fullName: String!
    phone: String
    peopleCount: Int
    pickupAt: Date
    link: String
    linkPWA: String
    addressFrom: String
    addressTo: String
    description: String
    deliveryCompletedAt: Date
    vehicleType: String
    reportCost: Float
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

  type PassengerRepresentativeLink {
    representativeDepartmentId: ID
    representativeDepartmentName: String
    linkCRM: String
    linkPWA: String
  }

  type PassengerRequestCrewMember {
    airlinePersonalId: ID
    fullName: String!
    position: String
    gender: String
    phone: String
  }

  """
  Пассажир в реестре заявки (для повторного выбора после скана/добавления)
  """
  type PassengerRequestSavedPerson {
    personId: ID!
    fullName: String!
    phone: String
    seat: String
    personType: PassengerPersonType!
    personCategory: PassengerPersonCategory
    airlinePersonalId: ID
    addedAt: Date!
  }

  type PassengerRequest {
    id: ID!
    createdAt: Date!
    updatedAt: Date!

    "Уникальный человекочитаемый номер заявки ФАП, формата {seq4}{airportCode}{MM}{YY}f"
    requestNumber: String

    airlineId: ID!
    airline: Airline!

    airportId: ID
    airport: Airport

    flightNumber: String!
    flightDate: Date
    routeFrom: String
    routeTo: String

    plannedPassengersCount: Int

    includesCrew: Boolean!
    includesPassengers: Boolean!
    crewMembers: [PassengerRequestCrewMember!]!
    savedPassengers: [PassengerRequestSavedPerson!]!
    files: [String]

    waterService: PassengerWaterFoodService
    mealService: PassengerWaterFoodService
    livingService: PassengerLivingService
    transferService: PassengerTransferService
    departureTransferService: PassengerTransferService
    intercityTransferService: PassengerTransferService
    baggageDeliveryService: PassengerTransferService

    status: PassengerRequestStatus!
    statusTimes: PassengerStatusTimes
    earlyCompletionReason: String
    earlyCompletedAt: Date
    cancelReason: String

    createdById: ID!
    createdBy: User!

    representativeLinks: [PassengerRepresentativeLink!]!

    chats: [Chat!]!

    """
    Сохранённый отчёт по отелю (по индексу отеля в livingService.hotels)
    """
    hotelReport(hotelIndex: Int!): PassengerRequestHotelReport
    hotelReports: [PassengerRequestHotelReport!]!

    """
    История действий по заявке ФАП
    """
    logs(pagination: LogPaginationInput): LogConnection!
  }

  """
  Одна строка таблицы отчёта по отелю
  """
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
    "Наименование тарифа (после подписания ДС — номер допсоглашения)"
    tariffName: String
    "Цена койко-места за сутки, применённая к строке"
    pricePerDay: Float
    "Вид размещения: число мест в номере (1/2/3...), 0 — не определён"
    placementKind: Int
  }

  """
  Сохранённая запись отчёта по отелю
  """
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
    personId: ID
    fullName: String!
    personCategory: PassengerPersonCategory
    issuedAt: Date
    phone: String
    seat: String
  }

  input PassengerServiceHotelPersonInput {
    personId: ID
    fullName: String!
    phone: String
    roomNumber: String
    arrival: Date
    departure: Date
    roomCategory: String
    roomKind: String
    personType: PassengerPersonType
    personCategory: PassengerPersonCategory
    airlinePersonalId: ID
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
    personId: ID
    fullName: String!
    personCategory: PassengerPersonCategory
    phone: String
    personType: PassengerPersonType
    airlinePersonalId: ID
  }

  input PassengerRequestCrewMemberInput {
    airlinePersonalId: ID
    fullName: String!
    position: String
    gender: String
    phone: String
  }

  input PassengerRequestSavedPersonInput {
    fullName: String!
    phone: String
    seat: String
    personType: PassengerPersonType
    personCategory: PassengerPersonCategory
    airlinePersonalId: ID
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

  input PassengerServiceDriverPatchInput {
    pickupAt: Date
    vehicleType: String
    reportCost: Float
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
    tariffName: String
    pricePerDay: Float
    placementKind: Int
  }

  input PassengerRequestCreateInput {
    airlineId: ID!
    airportId: ID!
    flightNumber: String!
    flightDate: Date
    routeFrom: String
    routeTo: String
    plannedPassengersCount: Int

    includesCrew: Boolean
    includesPassengers: Boolean
    crewMembers: [PassengerRequestCrewMemberInput!]

    waterService: PassengerWaterFoodServiceInput
    mealService: PassengerWaterFoodServiceInput
    livingService: PassengerLivingServiceInput
    transferService: PassengerTransferServiceInput
    departureTransferService: PassengerTransferServiceInput
    intercityTransferService: PassengerTransferServiceInput
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

    includesCrew: Boolean
    includesPassengers: Boolean
    crewMembers: [PassengerRequestCrewMemberInput!]

    waterService: PassengerWaterFoodServiceInput
    mealService: PassengerWaterFoodServiceInput
    livingService: PassengerLivingServiceInput
    transferService: PassengerTransferServiceInput
    departureTransferService: PassengerTransferServiceInput
    intercityTransferService: PassengerTransferServiceInput
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

  type RecognizedPassengerDoc {
    fullName: String
    flight: String
    from: String
    to: String
    carrier: String
    seat: String
    date: String
    confidence: Float
    rawText: String
  }

  type Mutation {
    recognizePassengerDocument(image: Upload!): RecognizedPassengerDoc!

    createPassengerRequest(
      input: PassengerRequestCreateInput!
      files: [Upload!]
    ): PassengerRequest!

    addPassengerRequestFiles(
      requestId: ID!
      files: [Upload!]!
    ): PassengerRequest!

    removePassengerRequestFile(
      requestId: ID!
      filePath: String!
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

    """
    Заменить ростер экипажа заявки (выбранные сотрудники).
    """
    updatePassengerRequestCrew(
      requestId: ID!
      crewMembers: [PassengerRequestCrewMemberInput!]!
    ): PassengerRequest!

    addPassengerRequestSavedPerson(
      requestId: ID!
      person: PassengerRequestSavedPersonInput!
    ): PassengerRequest!

    updatePassengerRequestSavedPerson(
      requestId: ID!
      personId: ID!
      person: PassengerRequestSavedPersonInput!
    ): PassengerRequest!

    removePassengerRequestSavedPerson(
      requestId: ID!
      personId: ID!
    ): PassengerRequest!

    """
    Пакетно добавить людей в реестр заявки (импорт манифеста).
    Дедуп по нормализованному ФИО, жадный 1:1.
    """
    addPassengerRequestSavedPeople(
      requestId: ID!
      people: [PassengerRequestSavedPersonInput!]!
    ): PassengerRequest!

    cancelPassengerRequest(id: ID!, cancelReason: String): PassengerRequest!

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

    """
    Пакетное добавление пассажиров в воду/питание (выбор из реестра заявки).
    """
    addPassengerRequestPeople(
      requestId: ID!
      service: PassengerWaterFoodKind!
      people: [PassengerServicePersonInput!]!
    ): PassengerRequest!

    updatePassengerRequestPerson(
      requestId: ID!
      service: PassengerWaterFoodKind!
      personIndex: Int!
      person: PassengerServicePersonInput!
    ): PassengerRequest!

    removePassengerRequestPerson(
      requestId: ID!
      service: PassengerWaterFoodKind!
      personIndex: Int!
    ): PassengerRequest!

    addPassengerRequestHotel(
      requestId: ID!
      hotel: PassengerServiceHotelInput!
    ): PassengerRequest!

    removePassengerRequestHotel(
      requestId: ID!
      hotelIndex: Int!
    ): PassengerRequest!

    updatePassengerRequestHotel(
      requestId: ID!
      hotelIndex: Int!
      hotel: PassengerServiceHotelInput!
    ): PassengerRequest!

    addPassengerRequestHotelPerson(
      requestId: ID!
      hotelIndex: Int!
      person: PassengerServiceHotelPersonInput!
    ): PassengerRequest!

    """
    Пакетное добавление пассажиров в отель (выбор из реестра заявки).
    """
    addPassengerRequestHotelPeople(
      requestId: ID!
      hotelIndex: Int!
      people: [PassengerServiceHotelPersonInput!]!
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
      direction: TransferDirection = ARRIVAL
    ): PassengerRequest!

    """
    Партиал-обновление полей заявки (водителя) в услуге трансфера.
    Сейчас покрывает только pickupAt. Другие поля добавятся вместе с UI.
    Семантика patch: отсутствие ключа => не трогаем; null => сбрасываем поле.
    """
    updatePassengerRequestDriver(
      requestId: ID!
      driverIndex: Int!
      patch: PassengerServiceDriverPatchInput!
      direction: TransferDirection = ARRIVAL
    ): PassengerRequest!

    addPassengerRequestBaggageDriver(
      requestId: ID!
      driver: PassengerServiceDriverInput!
    ): PassengerRequest!

    removePassengerRequestDriver(
      requestId: ID!
      driverIndex: Int!
      direction: TransferDirection = ARRIVAL
    ): PassengerRequest!

    removePassengerRequestBaggageDriver(
      requestId: ID!
      driverIndex: Int!
    ): PassengerRequest!

    """
    Водитель принимает заказ на доставку багажа — статус переходит в IN_PROGRESS.
    """
    acceptPassengerRequestBaggageOrder(
      requestId: ID!
      driverIndex: Int!
    ): PassengerRequest!

    """
    Отметить доставку багажа выполненной для водителя по индексу (driverIndex с 0).
    """
    completePassengerRequestBaggageDriverDelivery(
      requestId: ID!
      driverIndex: Int!
    ): PassengerRequest!

    addPassengerRequestDriverPerson(
      requestId: ID!
      driverIndex: Int!
      person: PassengerServiceDriverPersonInput!
      direction: TransferDirection = ARRIVAL
    ): PassengerRequest!

    """
    Пакетное добавление пассажиров к водителю трансфера (выбор из реестра заявки).
    """
    addPassengerRequestDriverPeople(
      requestId: ID!
      driverIndex: Int!
      people: [PassengerServiceDriverPersonInput!]!
      direction: TransferDirection = ARRIVAL
    ): PassengerRequest!

    updatePassengerRequestDriverPerson(
      requestId: ID!
      driverIndex: Int!
      personIndex: Int!
      person: PassengerServiceDriverPersonInput!
      direction: TransferDirection = ARRIVAL
    ): PassengerRequest!

    removePassengerRequestDriverPerson(
      requestId: ID!
      driverIndex: Int!
      personIndex: Int!
      direction: TransferDirection = ARRIVAL
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
      direction: TransferDirection = ARRIVAL
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

    """
    Сохранить отчёт по отелю (данные таблицы). Один отчёт на (заявка, отель).
    """
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

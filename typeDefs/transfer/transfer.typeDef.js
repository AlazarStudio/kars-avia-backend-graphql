const transferTypeDef = /* GraphQL */ `
  #graphql
  scalar Date

  enum TransferStatus {
    PENDING
    ASSIGNED
    ACCEPTED
    ARRIVED
    IN_PROGRESS_TO_CLIENT
    IN_PROGRESS_TO_HOTEL
    COMPLETED
    CANCELLED
  }

  enum TransferChatType {
    DISPATCHER_DRIVER
    DISPATCHER_PERSONAL
    DRIVER_PERSONAL
  }

  enum TransferReviewAuthor {
    DRIVER
    PERSONAL
  }

  enum ActorType {
    USER # диспетчер (модель User)
    DRIVER # модель Driver
    PERSONAL # модель AirlinePersonal (пассажир)
  }

  enum TransferReviewAuthor {
    DRIVER
    PERSONAL
  }

  type Transfer {
    id: ID!
    createdAt: Date!
    updatedAt: Date!

    fromAddress: String! # адрес откуда
    toAddress: String! # адрес куда
    additionalPoints: [String!] # доп. точки
    passengersCount: Int # кол-во пассажиров
    dispatcher: User
    # dispatcherId: String

    # назначенный водитель (может быть пусто до назначения)
    driver: Driver
    # driverId: String

    airline: Airline
    airlineId: String

    # пассажиры (сотрудники авиакомпаний)
    persons: [AirlinePersonal!]!

    description: String # комментарий
    cancellReason: String
    baggage: String # инфо о багаже
    files: [String!] # вложения/фото при необходимости
    scheduledPickupAt: Date # к скольки приехать к пассажиру
    driverAssignmentAt: Date
    orderAcceptanceAt: Date
    arrivedToPassengerAt: Date
    departedAt: Date
    arrivedAt: Date
    finishedAt: Date
    travelDurationMinutes: Int # время в пути (мин)
    status: TransferStatus

    # 3 чата на заявку
    chats: [TransferChat!]

    # отзывы двух сторон (уникально по автору на заявку)
    reviews: [TransferReview!]
  }

  type TransferPassenger {
    id: ID!
    transfer: Transfer!
    # transferId: String!
    personal: AirlinePersonal!
    # personalId: String!
  }

  type TransferChat {
    id: ID!
    transfer: Transfer!
    # transferId: String!
    type: TransferChatType! # DISPATCHER_DRIVER / DISPATCHER_PERSONAL / DRIVER_PERSONAL
    createdAt: Date!

    # Участники конкретного чата (фиксированный набор по типу)
    dispatcher: User
    # dispatcherId: String
    driver: Driver
    # driverId: String

    # В заявке может быть несколько человек, можно сделать связанную модель
    personal: AirlinePersonal
    # personalId: String

    messages: [TransferMessage!]
  }

  type TransferReview {
    id: ID!
    transfer: Transfer!
    # transferId: String!

    authorType: TransferReviewAuthor! # DRIVER | PERSONAL
    driver: Driver
    # driverId:   String
    personal: AirlinePersonal
    # personalId: String

    rating: Int # 1..5
    comment: String
    # createdAt: Date
  }

  type TransferMessage {
    id: String!
    chat: TransferChat!
    # chatId:    String!
    text: String!
    # createdAt: Date!
    isRead: Boolean!

    authorType: ActorType!

    # автор-юзер (диспетчер)
    senderUser: User
    # senderUserId: String

    # автор-водитель
    senderDriver: Driver
    # senderDriverId: String

    # автор-пассажир (AirlinePersonal)
    senderPersonal: AirlinePersonal
    # senderPersonalId: String

    readBy: [TransferMessageRead!]
    separator: String
  }

  type TransferMessageRead {
    id: String!
    message: TransferMessage!
    # messageId:  String!
    readerType: ActorType!
    user: User
    # userId:     String
    driver: Driver
    # driverId:   String
    personal: AirlinePersonal
    # personalId: String
    readAt: Date!
  }

  input TransferInput {
    fromAddress: String # адрес откуда
    toAddress: String # адрес куда
    additionalPoints: [String!] # доп. точки
    passengersCount: Int # кол-во пассажиров
    dispatcherId: String
    # назначенный водитель (может быть пусто до назначения)
    driverId: String
    airlineId: String

    # пассажиры (сотрудники авиакомпаний)
    personsId: [ID]

    description: String # комментарий
    baggage: String # инфо о багаже
    scheduledPickupAt: Date # к скольки приехать к пассажиру
    driverAssignmentAt: Date
    orderAcceptanceAt: Date
    arrivedToPassengerAt: Date
    departedAt: Date
    arrivedAt: Date
    finishedAt: Date
    travelDurationMinutes: Int # время в пути (мин)
    status: TransferStatus
  }

  input TransferUpdateInput {
    fromAddress: String # адрес откуда
    toAddress: String # адрес куда
    additionalPoints: [String!] # доп. точки
    passengersCount: Int # кол-во пассажиров
    dispatcherId: String
    # назначенный водитель (может быть пусто до назначения)
    driverId: String

    airlineId: String

    # пассажиры (сотрудники авиакомпаний)
    personsId: [ID]

    description: String # комментарий
    baggage: String # инфо о багаже
    cancellReason: String
    scheduledPickupAt: Date # к скольки приехать к пассажиру
    driverAssignmentAt: Date
    orderAcceptanceAt: Date
    arrivedToPassengerAt: Date
    departedAt: Date
    arrivedAt: Date
    finishedAt: Date
    travelDurationMinutes: Int # время в пути (мин)
    status: TransferStatus
  }

  input TransferPaginationInput {
    driverId: ID
    personId: ID
    dispatcherId: ID
    organizationId: ID
    airlineId: ID
    all: Boolean
    skip: Int
    take: Int
  }

  type TransferConnection {
    totalCount: Int
    transfers: [Transfer]
  }

  type Query {
    transfers(pagination: TransferPaginationInput!): TransferConnection!
    transfer(id: ID!): Transfer!
  }

  type Mutation {
    createTransfer(input: TransferInput!): Transfer!
    updateTransfer(id: ID!, input: TransferUpdateInput!): Transfer!
  }

  type Subscription {
    transferCreated: Transfer!
    transferUpdated: Transfer!
  }
`

export default transferTypeDef

const hotelTypeDef = /* GraphQL */ `
  #graphql
  scalar Upload
  scalar Date

  enum Category {
    apartment
    studio
    luxe
    onePlace
    twoPlace
    threePlace
    fourPlace
    fivePlace
    sixPlace
    sevenPlace
    eightPlace
    ninePlace
    tenPlace
  }

  enum RoomType {
    room
    apartment
  }

  enum HotelType {
    hotel
    apartment
  }

  # Типы для времени питания
  type MealTime {
    start: String!
    end: String!
  }

  input MealTimeInput {
    start: String!
    end: String!
  }

  # Основной тип отеля, отражающий актуальную структуру базы данных
  type Hotel {
    id: ID!
    name: String!
    nameFull: String
    airport: Airport
    information: Information
    provision: Int
    quote: Int
    capacity: Int
    images: [String!]!
    hotelChesses(hcPagination: HotelChessPaginationInput): [HotelChess!]
    rooms: [Room!]!
    roomKind: [RoomKind]
    breakfast: MealTime
    lunch: MealTime
    dinner: MealTime
    mealPrice: MealPrice
    mealPriceForAir: MealPrice
    stars: String
    usStars: String
    airportDistance: String
    discount: String
    # logs: [Log]
    logs(pagination: LogPaginationInput): LogConnection!
    savedReport: [SavedReport]
    chat: [Chat]
    prices: Price
    active: Boolean
    show: Boolean
    meal: Boolean
    access: Boolean
    type: HotelType
    # position: [Position]
    gallery: [String]
    hotelContract: [HotelContract]
    additionalServices: [AdditionalServices]
  }

  # Тип бронирования номера (HotelChess)
  type HotelChess {
    id: ID!
    hotel: Hotel!
    hotelId: ID!
    reserveHotel: ReserveHotel
    reserveHotelId: ID
    public: Boolean
    room: Room # Связь с моделью Room (единственное поле для номера)
    roomId: ID
    place: Float
    start: Date
    end: Date
    client: AirlinePersonal
    clientId: ID
    request: Request
    requestId: ID
    reserve: Reserve
    reserveId: ID
    passenger: Passenger
    passengerId: ID
    status: String
    mealPlan: MealPlan
  }

  # Тип комнаты
  type Room {
    id: ID!
    name: String!
    category: Category
    places: Float
    beds: Float
    active: Boolean
    reserve: Boolean
    roomKind: RoomKind
    description: String
    descriptionSecond: String
    square: String
    images: [String!]
    type: RoomType
    price: Float
    priceForAirline: Float
  }

  type RoomKind {
    id: ID!
    name: String!
    description: String
    category: Category
    square: String
    price: Float!
    priceForAirline: Float
    priceForAirReq: Boolean
    images: [String]
    hotel: Hotel
    roomsCount: Float
  }

  type AdditionalServices {
    id: ID!
    name: String
    description: String
    price: Float!
    priceForAirline: Float
    images: [String]
    hotel: Hotel
  }

  # type Tariff {
  #   id: ID!
  #   name: String!
  #   price: Float!
  #   category: Category
  #   hotel: Hotel
  #   room: [Room]
  # }

  type HotelConnection {
    totalPages: Int!
    totalCount: Int!
    hotels: [Hotel!]!
  }

  # Входные типы для создания/обновления отеля
  input CreateHotelInput {
    name: String!
    nameFull: String
    airportId: ID
    information: InformationInput
    provision: Int
    quote: Int
    capacity: Int
    hotelChesses: [HotelChessInput!]
    rooms: [RoomInput!]
    breakfast: MealTimeInput
    lunch: MealTimeInput
    dinner: MealTimeInput
    mealPrice: MealPriceInput
    mealPriceForAir: MealPriceInput
    stars: String
    usStars: String
    airportDistance: String
    discount: String
    prices: PriceInput
    type: HotelType
    show: Boolean
    meal: Boolean
  }

  input UpdateHotelInput {
    name: String
    nameFull: String
    airportId: ID
    information: InformationInput
    provision: Int
    quote: Int
    capacity: Int
    hotelChesses: [HotelChessInput!]
    rooms: [RoomInput!]
    roomKind: [RoomKindInput!]
    additionalServices: [AdditionalServicesInput!]
    breakfast: MealTimeInput
    lunch: MealTimeInput
    dinner: MealTimeInput
    mealPrice: MealPriceInput
    mealPriceForAir: MealPriceInput
    stars: String
    usStars: String
    airportDistance: String
    discount: String
    prices: PriceInput
    access: Boolean
    show: Boolean
    meal: Boolean
  }

  input HotelChessInput {
    id: ID
    hotelId: ID
    reserveHotelId: ID
    public: Boolean
    roomId: ID
    place: Float
    start: Date
    end: Date
    clientId: ID
    passengerId: ID
    requestId: ID
    reserveId: ID
    status: String
  }

  input HotelChessPaginationInput {
    start: Date
    end: Date
    city: String
  }

  input RoomInput {
    id: ID
    name: String
    category: Category
    active: Boolean
    beds: Float
    reserve: Boolean
    description: String
    descriptionSecond: String
    square: String
    roomKindId: ID
    images: [Upload!]
    type: RoomType
    price: Float
    priceForAirline: Float
  }

  input RoomKindInput {
    id: ID
    name: String
    description: String
    category: Category
    square: String
    price: Float
    priceForAirline: Float
    priceForAirReq: Boolean
    images: [String]
  }

  input AdditionalServicesInput {
    id: ID
    name: String
    description: String
    price: Float
    priceForAirline: Float
    images: [String]
  }

  input HotelPaginationInput {
    skip: Int
    take: Int
    all: Boolean
  }

  input ManyRoomsInput {
    hotelId: ID
    roomKindId: ID
    reserve: Boolean
    active: Boolean
    beds: Float
    type: RoomType
    numberOfRooms: Float
    roomsName: Float
  }

  type Query {
    hotels(pagination: HotelPaginationInput): HotelConnection!
    hotel(id: ID!): Hotel
  }

  type Mutation {
    createHotel(
      input: CreateHotelInput!
      images: [Upload!]
      roomImages: [Upload!]
      roomKindImages: [Upload!]
      gallery: [Upload!]
    ): Hotel!
    updateHotel(
      id: ID!
      input: UpdateHotelInput!
      images: [Upload!]
      roomImages: [Upload!]
      roomKindImages: [Upload!]
      serviceImages: [Upload!]
      gallery: [Upload!]
    ): Hotel!
    reorderRoomKindImages(
      id: ID!
      imagesArray: [String!]
      imagesToDeleteArray: [String!]
    ): RoomKind!
    reorderHotelGalleryImages(
      id: ID!
      imagesArray: [String!]
      imagesToDeleteArray: [String!]
    ): Hotel!
    createManyRooms(input: ManyRoomsInput): [Room]
    deleteHotel(id: ID!): Hotel!
    deleteRoom(id: ID!): Room!
    deleteRoomKind(id: ID!): RoomKind!
    updateAllRoomKindCount: [Hotel]
  }

  type Subscription {
    hotelCreated: Hotel!
    hotelUpdated: Hotel!
  }
`

export default hotelTypeDef

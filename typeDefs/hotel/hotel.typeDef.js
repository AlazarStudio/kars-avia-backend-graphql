const hotelTypeDef = `#graphql
scalar Upload
scalar Date

enum Category {
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

# Составной тип для контактной информации и реквизитов отеля
type Information {
  country: String
  city: String
  address: String
  index: String
  email: String
  number: String
  inn: String
  ogrn: String
  rs: String
  bank: String
  bik: String
  link: String
  description: String
}

input InformationInput {
  country: String
  city: String
  address: String
  index: String
  email: String
  number: String
  inn: String
  ogrn: String
  rs: String
  bank: String
  bik: String
  link: String
  description: String
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

# Тип и входной тип для цены питания
type MealPrice {
  breakfast: Float
  lunch: Float
  dinner: Float
}

input MealPriceInput {
  breakfast: Float
  lunch: Float
  dinner: Float
}

# Тип плана питания (в случае, если структура фиксирована)
type MealPlan {
  included: Boolean
  breakfastEnabled: Boolean
  breakfast: Int
  lunchEnabled: Boolean
  lunch: Int
  dinnerEnabled: Boolean 
  dinner: Int
  dailyMeals: [DailyMeal]
}

type DailyMeal {
  date: Date
  breakfast: Int
  lunch: Int
  dinner: Int
}

# Составной тип для тарифного прайс-листа
type Price {
  priceOneCategory: Float
  priceTwoCategory: Float
  priceThreeCategory: Float
  priceFourCategory: Float
  priceFiveCategory: Float
  priceSixCategory: Float
  priceSevenCategory: Float
  priceEightCategory: Float
  priceNineCategory: Float
  priceTenCategory: Float
}

input PriceInput {
  priceOneCategory: Float
  priceTwoCategory: Float
  priceThreeCategory: Float
  priceFourCategory: Float
  priceFiveCategory: Float
  priceSixCategory: Float
  priceSevenCategory: Float
  priceEightCategory: Float
  priceNineCategory: Float
  priceTenCategory: Float
}

# Основной тип отеля, отражающий актуальную структуру базы данных
type Hotel {
  id: ID!
  name: String!
  information: Information
  provision: Int
  quote: Int
  images: [String!]!
  hotelChesses: [HotelChess!]
  rooms: [Room!]!
  breakfast: MealTime
  lunch: MealTime
  dinner: MealTime
  mealPrice: MealPrice
  stars: String
  usStars: String
  airportDistance: String
  logs: [Log]
  savedReport: [SavedReport]
  chat: [Chat]
  prices: Price
}

# Тип бронирования номера (HotelChess)
type HotelChess {
  id: ID!
  hotel: Hotel!
  hotelId: ID!
  reserveHotel: ReserveHotel
  reserveHotelId: ID
  public: Boolean
  room: Room         # Связь с моделью Room (единственное поле для номера)
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
  active: Boolean
  reserve: Boolean
  description: String
  images: [String!]
}

type HotelConnection {
  totalPages: Int!
  totalCount: Int!
  hotels: [Hotel!]!
}

# Входные типы для создания/обновления отеля
input CreateHotelInput {
  name: String!
  information: InformationInput
  provision: Int
  quote: Int
  hotelChesses: [HotelChessInput!]
  rooms: [RoomInput!]
  breakfast: MealTimeInput
  lunch: MealTimeInput
  dinner: MealTimeInput
  mealPrice: MealPriceInput
  stars: String
  usStars: String
  airportDistance: String
  prices: PriceInput
}

input UpdateHotelInput {
  name: String
  information: InformationInput
  provision: Int
  quote: Int
  hotelChesses: [HotelChessInput!]
  rooms: [RoomInput!]
  breakfast: MealTimeInput
  lunch: MealTimeInput
  dinner: MealTimeInput
  mealPrice: MealPriceInput
  stars: String
  usStars: String
  airportDistance: String
  prices: PriceInput
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

input RoomInput {
  id: ID
  name: String
  category: Category
  active: Boolean
  reserve: Boolean
  description: String
  images: [Upload!]
}

input HotelPaginationInput {
  skip: Int
  take: Int
  all: Boolean
}

type Query {
  hotels(pagination: HotelPaginationInput): HotelConnection!
  hotel(id: ID!): Hotel
}

type Mutation { 
  createHotel(input: CreateHotelInput!, images: [Upload!], roomImages: [Upload!]): Hotel!
  updateHotel(id: ID!, input: UpdateHotelInput!, images: [Upload!], roomImages: [Upload!]): Hotel!
  deleteHotel(id: ID!): Hotel!
  deleteRoom(id: ID!): Room!
}

type Subscription {
  hotelCreated: Hotel!
  hotelUpdated: Hotel!
}
`

export default hotelTypeDef

const hotelTypeDef = `#graphql

scalar Upload
scalar Date

enum Category {
  onePlace
  twoPlace
  threePlace
  fourPlace
}

type Hotel {
  id: ID!
  name: String!
  country: String
  city: String
  address: String
  quote: Int
  provision: Int
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
  hotelChesses: [HotelChess]
  images: [String!]
  rooms: [Room!]
  breakfast: MealTime
  lunch: MealTime
  dinner: MealTime
  priceOneCategory: Float
  priceTwoCategory: Float
  priceThreeCategory: Float
  priceFourCategory: Float
  MealPrice: MealPrice
  stars: String
  airportDistance: String
}

type MealTime {
  start: String!
  end: String!
}

type HotelChess {
  id: ID
  hotel: Hotel
  hotelId: ID
  public: Boolean
  room: String
  roomN: Room
  roomId: ID
  place: Float
  start: Date
  end: Date
  client: AirlinePersonal
  clientId: String
  passenger: Passenger
  passengerId: String
  request: Request
  requestId: String
  reserve: Reserve
  reserveId: String
  status: String
}

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

type MealPrice {
  breakfast: Float
  lunch: Float
  dinner: Float
}

type HotelConnection {
  totalPages: Int!
  totalCount: Int!
  hotels: [Hotel!]!
}

input CreateHotelInput {
  name: String!
  country: String
  city: String
  address: String
  quote: String
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
  hotelChesses: [HotelChessInput!]
  rooms: [RoomInput!]
  breakfast: MealTimeInput
  lunch: MealTimeInput
  dinner: MealTimeInput
  priceOneCategory: Float
  priceTwoCategory: Float
  priceThreeCategory: Float
  priceFourCategory: Float
  MealPrice: MealPriceInput
  stars: String
  airportDistance: String
}

input UpdateHotelInput {
  name: String
  country: String
  city: String
  address: String
  quote: String
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
  hotelChesses: [HotelChessInput!]
  rooms: [RoomInput!]
  breakfast: MealTimeInput
  lunch: MealTimeInput
  dinner: MealTimeInput
  priceOneCategory: Float
  priceTwoCategory: Float
  priceThreeCategory: Float
  priceFourCategory: Float
  MealPrice: MealPriceInput
  stars: String
  airportDistance: String
}

input HotelChessInput {
  id:ID
  hotelId: ID
  public: Boolean
  room: String
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
  # images: [Upload!]
}

input MealPriceInput {
  breakfast: Float
  lunch: Float
  dinner: Float
}

input MealTimeInput {
  start: String!
  end: String!
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

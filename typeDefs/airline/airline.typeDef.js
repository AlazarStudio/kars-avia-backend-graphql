const airlineTypeDef = `#graphql
scalar Upload

# Общие составные типы (если ещё не определены, их можно вынести в общий файл)
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

type Price {
  priceApartment: Float
  priceStudio: Float
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
  priceApartment: Float
  priceStudio: Float
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

# Основной тип Airline
type Airline {
  id: ID!
  name: String!
  nameFull: String
  images: [String!]!
  information: Information
  department: [AirlineDepartment!]!
  staff: [AirlinePersonal!]!
  mealPrice: MealPrice
  # logs: [Log]
  logs(pagination: LogPaginationInput): LogConnection!
  prices: Price
  active: Boolean
  position: [Position]
}

type AirlineDepartment {
  id: ID!
  name: String!
  email: String
  staff: [AirlinePersonal!]
  users: [User!]
  active: Boolean
  position: [Position]
}

type AirlinePersonal {
  id: ID!
  name: String
  number: String
  # position: String
  position: Position
  gender: String
  airline: Airline
  department: AirlineDepartment
  hotelChess: [HotelChess!]
  active: Boolean
}

type AirlineConnection {
  totalPages: Int!
  totalCount: Int!
  airlines: [Airline!]!
}

# Входные типы для создания и обновления
input CreateAirlineInput {
  name: String!
  nameFull: String
  information: InformationInput
  mealPrice: MealPriceInput
  prices: PriceInput
}

input UpdateAirlineInput {
  name: String
  nameFull: String
  information: InformationInput
  staff: [AirlinePersonalInput!]
  department: [AirlineDepartmentInput!]
  mealPrice: MealPriceInput
  prices: PriceInput
  position: [PositionInput!]
}

input AirlineDepartmentInput {
  id: ID
  name: String
  email: String
  userIds: [ID!]
  positionIds: [ID!]
}

input AirlinePersonalInput {
  id: ID
  name: String
  number: String
  # position: String
  positionId: ID
  gender: String
  departmentId: ID
}

input AirlinePaginationInput {
  skip: Int
  take: Int
  all: Boolean
}

type Query {
  airlines(pagination: AirlinePaginationInput): AirlineConnection!
  airline(id: ID!): Airline
  airlineStaff(id: ID!): AirlinePersonal
  airlineStaffs(id: ID!): [AirlinePersonal]
}

type Mutation {
  createAirline(input: CreateAirlineInput!, images: [Upload!]): Airline!
  updateAirline(id: ID!, input: UpdateAirlineInput!, images: [Upload!]): Airline!
  deleteAirline(id: ID!): Airline!
  deleteAirlineDepartment(id: ID!): AirlineDepartment!
  deleteAirlineStaff(id: ID!): AirlinePersonal!
}

type Subscription {
  airlineCreated: Airline!
  airlineUpdated: Airline!
}
`

export default airlineTypeDef

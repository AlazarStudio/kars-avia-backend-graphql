const airlineTypeDef = `#graphql
scalar Upload

# Основной тип Airline (авиакомпания)
type Airline {
  id: ID!
  name: String!
  nameFull: String
  images: [String!]!
  information: Information
  department: [AirlineDepartment!]!
  staff: [AirlinePersonal!]!
  # mealPrice: MealPrice
  logs(pagination: LogPaginationInput): LogConnection!
  prices: [AirlinePrice!]!         # изменено: список договоров с тарифами
  active: Boolean
  # position: [Position]
  airportOnAirlinePrice: [AirportOnAirlinePrice]
}

# Остальные типы оставляем без изменений (пример – департамент и персонал)
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
  position: Position
  gender: String
  airline: Airline
  department: AirlineDepartment
  hotelChess: [HotelChess!]
  active: Boolean
}

# Пагинация, Query, Mutation и Subscription
input CreateAirlineInput {
  name: String!
  nameFull: String
  information: InformationInput
  # mealPrice: MealPriceInput
  prices: [AirlinePriceInput!]   # теперь массив тарифов
}

input UpdateAirlineInput {
  name: String
  nameFull: String
  information: InformationInput
  staff: [AirlinePersonalInput!]
  department: [AirlineDepartmentInput!]
  # mealPrice: MealPriceInput
  prices: [AirlinePriceInput!]   # массив тарифов для обновления
  # position: [PositionInput!]
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
  positionId: ID
  gender: String
  departmentId: ID
}

input AirlinePaginationInput {
  skip: Int
  take: Int
  all: Boolean
}

type AirlineConnection {
  totalPages: Int!
  totalCount: Int!
  airlines: [Airline!]!
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

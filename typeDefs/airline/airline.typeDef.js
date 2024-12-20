const airlineTypeDef = `#graphql

scalar Upload

type Airline {
  id: ID!
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
  images: [String]
  department: [AirlineDepartment!]!
  staff: [AirlinePersonal!]!
  priceOneCategory: Float
  priceTwoCategory: Float
  priceThreeCategory: Float
  priceFourCategory: Float
  MealPrice: MealPrice
}

type AirlineDepartment {
  id: ID!
  name: String!
  staff: [AirlinePersonal!]
  users: [User!]
}

type AirlinePersonal {
  id: ID!
  name: String
  number: String
  position: String
  gender: String
  airline: Airline
  department: AirlineDepartment
  hotelChess: [HotelChess!]
}

type AirlineConnection {
  totalPages: Int!
  totalCount: Int!
  airlines: [Airline!]!
}

input CreateAirlineInput {
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
  priceOneCategory: Float
  priceTwoCategory: Float
  priceThreeCategory: Float
  priceFourCategory: Float
  MealPrice: MealPriceInput
}

input UpdateAirlineInput {
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
  staff: [AirlinePersonalInput!]
  department: [AirlineDepartmentInput!]
  priceOneCategory: Float
  priceTwoCategory: Float
  priceThreeCategory: Float
  priceFourCategory: Float
  MealPrice: MealPriceInput
}

input AirlineDepartmentInput {
  id: ID
  name: String
  userIds: [ID!]
}

input AirlinePersonalInput {
  id: ID
  name: String
  number: String
  position: String
  gender: String
  departmentId: ID
}

input PaginationInput {
  skip: Int
  take: Int
}

type Query {
  airlines: (pagination: PaginationInput): AirlineConnection!
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

const requestTypeDef = `#graphql

scalar Date

# types
type Request {
  id: ID!
  person: AirlinePersonal
  personId: String
  airportId: String!
  airport: Airport!
  arrival: Arrival!
  departure: Departure!
  roomCategory: String
  mealPlan: MealPlan
  senderId: String!
  receiverId: String
  createdAt: Date
  updatedAt: Date
  hotelId: String
  hotel: Hotel
  hotelChess: HotelChess
  roomNumber: String
  airlineId: String
  airline: Airline!
  status: String
  requestNumber: String
  archive: Boolean
  chat: Chat
  logs: [Log]
}

type Log {
  id: ID!
  user: User
  hotel: Hotel
  airline: Airline
  action: String!
  description: String
  oldData: String
  newData: String
  createdAt: Date!
}

type Arrival {
  flight: String
  date: Date!
}

type Departure {
  flight: String
  date: Date!
}

type MealPlan {
  included: Boolean
  breakfast: Int
  lunch: Int
  dinner: Int
  dailyMeals: [DailyMeal]
}

type DailyMeal {
  date: Date!
  breakfast: Int!
  lunch: Int!
  dinner: Int!
}

type RequestConnection {
  totalPages: Int!
  totalCount: Int!
  requests: [Request!]!
}

# inputs
input CreateRequestInput {
  personId: String
  airportId: String
  arrival: ArrivalInput!
  departure: DepartureInput!
  roomCategory: String
  mealPlan: MealPlanInput
  airlineId: String!
  senderId: String!
  status: String
}

input UpdateRequestInput {
  arrival: ArrivalInput
  departure: DepartureInput
  roomCategory: String
  mealPlan: MealPlanInput
  hotelId: String 
  status: String
}

input ArrivalInput {
  flight: String
  date: Date!
}

input DepartureInput {
  flight: String
  date: Date!
}

input MealPlanInput {
  included: Boolean
  breakfast: Int
  lunch: Int
  dinner: Int
}

input DailyMealInput {
  date: Date!
  breakfast: Int
  lunch: Int
  dinner: Int
}

input ModifyDailyMealsInput {
  requestId: ID!
  dailyMeals: [DailyMealInput!]!
}

input PaginationInput {
  skip: Int
  take: Int
  status: [String]
}

input ExtendRequestDatesInput {
  requestId: ID!
  newEndName: String!
  newEnd: Date!
}

# queries
type Query {
  requests(pagination: PaginationInput): RequestConnection!
  request(id:ID): Request
  requestArchive(pagination: PaginationInput): RequestConnection!
}

type Mutation {
  createRequest(input: CreateRequestInput!): Request!
  updateRequest(id: ID!, input: UpdateRequestInput!): Request!
  modifyDailyMeals(input: ModifyDailyMealsInput!): MealPlan!
}

extend type Mutation {
  extendRequestDates(input: ExtendRequestDatesInput!): Request!
  archivingRequst(id: ID!): Request!
}

type Subscription {
  requestCreated: Request!
  requestUpdated: Request!
}

`

export default requestTypeDef

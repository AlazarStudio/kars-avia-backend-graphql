const requestTypeDef = `#graphql

scalar Date

type Request {
  id: ID!
  person: AirlinePersonal
  personId: String
  airportId: String!
  airport: Airport!
  arrival: Arrival!
  departure: Departure!
  roomCategory: String
  mealPlan: MealPlan!
  senderId: String!
  receiverId: String
  createdAt: String
  updatedAt: String
  hotelId: String
  hotel: Hotel
  hotelChess: HotelChess
  roomNumber: String
  airlineId: String
  airline: Airline!
  status: String
  requestNumber: String
  chat: Chat
}

type Arrival {
  flight: String
  date: String!
  time: String!
}

type Departure {
  flight: String
  date: String!
  time: String!
}

type MealPlan {
  included: Boolean!
  breakfast: Boolean
  lunch: Boolean
  dinner: Boolean
}

type RequestConnection {
  totalPages: Int!
  totalCount: Int!
  requests: [Request!]!
}

input CreateRequestInput {
  personId: String
  airportId: String
  arrival: ArrivalInput!
  departure: DepartureInput!
  roomCategory: String
  mealPlan: MealPlanInput!
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
  date: String!
  time: String!
}

input DepartureInput {
  flight: String
  date: String!
  time: String!
}

input MealPlanInput {
  included: Boolean!
  breakfast: Boolean
  lunch: Boolean
  dinner: Boolean
}

input PaginationInput {
  skip: Int
  take: Int
}

type Query {
  requests(pagination: PaginationInput): RequestConnection!
  # requests: [Request!]!
  request(id:ID): Request
}

type Mutation {
  createRequest(input: CreateRequestInput!): Request!
  updateRequest(id: ID!, input: UpdateRequestInput!): Request!
  deleteRequests: Request!
}

type Subscription {
  requestCreated: Request!
  requestUpdated: Request!
}


`

export default requestTypeDef

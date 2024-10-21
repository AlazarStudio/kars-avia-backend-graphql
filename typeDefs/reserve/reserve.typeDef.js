const reserveTypeDef = `#graphql

scalar Date

type Reserve {
  id: ID!
  createdAt: String
  updatedAt: String
  airport: Airport
  airline: Airline
  senderId: String!
  arrival: Arrival!
  departure: Departure!
  mealPlan: MealPlan!
  status: String
  reserveNumber: String
  chat: [Chat]
  hotels: [Hotel]
  person: [AirlinePersonal]
  passengers: [Passenger]
  passengerCount: Int
}

type MealPlan {
  included: Boolean!
  breakfast: Int
  lunch: Int
  dinner: Int
}

type Passenger {
  id: ID!
  name: String
  number: String
  child: Boolean
  animal: Boolean
  reserve: Reserve!
  hotel: Hotel
}

type ReserveConnection {
  totalPages: Int!
  totalCount: Int!
  reserves: [Reserve!]!
}

input PaginationInput {
  skip: Int
  take: Int
}

input CreateReserveInput {
  airportId: String!
  arrival: ArrivalInput!
  departure: DepartureInput!
  mealPlan: MealPlanInput!
  airlineId: String!
  senderId: String!
  status: String
  person: [PersonInput!]
  passengers: [PassengerInput!]
}

input UpdateReserveInput {
  arrival: ArrivalInput
  departure: DepartureInput
  mealPlan: MealPlanInput
  status: String
  person: [PersonInput!]
  passengers: [PassengerInput!]
}

input PersonInput {
  id: String
}

input PassengerInput {
  name: String
  number: String
  gender: String
  child: Boolean
  animal: Boolean
}

extend type Mutation {
  assignPassengersToHotel(
    reservationId: ID!
    hotelId: ID!
    passengerIds: [ID!]!
  ): [Passenger!]!                                                                   
}

type Mutation {
  createReserve(input: CreateReserveInput!): Reserve!
  updateReserve(id: ID!, input: UpdateReserveInput!): Reserve!
}


type Subscription {
  reserveCreated: Reserve!
  reserveUpdated: Reserve!
}

type Query {
  reservationPassengers(reservationId: ID!): [Passenger!]!
  reserves(pagination: PaginationInput): ReserveConnection!
  reserve(id: ID!): Reserve
}

`

export default reserveTypeDef

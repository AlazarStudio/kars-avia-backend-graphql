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
  families: [Family]
  hotels: [Hotel]
  person: [AirlinePersonal]
}

type MealPlan {
  included: Boolean!
  breakfast: Boolean
  lunch: Boolean
  dinner: Boolean
}

type Family {
  id: ID!
  passengers: [Passenger!]!
  reserve: Reserve!
}

type Passenger {
  id: ID!
  name: String!
  number: String
  child: Boolean
  animal: Boolean
  family: Family
  reserve: Reserve!
  hotel: Hotel
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
  families: [FamilyInput!]
  passengers: [PassengerInput!]
}

input UpdateReserveInput {
  arrival: ArrivalInput
  departure: DepartureInput
  mealPlan: MealPlanInput
  status: String
  person: [PersonInput!]
  families: [FamilyInput!]
  passengers: [PassengerInput!]
}

input PersonInput {
  id: String
}

input FamilyInput {
  passengers: [PassengerInput!]!
}

input PassengerInput {
  name: String!
  number: String
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

extend type Query {
  reservationPassengers(reservationId: ID!): [Passenger!]!
}

type Query {
  reserves: [Reserve!]!
  reserve(id: ID!): Reserve
}

`

export default reserveTypeDef

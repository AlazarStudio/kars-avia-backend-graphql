const reserveTypeDef = `#graphql

scalar Date

type Reserve {
  id: ID!
  createdAt: Date
  updatedAt: Date
  airport: Airport
  airline: Airline
  senderId: String!
  arrival: Date!
  departure: Date!
  mealPlan: MealPlan!
  status: String
  reserveNumber: String
  chat: [Chat]
  hotel: [ReserveHotel]
  person: [AirlinePersonal]
  passengers: [Passenger]
  passengerCount: Int
  reserveForPerson: Boolean!
  archive: Boolean
  hotelChess: [HotelChess]
}

type ReserveHotel {
  id: ID!
  capacity: Int!
  hotel: Hotel!
  reserve: Reserve!
  person: [AirlinePersonal]
  passengers: [Passenger]
  hotelChess: [HotelChess]
}

type MealPlan {
  included: Boolean!
  breakfast: Int
  lunch: Int
  dinner: Int
}

type ReserveHotelPersonal {
  reserveHotel: ReserveHotel
  passengers: [Passenger]
  person: [AirlinePersonal]
}

type Passenger {
  id: ID!
  name: String
  number: String
  gender: String
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

input CreateReserveInput {
  airportId: String!
  arrival: Date!
  departure: Date!
  mealPlan: MealPlanInput!
  airlineId: String!
  senderId: String!
  status: String
  person: [PersonInput!]
  passengers: [PassengerInput!]
  passengerCount: Int!
  reserveForPerson: Boolean!
}

input UpdateReserveInput {
  arrival: Date
  departure: Date
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

input assignPersonInput {
  reservationId: ID! personId: ID! hotelId: ID!
}

input PaginationInput {
  skip: Int
  take: Int
  status: [String]
}

type Mutation {
  createReserve(input: CreateReserveInput!): Reserve!
  updateReserve(id: ID!, input: UpdateReserveInput!): Reserve!
}

extend type Mutation {
  addHotelToReserve(reservationId: ID! hotelId: ID! capacity: Int!): ReserveHotel!                                
  addPassengerToReserve(reservationId: ID! input: PassengerInput! hotelId: ID!): Passenger!
  deletePassengerFromReserve(id: ID!): ReserveHotel!
  assignPersonToHotel(input: assignPersonInput!): AirlinePersonal!
  dissociatePersonFromHotel(reserveHotelId: ID!, airlinePersonalId: ID!): ReserveHotel!
  archivingReserve(id: ID!): Reserve!
}

type Query {
  reservationPassengers(reservationId: ID!): [Passenger!]!
  reserves(pagination: PaginationInput): ReserveConnection!
  reserve(id: ID!): Reserve
  reserveArchive(pagination: PaginationInput): ReserveConnection!
}

extend type Query {
  reservationHotels(id: ID!): [ReserveHotel]
  reservationHotel(id: ID!): ReserveHotel!
}

type Subscription {
  reserveCreated: Reserve!
  reserveUpdated: Reserve!
  reserveHotel: ReserveHotel!
  reservePersons: ReserveHotelPersonal!
}

`

export default reserveTypeDef

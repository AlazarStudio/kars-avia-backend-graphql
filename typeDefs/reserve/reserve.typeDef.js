const reserveTypeDef = `#graphql
scalar Date
scalar Upload

# Основной тип резерва
type Reserve {
  id: ID!
  createdAt: Date
  updatedAt: Date
  airport: Airport
  airline: Airline
  senderId: ID!
  arrival: Date!
  departure: Date!
  mealPlan: MealPlan
  status: String
  reserveNumber: String
  chat: [Chat]
  hotel: [ReserveHotel]
  # person: [AirlinePersonal]
  passengers: [Passenger]
  passengerCount: Int
  # reserveForPerson: Boolean!
  archive: Boolean
  hotelChess: [HotelChess]
  logs: [Log]
  files: [String]
}

# Тип для отелей, привязанных к резерву
type ReserveHotel {
  id: ID!
  capacity: Int!
  hotel: Hotel!
  reserve: Reserve!
  # person: [AirlinePersonal]
  passengers: [Passenger]
  hotelChess: [HotelChess]
}

# Тип плана питания для резерва
# type MealPlan {
#   included: Boolean!
#   breakfast: Int
#   lunch: Int
#   dinner: Int
# }

# Тип для группировки персон и пассажиров в рамках отеля резерва
type ReserveHotelPersonal {
  reserveHotel: ReserveHotel
  passengers: [Passenger]
}

# Тип пассажира
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

# Объединяющий тип для постраничного вывода резервов
type ReserveConnection {
  totalPages: Int!
  totalCount: Int!
  reserves: [Reserve!]!
}

# Входные типы

input CreateReserveInput {
  airportId: ID!
  arrival: Date!
  departure: Date!
  mealPlan: MealPlanInput!
  airlineId: ID!
  senderId: ID!
  status: String
  # person: [PersonInput!]
  passengers: [PassengerInput!]
  passengerCount: Int!
  # reserveForPerson: Boolean!
}

input UpdateReserveInput {
  arrival: Date
  departure: Date
  mealPlan: MealPlanInput
  status: String
  # person: [PersonInput!]
  passengers: [PassengerInput!]
}

input MealPlanInput {
  included: Boolean
  breakfast: Int
  lunch: Int
  dinner: Int
}

# input PersonInput {
#   id: ID
# }

input PassengerInput {
  name: String
  number: String
  gender: String
  child: Boolean
  animal: Boolean
}

# input assignPersonInput {
#   reservationId: ID!
#   personId: ID!
#   hotelId: ID!
# }

input PaginationInput {
  skip: Int
  take: Int
  status: [String]
}

# input ExtendReserveDatesInput {
#   reserveId: ID!
#   newEnd: Date!
#   status: String!
# }

# Мутации

type Mutation {
  createReserve(input: CreateReserveInput!, files: [Upload!]): Reserve!
  updateReserve(id: ID!, input: UpdateReserveInput!, files: [Upload!]): Reserve!
}

extend type Mutation {
  addHotelToReserve(reservationId: ID!, hotelId: ID!, capacity: Int!): ReserveHotel!                                 
  addPassengerToReserve(reservationId: ID!, input: PassengerInput!, hotelId: ID!): Passenger!
  deletePassengerFromReserve(id: ID!): ReserveHotel!
  # assignPersonToHotel(input: assignPersonInput!): AirlinePersonal!
  # dissociatePersonFromHotel(reserveHotelId: ID!, airlinePersonalId: ID!): ReserveHotel!
  archivingReserve(id: ID!): Reserve!
  # extendReserveDates(input: ExtendReserveDatesInput!): Reserve!
}

# Запросы

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

# Подписки

type Subscription {
  reserveCreated: Reserve!
  reserveUpdated: Reserve!
  reserveHotel: ReserveHotel!
  reservePersons: ReserveHotelPersonal!
}
`

export default reserveTypeDef

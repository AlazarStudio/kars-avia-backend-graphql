const requestTypeDef = `#graphql

scalar Date

type Request {
  id: ID!
  fullName: String!
  position: String
  gender: String
  phoneNumber: String
  airport: String!
  arrival: Arrival!
  departure: Departure!
  roomCategory: String!
  mealPlan: MealPlan!
  senderId: String!
  receiverId: String!
  createdAt: String
  updatedAt: String
}

type Arrival {
  flight: String!
  date: String!
  time: String!
}

type Departure {
  flight: String!
  date: String!
  time: String!
}

type MealPlan {
  included: Boolean!
  breakfast: Boolean
  lunch: Boolean
  dinner: Boolean
}

input CreateRequestInput {
  fullName: String!
  position: String
  gender: String
  phoneNumber: String
  airport: String!
  arrival: ArrivalInput!
  departure: DepartureInput!
  roomCategory: String!
  mealPlan: MealPlanInput!
}

input UpdateRequestInput {
  fullName: String
  position: String
  gender: String
  phoneNumber: String
  airport: String
  arrival: ArrivalInput
  departure: DepartureInput
  roomCategory: String
  mealPlan: MealPlanInput
  hotel: String
}

input ArrivalInput {
  flight: String!
  date: String!
  time: String!
}

input DepartureInput {
  flight: String!
  date: String!
  time: String!
}

input MealPlanInput {
  included: Boolean!
  breakfast: Boolean
  lunch: Boolean
  dinner: Boolean
}

type Query {
  requests: [Request!]!
  request(id:ID): Request
}

type Mutation {
  createRequest(input: CreateRequestInput!): Request!
  updateRequest(id: ID!, input: UpdateRequestInput!): Request!
}

type Subscription {
  requestCreated: Request!
  requestUpdated: Request!
}

`

export default requestTypeDef

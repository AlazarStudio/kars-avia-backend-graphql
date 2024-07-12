const requestTypeDef = `#graphql
type Mutation {
  createRequest(input: CreateRequestInput!): Request!
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

`;

export default requestTypeDef;

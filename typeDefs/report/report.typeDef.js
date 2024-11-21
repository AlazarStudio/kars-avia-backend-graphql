const reportTypeDef = `#graphql
scalar Date

type Query {
  dispatcherReport(startDate: Date!, endDate: Date!, includeArchive: Boolean): [DispatcherReport!]!
  airlineReport(startDate: Date!, endDate: Date!, airlineId: ID!, includeArchive: Boolean): [AirlineReport!]!
  hotelReport(startDate: Date!, endDate: Date!, hotelId: ID!, includeArchive: Boolean): [HotelReport!]!
}

type DispatcherReport {
  dateRange: String!
  totalDays: Int!
  totalCost: Float!
  details: [DispatcherDetail!]!
}

type DispatcherDetail {
  name: String!
  roomCategory: String
  stayDates: String!
  mealPlan: MealPlan
  totalCost: Float!
}

type AirlineReport {
  dateRange: String!
  totalDays: Int!
  totalCost: Float!
  details: [AirlineDetail!]!
}

type AirlineDetail {
  name: String!
  flightNumber: String
  stayDates: String!
  mealPlan: MealPlan
  totalCost: Float!
}

type HotelReport {
  dateRange: String!
  totalDays: Int!
  totalCost: Float!
  details: [HotelDetail!]!
}

type HotelDetail {
  guestName: String!
  roomCategory: String
  stayDates: String!
  totalCost: Float!
}

type MealPlan {
  breakfasts: Int
  lunches: Int
  dinners: Int
  mealCost: Float
}
`

export default reportTypeDef

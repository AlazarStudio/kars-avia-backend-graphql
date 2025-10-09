const globalTypeDef = `#graphql
scalar Upload
scalar Date

# Тип аэропорта
type Airport {
  id: ID!
  name: String
  code: String
  city: String
}

# Общие составные типы (можно вынести в общий файл)
type Information {
  country: String
  city: String
  address: String
  index: String
  email: String
  number: String
  inn: String
  ogrn: String
  rs: String
  bank: String
  bik: String
  link: String
  description: String
}

input InformationInput {
  country: String
  city: String
  address: String
  index: String
  email: String
  number: String
  inn: String
  ogrn: String
  rs: String
  bank: String
  bik: String
  link: String
  description: String
}

type AccessMenu {
  requestMenu: Boolean
  requestCreate: Boolean
  requestUpdate: Boolean
  requestChat: Boolean
  personalMenu: Boolean
  personalCreate: Boolean
  personalUpdate: Boolean
  reserveMenu: Boolean
  reserveCreate: Boolean
  reserveUpdate: Boolean
  analyticsMenu: Boolean
  analyticsUpload: Boolean
  reportMenu: Boolean
  reportCreate: Boolean
  userMenu: Boolean
  userCreate: Boolean
  userUpdate: Boolean
  airlineMenu: Boolean
  airlineUpdate: Boolean
}

input AccessMenuInput {
  requestMenu: Boolean
  requestCreate: Boolean
  requestUpdate: Boolean
  requestChat: Boolean
  personalMenu: Boolean
  personalCreate: Boolean
  personalUpdate: Boolean
  reserveMenu: Boolean
  reserveCreate: Boolean
  reserveUpdate: Boolean
  analyticsMenu: Boolean
  analyticsUpload: Boolean
  reportMenu: Boolean
  reportCreate: Boolean
  userMenu: Boolean
  userCreate: Boolean
  userUpdate: Boolean
  airlineMenu: Boolean
  airlineUpdate: Boolean
}

# Типы для питания
type MealPrice {
  breakfast: Float
  lunch: Float
  dinner: Float
}

input MealPriceInput {
  breakfast: Float
  lunch: Float
  dinner: Float
}

# Тип прайс-листа (ценовой набор)
type Price {
  priceApartment: Float
  priceStudio: Float
  priceLuxe: Float
  priceOneCategory: Float
  priceTwoCategory: Float
  priceThreeCategory: Float
  priceFourCategory: Float
  priceFiveCategory: Float
  priceSixCategory: Float
  priceSevenCategory: Float
  priceEightCategory: Float
  priceNineCategory: Float
  priceTenCategory: Float
}

input PriceInput {
  priceApartment: Float
  priceStudio: Float
  priceLuxe: Float
  priceOneCategory: Float
  priceTwoCategory: Float
  priceThreeCategory: Float
  priceFourCategory: Float
  priceFiveCategory: Float
  priceSixCategory: Float
  priceSevenCategory: Float
  priceEightCategory: Float
  priceNineCategory: Float
  priceTenCategory: Float
}

# Тип плана питания (в случае, если структура фиксирована)
type MealPlan {
  included: Boolean
  breakfastEnabled: Boolean
  breakfast: Int
  lunchEnabled: Boolean
  lunch: Int
  dinnerEnabled: Boolean 
  dinner: Int
  dailyMeals: [DailyMeal]
}

type DailyMeal {
  date: Date
  breakfast: Int
  lunch: Int
  dinner: Int
}

# Новый тип тарифного договора для авиакомпании
type AirlinePrice {
  id: ID!
  prices: Price
  mealPrice: MealPrice
  name: String
  airports: [AirportOnAirlinePrice]
  priceCategory: PriceCategory
}

# Входной тип для тарифного договора
input AirlinePriceInput {
  id: ID
  prices: PriceInput
  mealPrice: MealPriceInput
  name: String
  airportIds: [ID!]  # список id аэропортов, к которым применяется договор
}

# Новый тип для связи аэропортов с тарифом авиакомпании
type AirportOnAirlinePrice {
  id: ID!
  airport: Airport
}

type File {
  filename: String!
  mimetype: String!
  encoding: String!
}

# Query, Mutation

# type Query {}

type Mutation {
  singleUpload(file: Upload!): File!
}

`

export default globalTypeDef

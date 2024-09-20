const hotelTypeDef = `#graphql

scalar Upload

type Hotel {
  id: ID!
  name: String!
  country: String
  city: String
  address: String
  quote: String
  index: String
  email: String
  number: String
  inn: String
  ogrn: String
  rs: String
  bank: String
  bik: String
  images: [String!]
  categories: [Category!]
  rooms: [Room!]
  tariffs: [Tariff!]
  prices: [Price!]
}

type Tariff {
  id: ID!
  name: String!
  prices: [Price!]
  category: [Category!]
}

type Category {
  id: ID!
  name: String!
  rooms: [Room!]
  prices: Price!
  tariffs: Tariff!
}

type Room {
  id: ID!
  name: String!
  category: Category
  tariff: Tariff
  places: Float
}

type Price {
  id: ID!
  amount: Float
  amountair: Float
  category: Category!
  tariff: Tariff!
}

type Query {
  hotels: [Hotel!]!
  hotel(id: ID!): Hotel
}

type Mutation {
  createHotel(input: CreateHotelInput!, images: [Upload!]): Hotel!
  updateHotel(id: ID!, input: UpdateHotelInput!, images: [Upload!]): Hotel!
  deleteHotel(id: ID!): Hotel!
  deleteRoom(id: ID!): Room!
  deletePrice(id: ID!):Price!
  deleteTariff(id: ID!): Tariff!
  deleteCategory(id: ID!): Category!
}

input CreateHotelInput {
  name: String!
  country: String
  city: String
  address: String
  quote: String
  index: String
  email: String
  number: String
  inn: String
  ogrn: String
  rs: String
  bank: String
  bik: String
  categories: [CategoryInput!]
  rooms: [RoomInput!]
  tariffs: [TariffInput!]
  prices: [PriceInput!]
}

input UpdateHotelInput {
  name: String
  country: String
  city: String
  address: String
  quote: String
  index: String
  email: String
  number: String
  inn: String
  ogrn: String
  rs: String
  bank: String
  bik: String
  categories: [CategoryInput!]
  rooms: [RoomInput!]
  tariffs: [TariffInput!]
  prices: [PriceInput!]
}

input CategoryInput {
  id: ID
  name: String
  tariffId: ID
}

input RoomInput {
  id: ID
  name: String
  places: Float
  tariffId: ID
  categoryId: ID
}

input TariffInput {
  id: ID
  name: String
}

input PriceInput {
  id: ID
  tariffId: ID!
  categoryId: ID!
  amount: Float
  amountair: Float
}

`

export default hotelTypeDef

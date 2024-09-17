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
  images: [String!]!
  categories: [Category!]!
  rooms: [Room!]!
  tariffs: [Tariff!]!
}

type Category {
  id: ID!
  name: String!
  rooms: [Room!]!
  prices: [Price!]!
}

type Room {
  id: ID!
  name: String!
  category: Category!
}

type Tariff {
  id: ID!
  name: String!
  prices: [Price!]!
}

type Price {
  id: ID!
  amount: Float!
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
}

input CategoryInput {
  id: ID
  name: String!
}

input RoomInput {
  id: ID
  name: String!
  categoryId: ID!
}

input TariffInput {
  id: ID
  name: String!
}

input PriceInput {
  id: ID
  amount: Float!
  categoryId: ID!
  tariffId: ID!
}

`

export default hotelTypeDef

const hotelTypeDef = `#graphql

  scalar Upload

  type Hotel {
    id: ID!
    name: String!
    country: String!
    city: String!
    address: String!
    quote: String!
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
    rates: [Rate!]!
    rooms: [Room!]!
  }

  type Category {
    id: ID!
    name: String!
    rooms: [Room!]!
  }

  type Rate {
    id: ID!
    name: String!
    prices: [Price!]!
  }

  type Room {
    id: ID!
    name: String!
    category: Category
    rate: Rate
  }

  type Price {
    id: ID!
    amount: Float!
    category: Category!
    rate: Rate!
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
    country: String!
    city: String!
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
    rates: [RateInput!]
    rooms: [RoomInput!]
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
    rates: [RateInput!]
    rooms: [RoomInput!]
  }

  input CategoryInput {
    name: String!
  }

  input RateInput {
    name: String!
    prices: [PriceInput!]!
  }

  input PriceInput {
    amount: Float!
    categoryId: ID!
  }

  input RoomInput {
    name: String!
  }
`

export default hotelTypeDef

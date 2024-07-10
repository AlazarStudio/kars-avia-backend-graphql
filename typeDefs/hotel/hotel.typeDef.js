const hotelTypeDef = `#graphql
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
    staff: [HotelPersonal!]!
    categories: [HotelCategory!]!
    rooms: [HotelRoom!]!
    tariffs: [HotelTariff!]!
  }

  type HotelPersonal {
    id: ID!
    name: String!
    role: String!
    login: String!
    password: String!
    hotel: Hotel!
    department: HotelDepartment
  }

  type HotelDepartment {
    id: ID!
    name: String!
    staff: [HotelPersonal!]!
  }

  type HotelCategory {
    id: ID!
    name: String!
    rooms: [HotelRoom!]!
    tariffs: [HotelTariff!]!
    hotel: Hotel!
  }

  type HotelRoom {
    id: ID!
    name: String!
    hotelCategory: HotelCategory!
    hotel: Hotel!
  }

  type HotelTariff {
    id: ID!
    name: String!
    price: Float!
    hotelCategory: HotelCategory!
    hotel: Hotel!
  }

  type Query {
    hotels: [Hotel!]!
    hotel(id: ID!): Hotel
  }

  type Mutation {
    createHotel(input: CreateHotelInput!): Hotel!
    updateHotel(id: ID!, input: UpdateHotelInput!): Hotel!
    deleteHotel(id: ID!): Hotel!
  }

  input CreateHotelInput {
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
  }
`

export default hotelTypeDef

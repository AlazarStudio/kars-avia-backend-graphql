const airlineTypeDef = `#graphql

    scalar Upload

    type Airline {
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
        staff: [AirlinePersonal!]!
        images: [String!]!
    }

    type AirlinePersonal {
        id: ID!
        name: String!
        role: String!
        login: String!
        password: String!
        hotel: Hotel!
        department: AirlineDepartment
    }

    type AirlineDepartment {
        id: ID!
        name: String!
        staff: [AirlinePersonal!]!
    }

    type Query {
        airlines: [Airline!]!
        airline(id: ID!): Airline
    }

    type Mutation {
        createAirline(input: CreateAirlineInput!, images: [Upload!]): Airline!
        updateAirline(id: ID!, input: UpdateAirlineInput!, images: [Upload!]): Airline!
        deleteAirline(id: ID!): Airline!
    }

    input CreateAirlineInput {
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

  input UpdateAirlineInput {
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

export default airlineTypeDef

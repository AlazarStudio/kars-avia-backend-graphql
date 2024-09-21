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
        images: [String!]!
        department: [AirlineDepartment!]!
        staff: [AirlinePersonal!]!
    }

    type AirlineDepartment {
        id: ID!
        name: String!
        staff: [AirlinePersonal!]
    }

    type AirlinePersonal {
        id: ID!
        name: String!
        role: String!
        login: String!
        password: String!
        airline: Airline!
        department: AirlineDepartment
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
        # staff: AirlinePersonalInput
        # department: AirlineDepartmentInput
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
        staff: [AirlinePersonalInput!]
        department: [AirlineDepartmentInput!]
    }

    input AirlineDepartmentInput {
        id: ID
        name: String
    }

    input AirlinePersonalInput {
        id: ID
        name: String
        role: String
        login: String
        password: String
        departmentId: ID
    }

`

export default airlineTypeDef

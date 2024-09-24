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
        staff: [AirlinePersonal!]!
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
        staff: AirlinePersonalInput
        department: AirlineDepartmentInput
    }

    input AirlineDepartmentInput {
        id: ID
        name: String
        staff: ID
    }

    input AirlinePersonalInput {
        id: ID
        name: String
        role: String
        login: String
        password: String
        airlineId: ID
        departmentId: ID
    }

`

export default airlineTypeDef

if (prices) {
  for (const price of prices) {
    let category = await prisma.hotel.findUnique({
      where: {}
    })
    if (price.categoryId) {
      await prisma.price.update({
        where: { id: price.id },
        data: {
          amount: price.amount,
          amountair: price.amountair,
          category: {
            connect: { id: price.categoryId }
          },
          tariff: {
            connect: { id: price.tariffId }
          }
        }
      })
    } else {
      await prisma.price.create({
        data: {
          amount: price.amount,
          amountair: price.amountair,
          category: {
            connect: { id: price.categoryId }
          },
          tariff: {
            connect: { id: price.tariffId }
          },
          hotel: {
            connect: { id: id }
          }
        }
      })
    }
  }
}

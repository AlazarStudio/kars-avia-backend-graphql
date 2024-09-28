import { prisma } from "../../prisma.js"

const airportResolver = {
  Query: {
    airports: async () => {
      return prisma.airport.findMany({})
    },
    airport: async (_, { airportId }) => {
      return prisma.airport.findUnique({
        where: { id: airportId }
      })
    },
    airportCity: async (_, { city }) => {
      return prisma.airport.findMany({
        where: { city: { contains: city } }
      })
    }
  }
}

export default airportResolver

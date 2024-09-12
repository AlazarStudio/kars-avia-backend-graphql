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
    }
  }
}

export default airportResolver

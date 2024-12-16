import { prisma } from "../../prisma.js"

const airportResolver = {
  Query: {
    airports: async () => {
      return prisma.airport.findMany({orderBy: { name: "asc" }})
    },
    airport: async (_, { airportId }) => {
      return prisma.airport.findUnique({
        where: { id: airportId }
      })
    },
    airportCity: async (_, { city }) => {
      return prisma.airport.findMany({
        where: { city: { contains: city, mode: "insensitive" } }, orderBy: { name: "asc" }
      })
    }
  }
}

export default airportResolver

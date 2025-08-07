import { allMiddleware } from "../../middlewares/authMiddleware.js"
import { prisma } from "../../prisma.js"

const airportResolver = {
  Query: {
    airports: async (_, __, context) => {
      await allMiddleware(context)
      return prisma.airport.findMany({ orderBy: { city: "asc" } })
    },
    airport: async (_, { airportId }, context) => {
      await allMiddleware(context)
      return prisma.airport.findUnique({
        where: { id: airportId }
      })
    },
    airportCity: async (_, { city }, context) => {
      await allMiddleware(context)
      return prisma.airport.findMany({
        where: { city: { contains: city, mode: "insensitive" } },
        orderBy: { name: "asc" }
      })
    }
  }
}

export default airportResolver

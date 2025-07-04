import { allMiddleware } from "../../middlewares/authMiddleware.js"
import { prisma } from "../../prisma.js"

const cityResolver = {
  Query: {
    citys: async (_, __, context) => {
      allMiddleware(context)
      return prisma.city.findMany({ orderBy: { city: "asc" } })
    },
    city: async (_, { city }, context) => {
      allMiddleware(context)
      return prisma.city.findMany({
        where: { city: { contains: city, mode: "insensitive" } }
      })
    }
  }
  // Mutation: {
  // }
}

export default cityResolver

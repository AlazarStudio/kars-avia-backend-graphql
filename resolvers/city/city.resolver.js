import { allMiddleware } from "../../middlewares/authMiddleware.js"
import { prisma } from "../../prisma.js"

const cityResolver = {
  Query: {
    citys: async (_, __, context) => {
      await allMiddleware(context) // MIDDLEWARE_REVIEW: allMiddleware
      return prisma.city.findMany({ orderBy: { city: "asc" } })
    },
    city: async (_, { city }, context) => {
      await allMiddleware(context) // MIDDLEWARE_REVIEW: allMiddleware
      return prisma.city.findMany({
        where: { city: { contains: city, mode: "insensitive" } }
      })
    },
    cityRegions: async (_, __, context) => {
      await allMiddleware(context) // MIDDLEWARE_REVIEW: allMiddleware
      const rows = await prisma.city.findMany({
        select: { region: true },
        distinct: ["region"]
      })
      return rows
        .map((r) => r.region)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, "ru"))
    }
  }
  // Mutation: {
  // }
}

export default cityResolver

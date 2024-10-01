import { prisma } from "../../prisma.js"

const cityResolver = {
  Query: {
    citys: async () => {
      return prisma.city.findMany({})
    },
    city: async (_, { city }) => {
      return prisma.city.findMany({
        where: { city: { contains: city, mode: "insensitive" } }
      })
    }
  },
  // Mutation: {
  // }
}

export default cityResolver
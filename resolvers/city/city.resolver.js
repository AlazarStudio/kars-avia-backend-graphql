import { allMiddleware } from "../../middlewares/authMiddleware.js"
import { prisma } from "../../prisma.js"

const cityInclude = { regionRef: true }

const cityResolver = {
  Query: {
    citys: async (_, __, context) => {
      await allMiddleware(context) // MIDDLEWARE_REVIEW: allMiddleware
      return prisma.city.findMany({
        orderBy: { city: "asc" },
        include: cityInclude
      })
    },
    city: async (_, { city }, context) => {
      await allMiddleware(context) // MIDDLEWARE_REVIEW: allMiddleware
      return prisma.city.findMany({
        where: { city: { contains: city, mode: "insensitive" } },
        include: cityInclude
      })
    },
    cityRegions: async (_, __, context) => {
      await allMiddleware(context) // MIDDLEWARE_REVIEW: allMiddleware
      const rows = await prisma.region.findMany({
        select: { name: true },
        orderBy: { name: "asc" }
      })
      return rows.map((r) => r.name).filter(Boolean)
    },
    regions: async (_, __, context) => {
      await allMiddleware(context) // MIDDLEWARE_REVIEW: allMiddleware
      return prisma.region.findMany({ orderBy: { name: "asc" } })
    },
    citiesByRegion: async (_, { region }, context) => {
      await allMiddleware(context) // MIDDLEWARE_REVIEW: allMiddleware
      return prisma.city.findMany({
        where: { regionRef: { name: region.trim() } },
        orderBy: { city: "asc" },
        include: cityInclude
      })
    },
    citiesByRegionId: async (_, { regionId }, context) => {
      await allMiddleware(context) // MIDDLEWARE_REVIEW: allMiddleware
      return prisma.city.findMany({
        where: { regionId },
        orderBy: { city: "asc" },
        include: cityInclude
      })
    }
  },

  City: {
    region: async (parent) => {
      if (parent.regionRef?.name) return parent.regionRef.name
      if (!parent.id) return ""
      const record = await prisma.city.findUnique({
        where: { id: parent.id },
        select: { regionRef: { select: { name: true } } }
      })
      return record?.regionRef?.name ?? ""
    },
    regionRef: async (parent) => {
      if (parent.regionRef) return parent.regionRef
      if (!parent.id) return null
      const record = await prisma.city.findUnique({
        where: { id: parent.id },
        select: { regionRef: true }
      })
      return record?.regionRef ?? null
    }
  }
  // Mutation: {
  // }
}

export default cityResolver

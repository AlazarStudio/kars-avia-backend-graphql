import { allMiddleware } from "../../middlewares/authMiddleware.js"

const logResolver = {
  Query: {
    logs: async (_, { requestId, pagination }, context) => {
      await allMiddleware(context)
      const { skip, take } = pagination || {}

      const totalCount = await prisma.log.count({
        where: { requestId }
      })

      const logs = await prisma.log.findMany({
        where: { requestId },
        include: { user: true },
        skip,
        take,
        orderBy: { createdAt: "desc" }
      })

      const totalPages = Math.ceil(totalCount / take)

      return { totalCount, totalPages, logs }
    }
  }
}

export default logResolver

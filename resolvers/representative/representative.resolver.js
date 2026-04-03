import { GraphQLError } from "graphql"
import { withFilter } from "graphql-subscriptions"
import { prisma } from "../../prisma.js"
import {
  allMiddleware,
  representativeMiddleware
} from "../../middlewares/authMiddleware.js"
import {
  pubsub,
  REPRESENTATIVE_DEPARTMENT_CREATED,
  REPRESENTATIVE_DEPARTMENT_UPDATED
} from "../../services/infra/pubsub.js"
import { logger } from "../../services/infra/logger.js"

const REPRESENTATIVE_ROLE = "REPRESENTATIVE"

const ensureRepresentativeUsers = async (userIds = []) => {
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return []
  }

  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: {
      id: true,
      role: true,
      userType: true
    }
  })

  if (users.length !== userIds.length) {
    const foundIds = new Set(users.map((user) => user.id))
    const missing = userIds.filter((id) => !foundIds.has(id))
    throw new GraphQLError(
      `Пользователи с ID ${missing.join(", ")} не найдены`,
      { extensions: { code: "NOT_FOUND" } }
    )
  }

  const invalidUsers = users.filter(
    (user) =>
      user.role !== REPRESENTATIVE_ROLE && user.userType !== REPRESENTATIVE_ROLE
  )

  if (invalidUsers.length > 0) {
    throw new GraphQLError(
      `Пользователи с ID ${invalidUsers.map((user) => user.id).join(", ")} не являются представителями`,
      { extensions: { code: "FORBIDDEN" } }
    )
  }

  return users
}

const ensureAirlinesExist = async (airlineIds = []) => {
  if (!Array.isArray(airlineIds) || airlineIds.length === 0) {
    return
  }

  const existing = await prisma.airline.findMany({
    where: { id: { in: airlineIds } },
    select: { id: true }
  })
  if (existing.length !== airlineIds.length) {
    const foundIds = new Set(existing.map((item) => item.id))
    const missing = airlineIds.filter((id) => !foundIds.has(id))
    throw new GraphQLError(
      `Авиакомпании с ID ${missing.join(", ")} не найдены`,
      { extensions: { code: "NOT_FOUND" } }
    )
  }
}

const ensureAirportsExist = async (airportIds = []) => {
  if (!Array.isArray(airportIds) || airportIds.length === 0) {
    return
  }

  const existing = await prisma.airport.findMany({
    where: { id: { in: airportIds } },
    select: { id: true }
  })
  if (existing.length !== airportIds.length) {
    const foundIds = new Set(existing.map((item) => item.id))
    const missing = airportIds.filter((id) => !foundIds.has(id))
    throw new GraphQLError(`Аэропорты с ID ${missing.join(", ")} не найдены`, {
      extensions: { code: "NOT_FOUND" }
    })
  }
}

const updateRepresentativeLinks = async ({
  departmentId,
  representativeIds,
  airlineIds,
  airportIds
}) => {
  if (representativeIds !== undefined) {
    const currentUsers = await prisma.user.findMany({
      where: { representativeDepartmentId: departmentId },
      select: { id: true }
    })
    const currentIds = currentUsers.map((item) => item.id)
    const nextIds = representativeIds

    const toConnect = nextIds.filter((id) => !currentIds.includes(id))
    const toDisconnect = currentIds.filter((id) => !nextIds.includes(id))

    if (toDisconnect.length > 0) {
      await prisma.user.updateMany({
        where: { id: { in: toDisconnect } },
        data: { representativeDepartmentId: null }
      })
    }
    if (toConnect.length > 0) {
      await prisma.user.updateMany({
        where: { id: { in: toConnect } },
        data: { representativeDepartmentId: departmentId }
      })
    }
  }

  if (airlineIds !== undefined) {
    const currentLinks = await prisma.representativeDepartmentOnAirline.findMany({
      where: { representativeDepartmentId: departmentId },
      select: { airlineId: true }
    })
    const currentIds = currentLinks.map((item) => item.airlineId)
    const nextIds = airlineIds

    const toConnect = nextIds.filter((id) => !currentIds.includes(id))
    const toDisconnect = currentIds.filter((id) => !nextIds.includes(id))

    if (toConnect.length > 0) {
      await prisma.representativeDepartmentOnAirline.createMany({
        data: toConnect.map((airlineId) => ({
          representativeDepartmentId: departmentId,
          airlineId
        }))
      })
    }
    if (toDisconnect.length > 0) {
      await prisma.representativeDepartmentOnAirline.deleteMany({
        where: {
          representativeDepartmentId: departmentId,
          airlineId: { in: toDisconnect }
        }
      })
    }
  }

  if (airportIds !== undefined) {
    const currentLinks = await prisma.representativeDepartmentOnAirport.findMany({
      where: { representativeDepartmentId: departmentId },
      select: { airportId: true }
    })
    const currentIds = currentLinks.map((item) => item.airportId)
    const nextIds = airportIds

    const toConnect = nextIds.filter((id) => !currentIds.includes(id))
    const toDisconnect = currentIds.filter((id) => !nextIds.includes(id))

    if (toConnect.length > 0) {
      await prisma.representativeDepartmentOnAirport.createMany({
        data: toConnect.map((airportId) => ({
          representativeDepartmentId: departmentId,
          airportId
        }))
      })
    }
    if (toDisconnect.length > 0) {
      await prisma.representativeDepartmentOnAirport.deleteMany({
        where: {
          representativeDepartmentId: departmentId,
          airportId: { in: toDisconnect }
        }
      })
    }
  }
}

const representativeResolver = {
  Query: {
    representatives: async (_, { pagination }, context) => {
      await representativeMiddleware(context)
      const { skip = 0, take = 10, all, search } = pagination || {}

      const searchFilter = search?.trim()
        ? {
            OR: [
              { name: { contains: search.trim(), mode: "insensitive" } },
              { email: { contains: search.trim(), mode: "insensitive" } },
              { login: { contains: search.trim(), mode: "insensitive" } }
            ]
          }
        : null

      const where = {
        AND: [
          { active: true },
          {
            OR: [
              { role: REPRESENTATIVE_ROLE },
              { userType: REPRESENTATIVE_ROLE }
            ]
          },
          ...(searchFilter ? [searchFilter] : [])
        ]
      }

      const totalCount = await prisma.user.count({ where })

      const users = all
        ? await prisma.user.findMany({
            where,
            orderBy: { name: "asc" },
            include: { position: true }
          })
        : await prisma.user.findMany({
            where,
            skip: skip ? skip * take : undefined,
            take: take || undefined,
            orderBy: { name: "asc" },
            include: { position: true }
          })

      const totalPages = take && !all ? Math.ceil(totalCount / take) : 1
      return { users, totalCount, totalPages }
    },

    representativeDepartments: async (_, { pagination }, context) => {
      await representativeMiddleware(context)
      const { skip, take, all } = pagination || {}

      const where = { active: true }
      const totalCount = await prisma.representativeDepartment.count({ where })

      const departments = all
        ? await prisma.representativeDepartment.findMany({
            where,
            orderBy: { name: "asc" }
          })
        : await prisma.representativeDepartment.findMany({
            where,
            skip: skip ? skip * take : undefined,
            take: take || undefined,
            orderBy: { name: "asc" }
          })

      const totalPages = take && !all ? Math.ceil(totalCount / take) : 1
      return { departments, totalCount, totalPages }
    },

    representativeDepartment: async (_, { id }, context) => {
      await representativeMiddleware(context)
      return prisma.representativeDepartment.findUnique({ where: { id } })
    }
  },

  Mutation: {
    createRepresentativeDepartment: async (_, { input }, context) => {
      await representativeMiddleware(context)

      const {
        representativeIds = [],
        airlineIds = [],
        airportIds = [],
        ...restInput
      } = input

      await ensureRepresentativeUsers(representativeIds)
      await ensureAirlinesExist(airlineIds)
      await ensureAirportsExist(airportIds)

      const department = await prisma.representativeDepartment.create({
        data: {
          ...restInput
        }
      })

      await updateRepresentativeLinks({
        departmentId: department.id,
        representativeIds,
        airlineIds,
        airportIds
      })

      const enrichedDepartment = await prisma.representativeDepartment.findUnique({
        where: { id: department.id }
      })

      pubsub.publish(REPRESENTATIVE_DEPARTMENT_CREATED, {
        representativeDepartmentCreated: enrichedDepartment
      })

      return enrichedDepartment
    },

    updateRepresentativeDepartment: async (_, { id, input }, context) => {
      await representativeMiddleware(context)

      const {
        representativeIds,
        airlineIds,
        airportIds,
        ...restInput
      } = input

      if (representativeIds !== undefined) {
        await ensureRepresentativeUsers(representativeIds)
      }
      if (airlineIds !== undefined) {
        await ensureAirlinesExist(airlineIds)
      }
      if (airportIds !== undefined) {
        await ensureAirportsExist(airportIds)
      }

      const department = await prisma.representativeDepartment.update({
        where: { id },
        data: {
          ...restInput
        }
      })

      await updateRepresentativeLinks({
        departmentId: id,
        representativeIds,
        airlineIds,
        airportIds
      })

      const enrichedDepartment = await prisma.representativeDepartment.findUnique({
        where: { id: department.id }
      })

      pubsub.publish(REPRESENTATIVE_DEPARTMENT_UPDATED, {
        representativeDepartmentUpdated: enrichedDepartment
      })

      return enrichedDepartment
    },

    deleteRepresentativeDepartment: async (_, { id }, context) => {
      await representativeMiddleware(context)

      const department = await prisma.representativeDepartment.update({
        where: { id },
        data: { active: false }
      })

      await prisma.user.updateMany({
        where: { representativeDepartmentId: id },
        data: { representativeDepartmentId: null }
      })

      pubsub.publish(REPRESENTATIVE_DEPARTMENT_UPDATED, {
        representativeDepartmentUpdated: department
      })

      return department
    }
  },

  Subscription: {
    representativeDepartmentCreated: {
      subscribe: withFilter(
        () => pubsub.asyncIterator([REPRESENTATIVE_DEPARTMENT_CREATED]),
        async (payload, variables, context) => {
          try {
            await allMiddleware(context)
            await representativeMiddleware(context)
          } catch (e) {
            logger.warn(
              `[SUBSCRIPTION_AUTH] representative.representativeDepartmentCreated message=${e?.message} code=${e?.code}`
            )
            return false
          }

          return true
        }
      )
    },
    representativeDepartmentUpdated: {
      subscribe: withFilter(
        () => pubsub.asyncIterator([REPRESENTATIVE_DEPARTMENT_UPDATED]),
        async (payload, variables, context) => {
          try {
            await allMiddleware(context)
            await representativeMiddleware(context)
          } catch (e) {
            logger.warn(
              `[SUBSCRIPTION_AUTH] representative.representativeDepartmentUpdated message=${e?.message} code=${e?.code}`
            )
            return false
          }

          return true
        }
      )
    }
  },

  RepresentativeDepartment: {
    representatives: async (parent) =>
      prisma.user.findMany({
        where: {
          representativeDepartmentId: parent.id,
          active: true
        }
      }),
    airlines: async (parent) => {
      const links = await prisma.representativeDepartmentOnAirline.findMany({
        where: { representativeDepartmentId: parent.id },
        include: { airline: true }
      })
      return links.map((link) => link.airline).filter(Boolean)
    },
    airports: async (parent) => {
      const links = await prisma.representativeDepartmentOnAirport.findMany({
        where: { representativeDepartmentId: parent.id },
        include: { airport: true }
      })
      return links.map((link) => link.airport).filter(Boolean)
    }
  }
}

export default representativeResolver

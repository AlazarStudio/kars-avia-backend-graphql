import { prisma } from "../../prisma.js"
import GraphQLUpload from "graphql-upload/GraphQLUpload.mjs"
import uploadImage from "../../exports/uploadImage.js"
import logAction from "../../exports/logaction.js"
import { airlineAdminMiddleware } from "../../middlewares/authMiddleware.js"
import {
  pubsub,
  AIRLINE_CREATED,
  AIRLINE_UPDATED
} from "../../exports/pubsub.js"

const airlineResolver = {
  Upload: GraphQLUpload,

  Query: {
    airlines: async (_, { pagination }, context) => {
      const { skip, take, all } = pagination || {}
      const totalCount = await prisma.airline.count({})

      const airlines = all
        ? await prisma.airline.findMany({
            include: {
              staff: true
            },
            orderBy: { name: "asc" }
          })
        : await prisma.airline.findMany({
            skip: skip ? skip * take : undefined,
            take: take || undefined,
            include: {
              staff: true
            },
            orderBy: { name: "asc" }
          })

      const totalPages = take && !all ? Math.ceil(totalCount / take) : 1

      return {
        airlines,
        totalCount,
        totalPages
      }
    },
    airline: async (_, { id }, context) => {
      return await prisma.airline.findUnique({
        where: { id },
        include: {
          staff: true,
          logs: true,
        }
      })
    },
    airlineStaff: async (_, { id }, context) => {
      return await prisma.airlinePersonal.findUnique({
        where: { id },
        include: { hotelChess: true }
      })
    },
    airlineStaffs: async (_, { airlineId }, context) => {
      return await prisma.airlinePersonal.findMany({
        where: { airlineId: airlineId },
        include: { hotelChess: true },
        orderBy: { name: "asc" }
      })
    }
  },
  Mutation: {
    createAirline: async (_, { input, images }, context) => {
      const { user } = context
      airlineAdminMiddleware(context)
      let imagePaths = []
      if (images && images.length > 0) {
        for (const image of images) {
          imagePaths.push(await uploadImage(image))
        }
      }

      const defaultMealPrice = {
        breakfast: 0,
        lunch: 0,
        dinner: 0
      }

      const data = {
        ...input,
        MealPrice: input.MealPrice || defaultMealPrice,
        images: imagePaths
      }
      const createdAirline = await prisma.airline.create({
        data,
        include: {
          staff: true,
          department: true
        }
      })
      await logAction({
        context,
        action: `create_airline`,
        description: `Пользователь ${user.name} добавил авиакомпанию ${createdAirline.name}`,
        airlineName: createdAirline.name,
        airlineId: createdAirline.id,
      })
      pubsub.publish(AIRLINE_CREATED, { airlineCreated: createdAirline })
      return createdAirline
    },
    updateAirline: async (_, { id, input, images }, context) => {
      const { user } = context
      airlineAdminMiddleware(context)
      let imagePaths = []
      if (images && images.length > 0) {
        for (const image of images) {
          imagePaths.push(await uploadImage(image))
        }
      }
      const { department, staff, ...restInput } = input
      try {
        const updatedAirline = await prisma.airline.update({
          where: { id },
          data: {
            ...restInput,
            ...(imagePaths.length > 0 && { images: { set: imagePaths } })
          }
        })
        if (department) {
          for (const depart of department) {
            if (depart.id) {
              await prisma.airlineDepartment.update({
                where: { id: depart.id },
                data: {
                  name: depart.name,
                  users: {
                    connect: depart.userIds
                      ? depart.userIds.map((userId) => ({ id: userId }))
                      : []
                  }
                }
              })
              await logAction({
                context,
                action: `update_airline`,
                description: `Пользователь ${user.name} изменил данные в департаменте ${depart.name}`,
                airlineId: id
              })
            } else {
              await prisma.airlineDepartment.create({
                data: {
                  airlineId: id,
                  name: depart.name,
                  users: {
                    connect: depart.userIds
                      ? depart.userIds.map((userId) => ({ id: userId }))
                      : []
                  }
                }
              })
              await logAction({
                context,
                action: `update_airline`,
                description: `Пользователь ${user.name} добавил департамент ${depart.name}`,
                airlineId: id,
              })
            }
          }
        }
        if (staff) {
          for (const person of staff) {
            if (person.id) {
              await prisma.airlinePersonal.update({
                where: { id: person.id },
                data: {
                  name: person.name,
                  departmentId: person.departmentId,
                  number: person.number,
                  position: person.position,
                  gender: person.gender
                }
              })
              await logAction({
                context,
                action: `update_airline`,
                description: `Пользователь ${user.name} обновил данные пользователя ${person.name}`,
                airlineId: id,
              })
            } else {
              await prisma.airlinePersonal.create({
                data: {
                  airlineId: id,
                  name: person.name,
                  departmentId: person.departmentId,
                  number: person.number,
                  position: person.position,
                  gender: person.gender
                }
              })
              await logAction({
                context,
                action: `update_airline`,
                description: `Пользователь ${user.name} добавил пользователя ${person.name}`,
                airlineId: id,
              })
            }
          }
        }
        const airlineWithRelations = await prisma.airline.findUnique({
          where: { id },
          include: {
            department: true,
            staff: true
          }
        })
        await logAction({
          context,
          action: `update_airline`,
          description: `Пользователь ${user.name} обновил данные авиакомпании ${person.name}`,
          airlineId: id,
        })
        pubsub.publish(AIRLINE_UPDATED, {
          airlineUpdated: airlineWithRelations
        })
        return airlineWithRelations
      } catch (error) {
        console.error("Ошибка при обновлении авиакомпании:", error)
        throw new Error("Не удалось обновить авиакомпанию")
      }
    },
    deleteAirline: async (_, { id }, context) => {
      airlineAdminMiddleware(context)
      return await prisma.airline.delete({
        where: { id },
        include: {
          staff: true
        }
      })
    },
    deleteAirlineDepartment: async (_, { id }, context) => {
      airlineAdminMiddleware(context)
      return await prisma.airlineDepartment.delete({
        where: { id },
        include: {
          staff: true
        }
      })
    },
    deleteAirlineStaff: async (_, { id }, context) => {
      airlineAdminMiddleware(context)
      return await prisma.airlinePersonal.delete({
        where: { id }
      })
    }
  },
  Subscription: {
    airlineCreated: {
      subscribe: () => pubsub.asyncIterator([AIRLINE_CREATED])
    },
    airlineUpdated: {
      subscribe: () => pubsub.asyncIterator([AIRLINE_UPDATED])
    }
  },
  Airline: {
    department: async (parent) => {
      return await prisma.airlineDepartment.findMany({
        where: { airlineId: parent.id }
      })
    },
    staff: async (parent) => {
      return await prisma.airlinePersonal.findMany({
        where: { airlineId: parent.id }
      })
    }
  },
  AirlineDepartment: {
    users: async (parent) => {
      return await prisma.user.findMany({
        where: { airlineDepartmentId: parent.id }
      })
    },
    staff: async (parent) => {
      return await prisma.airlinePersonal.findMany({
        where: { airlineId: parent.id }
      })
    }
  },
  AirlinePersonal: {
    hotelChess: async (parent) => {
      const hotelChessEntries = await prisma.hotelChess.findMany({
        where: { clientId: parent.id },
        include: { hotel: true }
      })
      return hotelChessEntries
    }
  }
}

export default airlineResolver

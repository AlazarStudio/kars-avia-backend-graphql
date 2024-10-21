import { prisma } from "../../prisma.js"
import GraphQLUpload from "graphql-upload/GraphQLUpload.mjs"
import uploadImage from "../../exports/uploadImage.js"
import logAction from "../../exports/logaction.js"
import { airlineAdminMiddleware } from "../../middlewares/authMiddleware.js"
import dateTimeFormatter from "../../exports/dateTimeFormater.js"
import calculateMeal from "../../exports/calculateMeal.js"

const airlineResolver = {
  Upload: GraphQLUpload,

  Query: {
    airlines: async (_, __, context) => {
      return await prisma.airline.findMany({
        include: {
          staff: true
        }
      })
    },
    airline: async (_, { id }, context) => {
      return await prisma.airline.findUnique({
        where: { id },
        include: {
          staff: true
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
        include: { hotelChess: true }
      })
    }
  },
  Mutation: {
    createAirline: async (_, { input, images }, context) => {
      airlineAdminMiddleware(context)

      let imagePaths = []
      if (images && images.length > 0) {
        for (const image of images) {
          imagePaths.push(await uploadImage(image))
        }
      }

      const data = {
        ...input,
        images: imagePaths
      }

      return await prisma.airline.create({
        data,
        include: {
          staff: true,
          department: true
        }
      })
    },
    updateAirline: async (_, { id, input, images }, context) => {
      airlineAdminMiddleware(context)

      let imagePaths = []
      if (images && images.length > 0) {
        for (const image of images) {
          imagePaths.push(await uploadImage(image))
        }
      }
      // const data = {
      //   ...input,
      //   ...(imagePaths.length > 0 && { images: { set: imagePaths } })
      // }

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

        return airlineWithRelations
      } catch (error) {
        console.error("Ошибка при обновлении авиакомпании:", error)
        throw new Error("Не удалось обновить авиакомпанию")
      }

      // return await prisma.airline.update({
      //   where: { id },
      //   data,
      //   include: {
      //     staff: true,
      //     department: true
      //   }
      // })
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
      return await prisma.airlinePersonal.delete({
        where: { id }
      })
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

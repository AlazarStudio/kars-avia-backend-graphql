import { prisma } from "../../prisma.js"
import GraphQLUpload from "graphql-upload/GraphQLUpload.mjs"
import uploadImage from "../../exports/uploadImage.js"
import { logAction } from "../../exports/logaction.js"

const airlineResolver = {
  Upload: GraphQLUpload,

  Query: {
    airlines: async () => {
      return await prisma.airline.findMany({
        include: {
          staff: true
        }
      })
    },
    airline: async (_, { id }) => {
      return await prisma.airline.findUnique({
        where: { id },
        include: {
          staff: true
        }
      })
    }
  },
  Mutation: {
    createAirline: async (_, { input, images }, context) => {
      if (
        context.user.role !== "SUPERADMIN" ||
        context.user.role !== "ADMIN" ||
        context.user.role !== "AIRLINEADMIN"
      ) {
        throw new Error("Access forbidden: Admins only")
      }

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
      if (
        context.user.role !== "SUPERADMIN" &&
        context.user.role !== "ADMIN" &&
        context.user.role !== "AIRLINEADMIN"
      ) {
        throw new Error("Access forbidden: Admins only")
      }

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
                  name: depart.name
                }
              })
            } else {
              await prisma.airlineDepartment.create({
                data: {
                  airlineId: id,
                  name: depart.name
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
                  role: person.role,
                  login: person.login,
                  password: person.password,
                  departmentId: person.departmentId
                }
              })
            } else {
              await prisma.airlinePersonal.create({
                data: {
                  name: person.name,
                  role: person.role,
                  login: person.login,
                  password: person.password,
                  airlineId: id,
                  departmentId: person.departmentId
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
      if (
        context.user.role !== "SUPERADMIN" ||
        context.user.role !== "ADMIN" ||
        context.user.role !== "AIRLINEADMIN"
      ) {
        throw new Error("Access forbidden: Admins only")
      }

      return await prisma.airline.delete({
        where: { id },
        include: {
          staff: true
        }
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
    staff: async (parent) => {
      return await prisma.airlinePersonal.findMany({
        where: { airlineId: parent.id }
      })
    }
  }
}

export default airlineResolver

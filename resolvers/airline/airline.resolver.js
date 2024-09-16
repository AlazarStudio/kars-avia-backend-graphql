import { prisma } from "../../prisma.js"
import GraphQLUpload from "graphql-upload/GraphQLUpload.mjs"
import uploadImage from "../../exports/uploadImage.js"

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
    createAirline: async (_, { input, images }) => {
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
          staff: true
        }
      })
    },
    updateAirline: async (_, { id, input, images }) => {
      let imagePaths = []
      if (images && images.length > 0) {
        for (const image of images) {
          imagePaths.push(await uploadImage(image))
        }
      }
      const data = {
        ...input,
        ...(imagePaths.length > 0 && { images: { set: imagePaths } }),
      }
      return await prisma.airline.update({
        where: { id },
        data,
        include: {
          staff: true
        }
      })
    },
    deleteAirline: async (_, { id }) => {
      return await prisma.airline.delete({
        where: { id },
        include: {
          staff: true
        }
      })
    }
  },
  Airline: {
    staff: async (parent) => {
      return await prisma.airlinePersonal.findMany({
        where: { airlineId: parent.id }
      })
    }
  }
}

export default airlineResolver

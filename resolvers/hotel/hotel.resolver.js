import { prisma } from "../../prisma.js"
import GraphQLUpload from "graphql-upload/GraphQLUpload.mjs"
import uploadImage from "../../exports/uploadImage.js"

const hotelResolver = {
  Upload: GraphQLUpload,

  Query: {
    hotels: async () => {
      return await prisma.hotel.findMany({
        include: {
          categories: true,
          rooms: true,
          rates: true
        }
      })
    },
    hotel: async (_, { id }) => {
      return await prisma.hotel.findUnique({
        where: { id },
        include: {
          categories: true,
          rooms: true,
          rates: true
        }
      })
    }
  },

  Mutation: {
    createHotel: async (_, { input, images }) => {
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

      return await prisma.hotel.create({
        data,
        include: {
          categories: true,
          rooms: true,
          rates: true
        }
      })
    },

    updateHotel: async (_, { id, input, images }) => {
      let imagePaths = []
      if (images && images.length > 0) {
        for (const image of images) {
          imagePaths.push(await uploadImage(image))
        }
      }

      const categoryUpserts = input.categories
        ? {
            create: input.categories.map((category) => ({
              name: category.name
            }))
          }
        : undefined

      const roomUpdates = input.rooms
        ? {
            create: input.rooms.map((room) => ({
              name: room.name,
              categoryId: room.categoryId || null
            }))
          }
        : undefined

      const data = {
        ...input,
        ...(imagePaths.length > 0 && { images: { set: imagePaths } }),
        categories: categoryUpserts,
        rooms: roomUpdates
      }

      return await prisma.hotel.update({
        where: { id },
        data,
        include: {
          categories: true,
          rooms: true,
          rates: true
        }
      })
    },

    deleteHotel: async (_, { id }) => {
      return await prisma.hotel.delete({
        where: { id },
        include: {
          categories: true,
          rooms: true,
          rates: true
        }
      })
    }
  },

  Hotel: {
    categories: async (parent) => {
      return await prisma.category.findMany({
        where: { hotelId: parent.id },
        include: {
          rooms: {
            include: {
              rate: true
            }
          }
        }
      })
    }
  },

  Category: {
    rooms: async (parent) => {
      const rooms = await prisma.room.findMany({
        where: { categoryId: parent.id },
        include: {
          rate: true
        }
      })
      return rooms || []
    }
  },

  Room: {
    rate: async (parent) => {
      return await prisma.rate.findMany({
        where: { roomId: parent.id }
      })
    }
  }
}

export default hotelResolver

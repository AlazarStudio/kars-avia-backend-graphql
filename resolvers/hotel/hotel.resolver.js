// hotel.resolver.js

import { prisma } from "../../prisma.js"
import GraphQLUpload from "graphql-upload/GraphQLUpload.mjs"
import uploadImage from "../../exports/uploadImage.js"

const hotelResolver = {
  Upload: GraphQLUpload,

  Query: {
    hotels: async (_, {}, context) => {
      return await prisma.hotel.findMany({
        include: {
          categories: true,
          rooms: true,
          tariffs: true
        }
      })
    },
    hotel: async (_, { id }, context) => {
      return await prisma.hotel.findUnique({
        where: { id },
        include: {
          categories: true,
          rooms: true,
          tariffs: true
        }
      })
    }
  },

  Mutation: {
    createHotel: async (_, { input, images }, context) => {
      // if (context.user.role !== 'SUPERADMIN' && context.user.role !== 'ADMIN' && context.user.role !== 'HOTELADMIN' ) {
      //   throw new Error('Access forbidden: Admins only')
      // }

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
          tariffs: true
        }
      })
    },

    updateHotel: async (_, { id, input, images }, context) => {
      // if (context.user.role !== 'SUPERADMIN' && context.user.role !== 'ADMIN' && context.user.role !== 'HOTELADMIN' ) {
      //   throw new Error('Access forbidden: Admins only')
      // }

      let imagePaths = []
      if (images && images.length > 0) {
        for (const image of images) {
          imagePaths.push(await uploadImage(image))
        }
      }

      const { categories, rooms, tariffs, prices, ...restInput } = input
      console.log(restInput, " inputs ", categories, rooms, tariffs)

      try {
        // Обновляем поля отеля
        const updatedHotel = await prisma.hotel.update({
          where: { id },
          data: {
            ...restInput,
            ...(imagePaths.length > 0 && { images: { set: imagePaths } })
          }
        })

        // Обработка категорий
        if (categories) {
          for (const category of categories) {
            if (category.id) {
              await prisma.category.update({
                where: { id: category.id },
                data: {
                  name: category.name
                }
              })
            } else {
              await prisma.category.create({
                data: {
                  hotelId: id,
                  name: category.name
                }
              })
            }
          }
        }

        // Обработка комнат
        if (rooms) {
          for (const room of rooms) {
            if (room.id) {
              await prisma.room.update({
                where: { id: room.id },
                data: {
                  name: room.name,
                  tariffId: room.tariffId,
                  categoryId: room.categoryId
                }
              })
            } else {
              await prisma.room.create({
                data: {
                  hotelId: id,
                  name: room.name,
                  tariffId: room.tariffId,
                  categoryId: room.categoryId
                }
              })
            }
          }
        }

        // Обработка тарифов
        if (tariffs) {
          for (const tariff of tariffs) {
            if (tariff.id) {
              await prisma.tariff.update({
                where: { id: tariff.id },
                data: {
                  name: tariff.name
                }
              })
            } else {
              await prisma.tariff.create({
                data: {
                  hotelId: id,
                  name: tariff.name
                }
              })
            }
          }
        }

        // Обработка цен
        if (prices) {
          for (const price of prices) {
            if (price.id) {
              await prisma.price.update({
                where: { id: price.id },
                data: {
                  amount: price.amount,
                  amountair: price.amountair,
                  category: {
                    connect: { id: price.categoryId }
                  },
                  tariff: {
                    connect: { id: price.tariffId }
                  }
                }
              })
            } else {
              await prisma.price.create({
                data: {
                  amount: price.amount,
                  amountair: price.amountair,
                  category: {
                    connect: { id: price.categoryId }
                  },
                  tariff: {
                    connect: { id: price.tariffId }
                  },
                  hotel: {
                    connect: { id: id }
                  }
                }
              })
            }
          }
        }

        // Получаем обновленный отель с вложенными данными
        const hotelWithRelations = await prisma.hotel.findUnique({
          where: { id },
          include: {
            categories: true,
            rooms: true,
            tariffs: true
          }
        })

        return hotelWithRelations
      } catch (error) {
        console.error("Ошибка при обновлении отеля:", error)
        throw new Error("Не удалось обновить отель")
      }
    },

    deleteHotel: async (_, { id }, context) => {
      // if (context.user.role !== 'SUPERADMIN' && context.user.role !== 'ADMIN' && context.user.role !== 'HOTELADMIN') {
      //   throw new Error('Access forbidden: Admins only')
      // }
      return await prisma.hotel.delete({
        where: { id }
      })
    },
    deleteRoom: async (_, { id }, context) => {
      // if (context.user.role !== 'SUPERADMIN' && context.user.role !== 'ADMIN' && context.user.role !== 'HOTELADMIN') {
      //   throw new Error('Access forbidden: Admins only')
      // }
      return await prisma.room.delete({
        where: { id }
      })
    },
    deletePrice: async (_, { id }, context) => {
      // if (context.user.role !== 'SUPERADMIN' && context.user.role !== 'ADMIN' && context.user.role !== 'HOTELADMIN') {
      //   throw new Error('Access forbidden: Admins only')
      // }
      return await prisma.price.delete({
        where: { id }
      })
    },
    deleteTariff: async (_, { id }, context) => {
      // if (context.user.role !== 'SUPERADMIN' && context.user.role !== 'ADMIN' && context.user.role !== 'HOTELADMIN') {
      //   throw new Error('Access forbidden: Admins only')
      // }
      return await prisma.tariff.delete({
        where: { id }
      })
    },
    deleteCategory: async (_, { id }, context) => {
      // if (context.user.role !== 'SUPERADMIN' && context.user.role !== 'ADMIN' && context.user.role !== 'HOTELADMIN') {
      //   throw new Error('Access forbidden: Admins only')
      // }
      return await prisma.category.delete({
        where: { id }
      })
    }
  },

  Hotel: {
    categories: async (parent) => {
      return await prisma.category.findMany({
        where: { hotelId: parent.id }
      })
    },
    rooms: async (parent) => {
      return await prisma.room.findMany({
        where: { hotelId: parent.id }
      })
    },
    tariffs: async (parent) => {
      return await prisma.tariff.findMany({
        where: { hotelId: parent.id }
      })
    },
    prices: async (parent) => {
      return await prisma.price.findMany({
        where: { hotelId: parent.id }
      })
    }
  },

  Category: {
    rooms: async (parent) => {
      return await prisma.room.findMany({
        where: { categoryId: parent.id }
      })
    },
    prices: async (parent) => {
      return await prisma.price.findMany({
        where: { categoryId: parent.id },
        include: {
          tariff: true
        }
      })
    }
  },

  Tariff: {
    prices: async (parent) => {
      return await prisma.price.findMany({
        where: { tariffId: parent.id },
        include: {
          category: true
        }
      })
    }
  },

  Room: {
    category: async (parent) => {
      return await prisma.category.findUnique({
        where: { id: parent.categoryId }
      })
    },
    tariff: async (parent) => {
      return await prisma.tariff.findUnique({
        where: { id: parent.tariffId }
      })
    }
  },

  Price: {
    category: async (parent) => {
      return await prisma.category.findUnique({
        where: { id: parent.categoryId }
      })
    },
    tariff: async (parent) => {
      return await prisma.tariff.findUnique({
        where: { id: parent.tariffId }
      })
    }
  }
}

export default hotelResolver

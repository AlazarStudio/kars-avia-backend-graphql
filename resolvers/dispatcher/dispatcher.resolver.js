import { prisma } from "../../prisma.js"
import {
  pubsub,
  // AIRLINE_CREATED,
  // AIRLINE_UPDATED,
  COMPANY_CHANGED,
  // MESSAGE_SENT,
  // HOTEL_CREATED,
  // HOTEL_UPDATED,
  PRICECATEGORY_CHANGED,
  // REPORT_CREATED,
  // REQUEST_CREATED,
  // REQUEST_UPDATED,
  // RESERVE_CREATED,
  // RESERVE_HOTEL,
  // RESERVE_UPDATED,
  // RESERVE_PERSONS,
  // USER_CREATED,
  NOTIFICATION
} from "../../exports/pubsub.js"
import {
  allMiddleware,
  superAdminMiddleware
} from "../../middlewares/authMiddleware.js"
import { GraphQLError } from "graphql"

const dispatcherResolver = {
  Query: {
    getAllCompany: async (_, {}, context) => {
      await allMiddleware(context)

      return await prisma.company.findMany({
        include: {
          priceCategory: true
        }
      })
    },
    getCompany: async (_, { id }, context) => {
      await allMiddleware(context)

      const company = await prisma.company.findUnique({
        where: { id },
        include: {
          priceCategory: true
        }
      })

      if (!company) {
        throw new GraphQLError("Компания не найдена", {
          extensions: { code: "NOT_FOUND" }
        })
      }

      return company
    },
    // getAllPriceCategory: async (_, {}, context) => {
    //   await allMiddleware(context)
    //   return await prisma.priceCategory.findMany({
    //     include: {
    //       airline: true,
    //       hotel: true,
    //       company: true,
    //       airlinePrices: true
    //     }
    //   })
    // },
    getAllPriceCategory: async (_, { filter }, context) => {
      await allMiddleware(context)

      const { companyId, airlineId, hotelId } = filter || {}

      const where = {
        ...(companyId && { companyId }),
        ...(airlineId && { airlineId }),
        ...(hotelId && { hotelId })
      }

      return await prisma.priceCategory.findMany({
        where,
        include: {
          airline: true,
          hotel: true,
          company: true,
          airlinePrices: true
        }
      })
    },
    getPriceCategory: async (_, { id }, context) => {
      await allMiddleware(context)
      return await prisma.priceCategory.findUnique({
        where: { id },
        include: {
          airline: true,
          hotel: true,
          company: true,
          airlinePrices: true
        }
      })
    },
    getAllNotifications: async (_, { pagination }, context) => {
      await allMiddleware(context)
      const { user } = context
      const { skip, take, type, status } = pagination
      let filter
      if (user.dispatcher === true) {
        filter = {}
      }
      if (user.airlineId) {
        filter = { airlineId: user.airlineId }
      }
      if (user.hotelId) {
        filter = { hotelId: user.hotelId }
      }

      if (type === "request") {
        filter.requestId = { not: null }
        // console.log("filter: " + JSON.stringify(filter))
      } else if (type === "reserve") {
        filter.reserveId = { not: null }
        // console.log("filter: " + JSON.stringify(filter))
      }

      // console.log("\n filter" + JSON.stringify(filter), "\n filter" + filter)

      // const statusFilter =
      //   status && status.length > 0 && !status.includes("all")
      //     ? { status: { in: status } }
      //     : {}

      const totalCount = await prisma.notification.count({
        where: {
          ...filter
        }
      })

      const totalPages = Math.ceil(totalCount / take)

      const notifications = await prisma.notification.findMany({
        where: {
          ...filter
        },
        skip: skip * take,
        take: take,
        orderBy: { createdAt: "desc" },
        include: {
          request: true,
          reserve: true
        }
      })
      return { totalPages, totalCount, notifications }
    },
    getAllPositions: async (_, {}, context) => {
      await allMiddleware(context)
      return await prisma.position.findMany({})
    },
    getAirlinePositions: async (_, {}, context) => {
      await allMiddleware(context)
      return await prisma.position.findMany({ where: { separator: "airline" } })
    },
    getAirlineUserPositions: async (_, {}, context) => {
      await allMiddleware(context)
      return await prisma.position.findMany({
        where: { separator: "airlineUser" }
      })
    },
    getHotelPositions: async (_, {}, context) => {
      await allMiddleware(context)
      return await prisma.position.findMany({ where: { separator: "hotel" } })
    },
    getDispatcherPositions: async (_, {}, context) => {
      await allMiddleware(context)
      return await prisma.position.findMany({
        where: { separator: "dispatcher" }
      })
    },
    getPosition: async (_, { id }, context) => {
      await allMiddleware(context)
      return await prisma.position.findUnique({ where: { id } })
    }
  },
  Mutation: {
    createCompany: async (_, { input }, context) => {
      await allMiddleware(context)
      const company = await prisma.company.create({
        data: { ...input }
      })
      pubsub.publish(COMPANY_CHANGED, {
        companyChanged: company
      })
      return company
    },
    updateCompany: async (_, { input }, context) => {
      await allMiddleware(context)
      const { id, ...data } = input // Убираем id из data
      const company = await prisma.company.update({
        where: { id },
        data: { ...data } // Передаём только те данные, которые нужно обновить
      })
      pubsub.publish(COMPANY_CHANGED, {
        companyChanged: company
      })
      return company
    },
    createPriceCategory: async (_, { input }, context) => {
      await allMiddleware(context)

      const data = {
        airlineId: input.airlineId || undefined,
        hotelId: input.hotelId || undefined,
        companyId: input.companyId || undefined,
        name: input.name,

        ...(input.airlinePrices?.length
          ? {
              airlinePrices: {
                connect: input.airlinePrices.map((id) => ({ id }))
              }
            }
          : {})
      }

      const priceCategory = await prisma.priceCategory.create({
        data,
        include: {
          airline: true,
          hotel: true,
          company: true,
          airlinePrices: true
        }
      })

      pubsub.publish(PRICECATEGORY_CHANGED, {
        priceCategoryChanged: priceCategory
      })

      return priceCategory
    },
    updatePriceCategory: async (_, { input }, context) => {
      await allMiddleware(context)

      const { id, airlineId, hotelId, companyId, name, airlinePrices } = input

      // Формируем объект `data` динамически
      const data = {
        ...(airlineId !== undefined && { airlineId }),
        ...(hotelId !== undefined && { hotelId }),
        ...(companyId !== undefined && { companyId }),
        ...(name !== undefined && { name }),

        // Обработка airlinePrices
        ...(airlinePrices !== undefined && {
          airlinePrices: airlinePrices.length
            ? {
                connect: airlinePrices.map((id) => ({ id })) // подключаем новые
              }
            : {} // Если массив пустой, не обновляем старые связи
        })
      }

      // Если airlinePrices не передан, удаляем это поле из update
      if (airlinePrices === undefined) {
        delete data.airlinePrices
      }

      const priceCategory = await prisma.priceCategory.update({
        where: { id },
        data,
        include: {
          airline: true,
          hotel: true,
          company: true,
          airlinePrices: true
        }
      })

      pubsub.publish(PRICECATEGORY_CHANGED, {
        priceCategoryChanged: priceCategory
      })

      return priceCategory
    },
    createPosition: async (_, { input }, context) => {
      await allMiddleware(context)
      const { name, separator } = input
      const position = await prisma.position.create({
        data: {
          name,
          separator,
          category
        }
      })
      return position
    },
    updatePosition: async (_, { input }, context) => {
      await allMiddleware(context)
      const { name } = input
      const position = await prisma.position.update({
        where: { id: input.id },
        data: {
          name,
          category
        }
      })
      return position
    }
    // allDataUpdate: async (_, {}, context) => {
    //   await superAdminMiddleware(context)
    //   await prisma.airline.updateMany({
    //     data: { active: true }
    //   })
    //   await prisma.hotel.updateMany({
    //     data: { active: true }
    //   })
    //   await prisma.user.updateMany({
    //     data: { active: true }
    //   })
    //   await prisma.airlinePersonal.updateMany({
    //     data: { active: true }
    //   })
    //   await prisma.airlineDepartment.updateMany({
    //     data: { active: true }
    //   })
    // }
  },
  Subscription: {
    notification: {
      subscribe: () => pubsub.asyncIterator([NOTIFICATION])
    },
    companyChanged: {
      subscribe: () => pubsub.asyncIterator([COMPANY_CHANGED])
    },
    priceCategoryChanged: {
      subscribe: () => pubsub.asyncIterator([PRICECATEGORY_CHANGED])
    }
  },
  PriceCategory: {
    airlinePrices: async (parent) => {
      return await prisma.airlinePrice.findMany({
        where: { airlinePriceCategoryId: parent.id },
        include: {
          airports: {
            include: { airport: true }
          }
        }
      })
    }
  }
}

export default dispatcherResolver

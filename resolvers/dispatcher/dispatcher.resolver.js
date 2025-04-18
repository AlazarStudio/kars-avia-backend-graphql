import { prisma } from "../../prisma.js"
import {
  pubsub,
  // AIRLINE_CREATED,
  // AIRLINE_UPDATED,
  // MESSAGE_SENT,
  // HOTEL_CREATED,
  // HOTEL_UPDATED,
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
import { superAdminMiddleware } from "../../middlewares/authMiddleware.js"

const dispatcherResolver = {
  Query: {
    getAllNotifications: async (_, { pagination }, context) => {
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
      const positions = await prisma.position.findMany({})
      return positions
    },
    getPosition: async (_, { id }, context) => {
      const position = await prisma.position.findUnique({ where: { id } })
      return position
    }
  },
  Mutation: {
    createPosition: async (_, { input }, context) => {
      const { name, dispatcher } = input
      const position = await prisma.position.create({
        data: {
          name,
          dispatcher
        }
      })
      return position
    },
    updatePosition: async (_, { input }, context) => {
      const { name, dispatcher } = input
      const position = await prisma.position.update({
        where: { id: pos.id },
        data: {
          name,
          dispatcher
        }
      })
      return position
    }
    // allDataUpdate: async (_, {}, context) => {
    //   superAdminMiddleware(context)
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
    }
  }
}

export default dispatcherResolver

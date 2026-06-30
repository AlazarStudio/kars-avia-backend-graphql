import {
  allMiddleware,
  superAdminMiddleware
} from "../../middlewares/authMiddleware.js"
import {
  MAINTENANCE_BANNER_UPDATED,
  SYSTEM_UPDATE_PUBLISHED,
  pubsub
} from "../../services/infra/pubsub.js"
import {
  getMaintenanceBanner,
  updateMaintenanceBanner
} from "../../services/site/maintenanceBanner.js"
import {
  getSystemUpdate,
  markSystemUpdateSeen,
  resolveSystemUpdateFromRecord,
  updateSystemUpdate
} from "../../services/site/systemUpdate.js"

const siteResolver = {
  Query: {
    maintenanceBanner: async () => getMaintenanceBanner(),
    systemUpdate: async (_, __, context) => getSystemUpdate(context)
  },

  Mutation: {
    updateMaintenanceBanner: async (_, { input }, context) => {
      await superAdminMiddleware(context)
      const result = await updateMaintenanceBanner(input)
      pubsub.publish(MAINTENANCE_BANNER_UPDATED, {
        maintenanceBannerUpdated: result
      })
      return result
    },
    updateSystemUpdate: async (_, { input }, context) => {
      await superAdminMiddleware(context)
      const record = await updateSystemUpdate(input)
      pubsub.publish(SYSTEM_UPDATE_PUBLISHED, {
        systemUpdatePublished: { record }
      })
      return resolveSystemUpdateFromRecord(record, context)
    },
    markSystemUpdateSeen: async (_, __, context) => {
      await allMiddleware(context)
      return markSystemUpdateSeen(context)
    }
  },

  Subscription: {
    maintenanceBannerUpdated: {
      subscribe: () => pubsub.asyncIterator([MAINTENANCE_BANNER_UPDATED])
    },
    systemUpdatePublished: {
      subscribe: () => pubsub.asyncIterator([SYSTEM_UPDATE_PUBLISHED]),
      resolve: (payload, _, context) =>
        resolveSystemUpdateFromRecord(payload.record, context)
    }
  }
}

export default siteResolver

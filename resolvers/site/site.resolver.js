import { superAdminMiddleware } from "../../middlewares/authMiddleware.js"
import {
  MAINTENANCE_BANNER_UPDATED,
  pubsub
} from "../../services/infra/pubsub.js"
import {
  getMaintenanceBanner,
  updateMaintenanceBanner
} from "../../services/site/maintenanceBanner.js"

const siteResolver = {
  Query: {
    maintenanceBanner: async () => getMaintenanceBanner()
  },

  Mutation: {
    updateMaintenanceBanner: async (_, { input }, context) => {
      await superAdminMiddleware(context)
      const result = await updateMaintenanceBanner(input)
      pubsub.publish(MAINTENANCE_BANNER_UPDATED, {
        maintenanceBannerUpdated: result
      })
      return result
    }
  },

  Subscription: {
    maintenanceBannerUpdated: {
      subscribe: () => pubsub.asyncIterator([MAINTENANCE_BANNER_UPDATED])
    }
  }
}

export default siteResolver

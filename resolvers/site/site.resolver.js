import { superAdminMiddleware } from "../../middlewares/authMiddleware.js"
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
      return updateMaintenanceBanner(input)
    }
  }
}

export default siteResolver

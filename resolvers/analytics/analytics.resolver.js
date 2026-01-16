import {
  analyticsUserRequests,
  buildWhereConditionsRequests,
  countRequestsByStatus,
  createdByPeriodForEntityRequests,
  totalCancelledRequests,
  totalCreatedRequests
} from "../../services/analytics/analyticsRequests.js"
import { getPersonStaySummaries } from "../../services/analytics/personStaySummary.js"

const analyticsResolver = {
  Query: {
    analyticsEntityRequests: async (_, { input }, context) => {
      const { startDate, endDate, filters } = input

      // Формируем условия фильтрации
      const whereConditions = buildWhereConditionsRequests(
        filters,
        startDate,
        endDate
      )

      const createdByPeriodData = await createdByPeriodForEntityRequests(
        whereConditions,
        startDate,
        endDate
      )
      const totalCreatedRequestsCount = await totalCreatedRequests(
        whereConditions,
        startDate,
        endDate
      )
      const totalCancelledRequestsCount = await totalCancelledRequests(
        whereConditions,
        startDate,
        endDate
      )

      const statusCounts = await countRequestsByStatus(whereConditions)

      // const statusCountsArray = Object.entries(statusCounts).map(
      //   ([status, count]) => ({ status, count })
      // )

      return {
        createdByPeriod: createdByPeriodData,
        totalCreatedRequests: totalCreatedRequestsCount,
        totalCancelledRequests: totalCancelledRequestsCount,
        statusCounts
      }
    },
    analyticsEntityUsers: async (_, { input }) => {
      const { filters, startDate, endDate } = input

      if (!filters?.personId) {
        throw new Error("personId обязателен для аналитики пользователей")
      }

      const result = await analyticsUserRequests({
        personId: filters.personId,
        filters,
        startDate,
        endDate
      })

      return result
    },
    analyticsPersonStaySummary: async (_, { input }) => {
      const { filters, startDate, endDate } = input
      return await getPersonStaySummaries({ filters, startDate, endDate })
    }
  }
}

;("created")
;("opened")
;("done")
;("reduced")
;("extended")
;("transferred")
;("archiving")
;("archived")
;("canceled")

export default analyticsResolver

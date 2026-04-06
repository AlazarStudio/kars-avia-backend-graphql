import {
  analyticsUserRequests,
  buildWhereConditionsRequests,
  countRequestsByStatus,
  createdByPeriodForEntityRequests,
  totalCancelledRequests,
  totalCreatedRequests
} from "../../services/analytics/analyticsRequests.js"
import { getPersonStaySummaries } from "../../services/analytics/personStaySummary.js"
import { buildUserTimeAnalytics } from "../../services/analytics/userTimeAnalytics.js"
import { analyticsAirlineServiceComparison } from "../../services/analytics/airlineServiceComparison.js"
import { analyticsDispatchersPerformance } from "../../services/analytics/dispatchersPerformance.js"
import { computeAirlineAnalytics } from "../../services/analytics/airlineAnalytics.js"
import { prisma } from "../../prisma.js"
import {
  allMiddleware,
  dispatcherOrSuperAdminMiddleware
} from "../../middlewares/authMiddleware.js"

const analyticsResolver = {
  Query: {
    analyticsEntityRequests: async (_, { input }, context) => {
      await allMiddleware(context) // MIDDLEWARE_REVIEW: allMiddleware
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
    analyticsEntityUsers: async (_, { input }, context) => {
      await allMiddleware(context) // MIDDLEWARE_REVIEW: allMiddleware
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
    analyticsPersonStaySummary: async (_, { input }, context) => {
      await allMiddleware(context) // MIDDLEWARE_REVIEW: allMiddleware
      const { filters, startDate, endDate } = input
      return await getPersonStaySummaries({ filters, startDate, endDate })
    },
    analyticsUsersTime: async (_, { input }, context) => {
      await allMiddleware(context) // MIDDLEWARE_REVIEW: allMiddleware
      const requester = context?.user
      if (!requester) {
        throw new Error("Unauthorized")
      }

      const targetUserId = input?.userId || requester.id
      const canViewAll =
        requester.role === "SUPERADMIN" || requester.dispatcher === true

      if (!canViewAll && targetUserId !== requester.id) {
        throw new Error("Нет доступа к аналитике другого пользователя")
      }

      const targetUser = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: {
          id: true,
          totalTimeMinutes: true,
          dailyTimeStats: true
        }
      })

      if (!targetUser) {
        throw new Error("Пользователь не найден")
      }

      return buildUserTimeAnalytics({
        dailyTimeStats: targetUser.dailyTimeStats || [],
        totalTimeMinutes: targetUser.totalTimeMinutes || 0,
        period: input?.period || "WEEK",
        startDate: input?.startDate,
        endDate: input?.endDate
      })
    },
    analyticsAirlineServiceComparison: async (_, { input }, context) => {
      await allMiddleware(context) // MIDDLEWARE_REVIEW: allMiddleware
      return await analyticsAirlineServiceComparison(input)
    },
    analyticsDispatchersPerformance: async (_, { input }, context) => {
      await dispatcherOrSuperAdminMiddleware(context) // MIDDLEWARE_REVIEW: dispatcherOrSuperAdminMiddleware
      return await analyticsDispatchersPerformance(input)
    },
    airlineAnalytics: async (_, { input }, context) => {
      await allMiddleware(context)
      return await computeAirlineAnalytics(input)
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

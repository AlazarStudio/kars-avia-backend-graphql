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
import { prisma } from "../../prisma.js"

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
    },
    analyticsUsersTime: async (_, { input }, context) => {
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

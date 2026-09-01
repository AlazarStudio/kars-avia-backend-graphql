import { GraphQLError } from "graphql"
import { prisma } from "../../prisma.js"
import { loadEffectiveAccessMenuForUser } from "../access/loadEffectiveAccessMenuForUser.js"

export const isDispatcherUser = (user) =>
  user?.role === "SUPERADMIN" ||
  user?.role === "DISPATCHERADMIN" ||
  user?.dispatcher === true

export const isAirlineOrgUser = (user) =>
  Boolean(user?.airlineId) && !isDispatcherUser(user)

export function buildReportDraftsWhere(user, filter = {}) {
  const where = {}
  if (filter?.type) where.type = filter.type
  if (filter?.status) where.status = filter.status
  if (filter?.airlineId) where.airlineId = filter.airlineId
  if (filter?.hotelId) where.hotelId = filter.hotelId

  if (user?.role !== "SUPERADMIN" && user?.role !== "DISPATCHERADMIN") {
    if (user?.airlineId) {
      where.type = "AIRLINE"
      where.airlineId = user.airlineId
      if (isAirlineOrgUser(user)) {
        const requested = filter?.status
        if (requested === "DRAFT") {
          return { __empty: true }
        }
        if (requested === "SUBMITTED" || requested === "CONFIRMED") {
          where.status = requested
        } else {
          where.status = { in: ["SUBMITTED", "CONFIRMED"] }
        }
      }
    } else if (user?.hotelId) {
      where.type = "HOTEL"
      where.hotelId = user.hotelId
    }
  }

  return where
}

export async function assertCanDeleteSavedReport(context) {
  const user = context?.user || context?.subject
  if (!user) {
    throw new GraphQLError("Access denied", {
      extensions: { code: "FORBIDDEN" }
    })
  }
  if (user.role === "SUPERADMIN" || user.role === "DISPATCHERADMIN") return

  const menu = await loadEffectiveAccessMenuForUser(prisma, user)
  if (menu?.reportDelete === true) return

  throw new GraphQLError("Access denied", {
    extensions: { code: "FORBIDDEN" }
  })
}

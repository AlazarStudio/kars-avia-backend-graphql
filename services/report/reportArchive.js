import { GraphQLError } from "graphql"
import { prisma } from "../../prisma.js"
import { isPastArchiveThreshold, getArchiveThreshold } from "./reportDecade.js"

export const isArchivedReportFilter = (filter) => filter?.archived === true

export const isSavedReportArchived = (report, now = new Date()) =>
  report?.isArchived === true || isPastArchiveThreshold(report?.endDate, now)

export const appendSavedReportArchiveFilter = (filter, AND, now = new Date()) => {
  const threshold = getArchiveThreshold(now)
  if (isArchivedReportFilter(filter)) {
    AND.push({
      OR: [{ isArchived: true }, { endDate: { lt: threshold } }]
    })
    return
  }
  AND.push({ isArchived: { not: true } })
  AND.push({ endDate: { gte: threshold } })
}

export const buildAutoArchiveWhere = (now = new Date()) => ({
  isArchived: { not: true },
  endDate: { lt: getArchiveThreshold(now) }
})

const applyArchiveData = (userId) => ({
  isArchived: true,
  archivedAt: new Date(),
  archivedById: userId ?? null
})

const applyRestoreData = () => ({
  isArchived: false,
  archivedAt: null,
  archivedById: null
})

export const archiveSavedReport = async ({ id, userId, include } = {}) => {
  const report = await prisma.savedReport.findUnique({ where: { id } })
  if (!report) {
    throw new GraphQLError("Report not found", {
      extensions: { code: "NOT_FOUND" }
    })
  }
  if (report.isArchived) {
    throw new GraphQLError("Report is already archived", {
      extensions: { code: "BAD_USER_INPUT" }
    })
  }
  return prisma.savedReport.update({
    where: { id },
    data: applyArchiveData(userId),
    include
  })
}

export const restoreSavedReport = async ({ id, include } = {}) => {
  const report = await prisma.savedReport.findUnique({ where: { id } })
  if (!report) {
    throw new GraphQLError("Report not found", {
      extensions: { code: "NOT_FOUND" }
    })
  }
  if (!report.isArchived) {
    throw new GraphQLError("Report is not archived", {
      extensions: { code: "BAD_USER_INPUT" }
    })
  }
  return prisma.savedReport.update({
    where: { id },
    data: applyRestoreData(),
    include
  })
}

export const archiveSavedReportInternal = async ({ id }) => {
  const report = await prisma.savedReport.findUnique({ where: { id } })
  if (!report || report.isArchived) return null
  if (!isPastArchiveThreshold(report.endDate)) return null
  return prisma.savedReport.update({
    where: { id },
    data: applyArchiveData(null)
  })
}

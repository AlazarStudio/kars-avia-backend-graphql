import { prisma } from "../../prisma.js"
import path from "path"
import fs from "fs"
import { GraphQLError } from "graphql"
import {
  generateExcelAvia,
  generateExcelHotel
} from "../../services/report/exporter.js"
import {
  allMiddleware,
  adminMiddleware,
  airlineAdminMiddleware,
  hotelAdminMiddleware
} from "../../middlewares/authMiddleware.js"
import { pubsub, REPORT_CREATED } from "../../services/infra/pubsub.js"
import { subscriptionAuthMiddleware } from "../../services/infra/subscriptionAuth.js"
import { withFilter } from "graphql-subscriptions"
import { deleteFiles } from "../../services/files/uploadFiles.js"
import { applyFilters } from "../../services/report/reportUtils.js"
import {
  buildAirlineReportData,
  buildHotelReportData,
  normalizeReportDraftRows
} from "../../services/report/buildReportData.js"
import {
  listPartialDaySettings,
  upsertPartialDaySetting,
  deletePartialDaySetting
} from "../../services/report/partialDaySettings.js"
import { buildReportPresentation } from "../../services/report/reportPresentation.js"
import {
  appendSavedReportArchiveFilter,
  archiveSavedReport,
  isSavedReportArchived,
  restoreSavedReport
} from "../../services/report/reportArchive.js"
import {
  assertCanDeleteSavedReport,
  buildReportDraftsWhere,
  isAirlineOrgUser
} from "../../services/report/reportAccess.js"
import { notifyAirlineReportSubmitted } from "../../services/report/notifyReportSubmit.js"
import {
  buildLiveDraftRows,
  markDraftRowChanges,
  recreateDraftRows,
  snapshotComputedRows
} from "../../services/report/rebuildReportDraft.js"

const buildDraftPresentation = (draft) => {
  const snap = draft.filterJson || {}
  const rows = normalizeReportDraftRows(
    Array.isArray(draft.rows) ? draft.rows : []
  )
  return buildReportPresentation({
    type: draft.type,
    rows,
    companyData: {
      name: snap.companyName || "",
      nameFull: snap.companyNameFull || snap.companyName || "",
      city: snap.companyCity || "",
      contractName: snap.contractName || ""
    },
    createFilterInput: {
      meal: snap.meal !== false,
      living: snap.living !== false
    }
  })
}

const draftInclude = {
  airline: true,
  hotel: true,
  savedReport: true
}

const mapDraft = (draft) => {
  if (!draft) return null
  const rows = Array.isArray(draft.rows) ? draft.rows : []
  return {
    ...draft,
    rows,
    filterJson: draft.filterJson || null
  }
}

const assertDraftAccess = async (draft, context) => {
  if (!draft) throw new Error("Report draft not found")
  if (draft.type === "AIRLINE") {
    await airlineAdminMiddleware(context)
    const { user } = context
    if (
      user.role !== "SUPERADMIN" &&
      user.role !== "DISPATCHERADMIN" &&
      !user.dispatcher &&
      user.airlineId &&
      draft.airlineId !== user.airlineId
    ) {
      throw new Error("Access denied")
    }
    if (isAirlineOrgUser(user) && draft.status === "DRAFT") {
      throw new GraphQLError("Access denied", {
        extensions: { code: "FORBIDDEN" }
      })
    }
  } else {
    await hotelAdminMiddleware(context)
    const { user } = context
    if (
      user.role !== "SUPERADMIN" &&
      user.role !== "DISPATCHERADMIN" &&
      !user.dispatcher &&
      user.hotelId &&
      draft.hotelId !== user.hotelId
    ) {
      throw new Error("Access denied")
    }
  }
}

const assertSavedReportAccess = async (report, context) => {
  if (!report) {
    throw new GraphQLError("Report not found", {
      extensions: { code: "NOT_FOUND" }
    })
  }
  if (report.separator === "dispatcher") {
    await adminMiddleware(context)
  }
  if (report.separator === "airline") {
    await airlineAdminMiddleware(context)
  }
  if (report.separator === "hotel") {
    await hotelAdminMiddleware(context)
  }
}

const buildSavedReportListWhere = (filter, extra = {}) => {
  const AND = []
  const filters = applyFilters(filter)
  if (filters && Object.keys(filters).length) AND.push(filters)
  appendSavedReportArchiveFilter(filter, AND)
  if (extra.AND) AND.push(...(Array.isArray(extra.AND) ? extra.AND : [extra.AND]))
  const { AND: _ignored, ...rest } = extra
  return {
    ...rest,
    ...(AND.length ? { AND } : {})
  }
}

const writeExcelAndSave = async ({
  type,
  rows,
  companyData,
  createFilterInput,
  filter,
  format,
  separator,
  airlineId,
  hotelId
}) => {
  const filterStart = new Date(filter.startDate)
  const filterEnd = new Date(filter.endDate)
  const startDateStr = filterStart.toISOString().slice(0, 10)
  const endDateStr = filterEnd.toISOString().slice(0, 10)

  const reportName =
    type === "AIRLINE"
      ? `airline_report_${startDateStr}-${endDateStr}_${Date.now()}.${format}`
      : `hotel_report_${startDateStr}-${endDateStr}_${Date.now()}.${format}`
  const reportPath = path.resolve(`./reports/${reportName}`)
  fs.mkdirSync(path.dirname(reportPath), { recursive: true })

  if (format === "pdf") {
    throw new Error("PDF формат не реализован в данном примере")
  }
  if (format !== "xlsx") {
    throw new Error("Unsupported report format")
  }

  if (type === "AIRLINE") {
    await generateExcelAvia(rows, reportPath, companyData, createFilterInput)
  } else {
    await generateExcelHotel(rows, reportPath, companyData, createFilterInput)
  }

  const reportRecord = {
    name: reportName,
    url: `/files/reports/${reportName}`,
    startDate: filterStart,
    endDate: filterEnd,
    createdAt: new Date(),
    separator,
    ...(type === "AIRLINE" ? { airlineId } : { hotelId })
  }

  if (type === "AIRLINE" && !reportRecord.airlineId) {
    throw new Error("Airline ID is required for this report")
  }
  if (type === "HOTEL" && !reportRecord.hotelId) {
    throw new Error("Hotel ID is required for this report")
  }

  const savedReport = await prisma.savedReport.create({ data: reportRecord })
  pubsub.publish(REPORT_CREATED, { reportCreated: savedReport })
  return savedReport
}

const buildFilterSnapshot = (
  filter,
  createFilterInput,
  format,
  companyData
) => ({
  startDate: filter?.startDate || null,
  endDate: filter?.endDate || null,
  airlineId: filter?.airlineId || null,
  hotelId: filter?.hotelId || null,
  airportId: filter?.airportId || null,
  personId: filter?.personId || null,
  positionId: filter?.positionId || null,
  position: filter?.position || null,
  region: filter?.region || null,
  passengersReport: filter?.passengersReport || false,
  meal: createFilterInput?.meal !== false,
  living: createFilterInput?.living !== false,
  format: format || "xlsx",
  companyName: companyData?.name || "",
  companyNameFull: companyData?.nameFull || "",
  companyCity: companyData?.city || "",
  contractName: companyData?.contractName || ""
})

const reportResolver = {
  Query: {
    getAirlineReport: async (_, { filter }, context) => {
      const { user } = context
      await airlineAdminMiddleware(context)

      if (filter && filter.hotelId) {
        throw new Error("Cannot fetch hotel reports in getAirlineReport")
      }

      const separator = user.airlineId ? "airline" : "dispatcher"

      const reports = await prisma.savedReport.findMany({
        where: buildSavedReportListWhere(filter, {
          // separator,
          airlineId: { not: null },
          ...(filter && filter.airlineId
            ? { airlineId: filter.airlineId }
            : user.role === "SUPERADMIN" || user.role === "DISPATCHERADMIN"
              ? {}
              : { airlineId: user.airlineId })
        }),
        include: { airline: true },
        orderBy: { createdAt: "desc" }
      })

      const uniqueReports = []
      const seenIds = new Set()
      reports.forEach((report) => {
        if (!seenIds.has(report.id)) {
          seenIds.add(report.id)
          uniqueReports.push(report)
        }
      })

      return [
        {
          airlineId:
            (filter && filter.airlineId) ||
            (user.role === "SUPERADMIN" || user.role === "DISPATCHERADMIN"
              ? null
              : user.airlineId),
          reports: uniqueReports.map((report) => ({
            id: report.id,
            name: report.name,
            url: report.url,
            startDate: report.startDate,
            endDate: report.endDate,
            createdAt: report.createdAt,
            hotelId: report.hotelId,
            airlineId: report.airlineId,
            airline: report.airline,
            isArchived: report.isArchived
          }))
        }
      ]
    },

    getHotelReport: async (_, { filter }, context) => {
      const { user } = context
      await hotelAdminMiddleware(context)

      const separator = user.hotelId ? "hotel" : "dispatcher"

      const reports = await prisma.savedReport.findMany({
        where: buildSavedReportListWhere(filter, {
          separator,
          hotelId: { not: null },
          ...(filter.hotelId
            ? { hotelId: filter.hotelId }
            : user.role === "SUPERADMIN" || user.role === "DISPATCHERADMIN"
              ? {}
              : { hotelId: user.hotelId })
        }),
        include: { hotel: true },
        orderBy: { createdAt: "desc" }
      })

      const uniqueReports = []
      const seenIds = new Set()
      reports.forEach((report) => {
        if (!seenIds.has(report.id)) {
          seenIds.add(report.id)
          uniqueReports.push(report)
        }
      })

      return [
        {
          hotelId:
            filter.hotelId ||
            (user.role === "SUPERADMIN" || user.role === "DISPATCHERADMIN"
              ? null
              : user.hotelId),
          reports: uniqueReports.map((report) => ({
            id: report.id,
            name: report.name,
            url: report.url,
            startDate: report.startDate,
            endDate: report.endDate,
            createdAt: report.createdAt,
            hotelId: report.hotelId,
            airlineId: report.airlineId,
            hotel: report.hotel,
            isArchived: report.isArchived
          }))
        }
      ]
    },

    reportPartialDaySettings: async (
      _,
      { level, airlineId, hotelId },
      context
    ) => {
      await adminMiddleware(context)
      return listPartialDaySettings({ level, airlineId, hotelId })
    },

    reportDraft: async (_, { id }, context) => {
      const draft = await prisma.reportDraft.findUnique({
        where: { id },
        include: draftInclude
      })
      await assertDraftAccess(draft, context)
      return mapDraft(draft)
    },

    reportDrafts: async (_, { filter }, context) => {
      const { user } = context
      await allMiddleware(context)

      const where = buildReportDraftsWhere(user, filter)
      if (where.__empty) return []

      const drafts = await prisma.reportDraft.findMany({
        where,
        include: draftInclude,
        orderBy: { updatedAt: "desc" }
      })
      return drafts.map(mapDraft)
    }
  },

  Mutation: {
    createAirlineReport: async (_, { input, createFilterInput }, context) => {
      const { user } = context
      await airlineAdminMiddleware(context)
      const { filter, format } = input
      const separator = user.airlineId ? "airline" : "dispatcher"

      if (!user) throw new Error("Access denied")

      const airlineId =
        user.role === "AIRLINEADMIN" ? user.airlineId : filter.airlineId
      const effectiveFilter = { ...filter, airlineId }

      const { rows, companyData } =
        await buildAirlineReportData(effectiveFilter)

      return writeExcelAndSave({
        type: "AIRLINE",
        rows,
        companyData,
        createFilterInput,
        filter: effectiveFilter,
        format,
        separator,
        airlineId
      })
    },

    createHotelReport: async (_, { input, createFilterInput }, context) => {
      const { user } = context
      await hotelAdminMiddleware(context)
      const { filter, format } = input
      const separator = user.hotelId ? "hotel" : "dispatcher"

      if (!user) throw new Error("Access denied")

      const hotelId = user.role === "HOTELADMIN" ? user.hotelId : filter.hotelId
      const effectiveFilter = { ...filter, hotelId }

      const { rows, companyData } = await buildHotelReportData(effectiveFilter)

      return writeExcelAndSave({
        type: "HOTEL",
        rows,
        companyData,
        createFilterInput,
        filter: effectiveFilter,
        format,
        separator,
        hotelId
      })
    },

    deleteReport: async (_, { id }, context) => {
      const report = await prisma.savedReport.findUnique({
        where: { id },
        include: { airline: true, hotel: true }
      })
      await assertSavedReportAccess(report, context)
      await assertCanDeleteSavedReport(context)
      if (report.url) {
        await deleteFiles(report.url)
      }
      await prisma.savedReport.delete({ where: { id } })
      pubsub.publish(REPORT_CREATED, { reportCreated: report })
      return report
    },

    archiveReport: async (_, { id }, context) => {
      const report = await prisma.savedReport.findUnique({
        where: { id },
        include: { airline: true, hotel: true }
      })
      await assertSavedReportAccess(report, context)
      return archiveSavedReport({
        id,
        userId: context.user?.id,
        include: { airline: true, hotel: true }
      })
    },

    restoreReport: async (_, { id }, context) => {
      const report = await prisma.savedReport.findUnique({
        where: { id },
        include: { airline: true, hotel: true }
      })
      await assertSavedReportAccess(report, context)
      return restoreSavedReport({
        id,
        include: { airline: true, hotel: true }
      })
    },

    upsertReportPartialDaySetting: async (_, { input }, context) => {
      await adminMiddleware(context)
      return upsertPartialDaySetting(input)
    },

    deleteReportPartialDaySetting: async (_, { id }, context) => {
      await adminMiddleware(context)
      return deletePartialDaySetting(id)
    },

    createAirlineReportDraft: async (
      _,
      { input, createFilterInput },
      context
    ) => {
      const { user } = context
      await airlineAdminMiddleware(context)
      const { filter, format } = input

      const airlineId =
        user.role === "AIRLINEADMIN" ? user.airlineId : filter.airlineId
      if (!airlineId) throw new Error("Airline ID is required for this report")
      const effectiveFilter = { ...filter, airlineId }

      const { rows, filterStart, filterEnd, companyData } =
        await buildAirlineReportData(effectiveFilter)
      const normalizedRows = normalizeReportDraftRows(rows)

      const draft = await prisma.reportDraft.create({
        data: {
          type: "AIRLINE",
          status: "DRAFT",
          airlineId,
          startDate: filterStart,
          endDate: filterEnd,
          filterJson: buildFilterSnapshot(
            effectiveFilter,
            createFilterInput,
            format,
            companyData
          ),
          rows: normalizedRows,
          computedRows: snapshotComputedRows(normalizedRows),
          createdById: user.id
        },
        include: draftInclude
      })
      return mapDraft(draft)
    },

    createHotelReportDraft: async (
      _,
      { input, createFilterInput },
      context
    ) => {
      const { user } = context
      await hotelAdminMiddleware(context)
      const { filter, format } = input

      const hotelId = user.role === "HOTELADMIN" ? user.hotelId : filter.hotelId
      if (!hotelId) throw new Error("Hotel ID is required for this report")
      const effectiveFilter = { ...filter, hotelId }

      const { rows, filterStart, filterEnd, companyData } =
        await buildHotelReportData(effectiveFilter)
      const normalizedRows = normalizeReportDraftRows(rows)

      const draft = await prisma.reportDraft.create({
        data: {
          type: "HOTEL",
          status: "DRAFT",
          hotelId,
          startDate: filterStart,
          endDate: filterEnd,
          filterJson: buildFilterSnapshot(
            effectiveFilter,
            createFilterInput,
            format,
            companyData
          ),
          rows: normalizedRows,
          computedRows: snapshotComputedRows(normalizedRows),
          createdById: user.id
        },
        include: draftInclude
      })
      return mapDraft(draft)
    },

    updateReportDraft: async (_, { id, rows }, context) => {
      const draft = await prisma.reportDraft.findUnique({ where: { id } })
      await assertDraftAccess(draft, context)
      if (draft.status !== "DRAFT") {
        throw new Error("Only DRAFT reports can be updated")
      }

      const computedRows =
        Array.isArray(draft.computedRows) && draft.computedRows.length
          ? draft.computedRows
          : snapshotComputedRows(await buildLiveDraftRows(draft))
      const nextRows = markDraftRowChanges(computedRows, rows)

      const updated = await prisma.reportDraft.update({
        where: { id },
        data: {
          rows: nextRows,
          ...(!draft.computedRows ? { computedRows } : {})
        },
        include: draftInclude
      })
      return mapDraft(updated)
    },

    recreateReportDraft: async (_, { id }, context) => {
      const draft = await prisma.reportDraft.findUnique({
        where: { id },
        include: draftInclude
      })
      await assertDraftAccess(draft, context)
      if (draft.status !== "DRAFT") {
        throw new Error("Only DRAFT reports can be recreated")
      }

      const liveRows = await buildLiveDraftRows(draft)
      const merged = recreateDraftRows(liveRows, draft.rows)
      const updated = await prisma.reportDraft.update({
        where: { id },
        data: {
          rows: merged,
          computedRows: snapshotComputedRows(liveRows)
        },
        include: draftInclude
      })
      return mapDraft(updated)
    },

    submitAirlineReportDraft: async (_, { id }, context) => {
      await adminMiddleware(context)
      const draft = await prisma.reportDraft.findUnique({
        where: { id },
        include: draftInclude
      })
      if (!draft) throw new Error("Report draft not found")
      if (draft.type !== "AIRLINE") {
        throw new GraphQLError("Only airline reports can be submitted to AK", {
          extensions: { code: "BAD_USER_INPUT" }
        })
      }
      if (draft.status !== "DRAFT") {
        throw new GraphQLError("Only DRAFT reports can be submitted", {
          extensions: { code: "BAD_USER_INPUT" }
        })
      }

      const updated = await prisma.reportDraft.update({
        where: { id },
        data: { status: "SUBMITTED", submittedAt: new Date() },
        include: draftInclude
      })
      await notifyAirlineReportSubmitted(updated)
      return mapDraft(updated)
    },

    unsubmitAirlineReportDraft: async (_, { id }, context) => {
      await adminMiddleware(context)
      const draft = await prisma.reportDraft.findUnique({
        where: { id },
        include: draftInclude
      })
      if (!draft) throw new Error("Report draft not found")
      if (draft.type !== "AIRLINE") {
        throw new GraphQLError("Only airline reports can be unsubmitted", {
          extensions: { code: "BAD_USER_INPUT" }
        })
      }
      if (draft.status !== "SUBMITTED") {
        throw new GraphQLError("Only SUBMITTED reports can be unsubmitted", {
          extensions: { code: "BAD_USER_INPUT" }
        })
      }

      const updated = await prisma.reportDraft.update({
        where: { id },
        data: { status: "DRAFT", submittedAt: null },
        include: draftInclude
      })
      return mapDraft(updated)
    },

    confirmReportDraft: async (_, { id, format }, context) => {
      const draft = await prisma.reportDraft.findUnique({
        where: { id },
        include: draftInclude
      })
      await assertDraftAccess(draft, context)
      if (draft.type === "AIRLINE") {
        if (draft.status !== "SUBMITTED") {
          throw new GraphQLError(
            "Airline reports can only be confirmed after submit",
            { extensions: { code: "BAD_USER_INPUT" } }
          )
        }
      } else if (draft.status !== "DRAFT") {
        throw new Error("Only DRAFT reports can be confirmed")
      }

      const { user } = context
      const snap = draft.filterJson || {}
      const reportFormat = format || snap.format || "xlsx"
      const createFilterInput = {
        meal: snap.meal !== false,
        living: snap.living !== false
      }

      const companyData = {
        name: snap.companyName || "",
        nameFull: snap.companyNameFull || snap.companyName || "",
        city: snap.companyCity || "",
        contractName: snap.contractName || ""
      }

      const separator =
        draft.type === "AIRLINE"
          ? user.airlineId
            ? "airline"
            : "dispatcher"
          : user.hotelId
            ? "hotel"
            : "dispatcher"

      const rows = normalizeReportDraftRows(
        Array.isArray(draft.rows) ? draft.rows : []
      )

      const savedReport = await writeExcelAndSave({
        type: draft.type,
        rows,
        companyData,
        createFilterInput,
        filter: {
          startDate: draft.startDate,
          endDate: draft.endDate
        },
        format: reportFormat,
        separator,
        airlineId: draft.airlineId,
        hotelId: draft.hotelId
      })

      await prisma.reportDraft.update({
        where: { id },
        data: {
          status: "CONFIRMED",
          confirmedAt: new Date(),
          savedReportId: savedReport.id
        }
      })

      return savedReport
    },

    deleteReportDraft: async (_, { id }, context) => {
      const draft = await prisma.reportDraft.findUnique({ where: { id } })
      await assertDraftAccess(draft, context)
      await prisma.reportDraft.delete({ where: { id } })
      return true
    }
  },

  SavedReport: {
    archived: (parent) => isSavedReportArchived(parent)
  },

  ReportDraft: {
    rows: (parent) =>
      Array.isArray(parent.rows)
        ? normalizeReportDraftRows(parent.rows)
        : [],
    presentation: (parent) => buildDraftPresentation(parent)
  },

  Subscription: {
    reportCreated: {
      subscribe: withFilter(
        () => pubsub.asyncIterator([REPORT_CREATED]),
        async (payload, variables, context) => {
          if (
            !(await subscriptionAuthMiddleware(
              allMiddleware,
              context,
              "report.Subscription"
            ))
          ) {
            return false
          }
          const { subject, subjectType } = context

          if (!subject || subjectType !== "USER") return false

          if (subject.role === "SUPERADMIN" || subject.dispatcher === true) {
            return true
          }

          const report = payload.reportCreated
          if (subject.airlineId && report.airlineId === subject.airlineId) {
            return true
          }
          if (subject.hotelId && report.hotelId === subject.hotelId) {
            return true
          }

          return false
        }
      )
    }
  }
}

export default reportResolver

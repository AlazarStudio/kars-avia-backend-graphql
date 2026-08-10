import { prisma } from "../../prisma.js"
import path from "path"
import fs from "fs"
import {
  generateExcelAvia,
  generateExcelHotel
} from "../../services/report/exporter.js"
import {
  allMiddleware,
  adminMiddleware,
  airlineAdminMiddleware,
  hotelAdminMiddleware,
  superAdminMiddleware
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
        where: {
          separator,
          ...applyFilters(filter),
          airlineId: { not: null },
          ...(filter && filter.airlineId
            ? { airlineId: filter.airlineId }
            : user.role === "SUPERADMIN" || user.role === "DISPATCHERADMIN"
              ? {}
              : { airlineId: user.airlineId })
        },
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
            airline: report.airline
          }))
        }
      ]
    },

    getHotelReport: async (_, { filter }, context) => {
      const { user } = context
      await hotelAdminMiddleware(context)

      const separator = user.hotelId ? "hotel" : "dispatcher"

      const reports = await prisma.savedReport.findMany({
        where: {
          separator,
          ...applyFilters(filter),
          hotelId: { not: null },
          ...(filter.hotelId
            ? { hotelId: filter.hotelId }
            : user.role === "SUPERADMIN" || user.role === "DISPATCHERADMIN"
              ? {}
              : { hotelId: user.hotelId })
        },
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
            hotel: report.hotel
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

      const where = {}
      if (filter?.type) where.type = filter.type
      if (filter?.status) where.status = filter.status
      if (filter?.airlineId) where.airlineId = filter.airlineId
      if (filter?.hotelId) where.hotelId = filter.hotelId

      if (user.role !== "SUPERADMIN" && user.role !== "DISPATCHERADMIN") {
        if (user.airlineId) {
          where.type = "AIRLINE"
          where.airlineId = user.airlineId
        } else if (user.hotelId) {
          where.type = "HOTEL"
          where.hotelId = user.hotelId
        }
      }

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
      if (!report) {
        throw new Error("Report not found")
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
      if (report.url) {
        await deleteFiles(report.url)
      }
      await prisma.savedReport.delete({ where: { id } })
      pubsub.publish(REPORT_CREATED, { reportCreated: report })
      return report
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
          rows: normalizeReportDraftRows(rows),
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
          rows: normalizeReportDraftRows(rows),
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

      const updated = await prisma.reportDraft.update({
        where: { id },
        data: { rows: normalizeReportDraftRows(rows) },
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
      if (draft.status !== "DRAFT") {
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

  ReportDraft: {
    rows: (parent) =>
      Array.isArray(parent.rows) ? parent.rows : normalizeReportDraftRows([])
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

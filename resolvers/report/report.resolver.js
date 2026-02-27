import { prisma } from "../../prisma.js"
import {
  generateExcelAvia,
  generateExcelHotel
} from "../../services/report/exporter.js"
import path from "path"
import fs from "fs"
import {
  adminMiddleware,
  airlineAdminMiddleware,
  hotelAdminMiddleware
} from "../../middlewares/authMiddleware.js"
import { pubsub, REPORT_CREATED } from "../../services/infra/pubsub.js"
import { withFilter } from "graphql-subscriptions"
import { deleteFiles } from "../../services/files/uploadFiles.js"
import { computeRoomShareMatrix } from "../../services/rooms/computeRoomShareMatrix.js"
import {
  applyCreateFilters,
  applyFilters,
  buildAllocation,
  buildPositionWhere,
  aggregateRequestReports
} from "../../services/report/reportUtils.js"

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
      hotelAdminMiddleware(context)

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
    }
  },

  Mutation: {
    createAirlineReport: async (_, { input, createFilterInput }, context) => {
      const { user } = context
      await airlineAdminMiddleware(context)
      const { filter, format } = input
      const separator = user.airlineId ? "airline" : "dispatcher"

      if (!user) {
        throw new Error("Access denied")
      }

      const filterStart = new Date(filter.startDate)
      const filterEnd = new Date(filter.endDate)
      const startDateStr = filterStart.toISOString().slice(0, 10)
      const endDateStr = filterEnd.toISOString().slice(0, 10)

      let reportData
      let companyData
      let newReportData

      if (filter.passengersReport) {
        return (error = new Error(" \n passenger report not implemented! "))
      } else {
        const baseStatusWhere = {
          status: {
            in: [
              "done",
              "transferred",
              "extended",
              "archiving",
              "archived",
              "reduced"
            ]
          }
        }

        const where = {
          AND: [
            { ...applyCreateFilters(filter) },
            baseStatusWhere,
            buildPositionWhere(filter?.position)
          ]
        }

        const requests = await prisma.request.findMany({
          where,
          include: {
            person: { include: { position: true } },
            hotelChess: { include: { room: true } },
            hotel: true,
            airline: { include: { prices: { include: { airports: true } } } },
            mealPlan: true,
            airport: true
          },
          orderBy: { arrival: "asc" }
        })

        const company = await prisma.airline.findUnique({
          where: { id: filter.airlineId },
          include: { prices: { include: { airports: true } } }
        })

        const airlinePrices = company?.prices

        let airlinePriceId

        for (const contract of airlinePrices) {
          if (contract.airports && contract.airports.length > 0) {
            const match = contract.airports.find(
              (item) => item.airportId && item.airportId === filter.airportId
            )
            if (match) {
              airlinePriceId = contract.id
            }
          }
        }

        const contract = await prisma.airlinePrice.findUnique({
          where: { id: airlinePriceId }
        })
        const city = await prisma.airport.findUnique({
          where: { id: filter.airportId }
        })

        companyData = {
          name: company.name,
          nameFull: company.nameFull,
          city: city.city,
          contractName: contract.name
        }

        newReportData = []

        reportData = aggregateRequestReports(
          requests,
          "airline",
          filterStart,
          filterEnd
        )
      }

      // const { rows: finalRows } = computeRoomShareMatrix(reportData, {
      //   mode: "shared_equal", // равные доли
      //   serviceDayHour: 12,
      //   filterStart,
      //   filterEnd
      // })

      const new_report = buildAllocation(reportData, filterStart, filterEnd)

      const reportName = filter.passengersReport
        ? `passenger_report_${startDateStr}-${endDateStr}_${Date.now()}.${format}`
        : `airline_report_${startDateStr}-${endDateStr}_${Date.now()}.${format}`
      const reportPath = path.resolve(`./reports/${reportName}`)
      fs.mkdirSync(path.dirname(reportPath), { recursive: true })

      if (format === "pdf") {
        throw new Error("PDF формат не реализован в данном примере")
      } else if (format === "xlsx") {
        // await generateExcelAvia(reportData, reportPath)
        await generateExcelAvia(
          new_report,
          reportPath,
          companyData,
          createFilterInput
        )
        // await generateExcelAvia(finalRows, reportPath)
      } else {
        throw new Error("Unsupported report format")
      }

      const reportRecord = {
        name: reportName,
        url: `/files/reports/${reportName}`,
        startDate: new Date(filter.startDate),
        endDate: new Date(filter.endDate),
        createdAt: new Date(),
        airlineId:
          user.role === "AIRLINEADMIN" ? user.airlineId : filter.airlineId,
        separator: separator
      }

      if (!reportRecord.airlineId) {
        throw new Error("Airline ID is required for this report")
      }

      const savedReport = await prisma.savedReport.create({
        data: reportRecord
      })
      pubsub.publish(REPORT_CREATED, { reportCreated: savedReport })
      return savedReport
    },
    createHotelReport: async (_, { input, createFilterInput }, context) => {
      const { user } = context
      await hotelAdminMiddleware(context)
      const { filter, format } = input
      const separator = user.hotelId ? "hotel" : "dispatcher"

      if (!user) {
        throw new Error("Access denied")
      }

      const filterStart = new Date(filter.startDate)
      const filterEnd = new Date(filter.endDate)
      const startDateStr = filterStart.toISOString().slice(0, 10)
      const endDateStr = filterEnd.toISOString().slice(0, 10)

      let reportData
      if (filter.passengersReport) {
        return (error = new Error(" \n passenger report not implemented! "))
      } else {
        const baseStatusWhere = {
          status: {
            in: [
              "done",
              "transferred",
              "extended",
              "archiving",
              "archived",
              "reduced"
            ]
          }
        }

        const where = {
          AND: [
            { ...applyCreateFilters(filter) },
            baseStatusWhere,
            buildPositionWhere(filter?.position)
          ]
        }

        const requests = await prisma.request.findMany({
          where,
          include: {
            person: { include: { position: true } },
            hotelChess: { include: { room: { include: { roomKind: true } } } },
            hotel: true,
            airline: { include: { prices: { include: { airports: true } } } },
            mealPlan: true,
            airport: true
          },
          orderBy: { arrival: "asc" }
        })

        reportData = aggregateRequestReports(
          requests,
          "hotel",
          filterStart,
          filterEnd
        )
      }

      const hotel = await prisma.hotel.findUnique({
        where: { id: filter.hotelId }
      })

      const companyData = {
        name: hotel?.name || "",
        nameFull: hotel?.nameFull || hotel?.name || "",
        city: hotel?.city || "",
        contractName: hotel?.contractName || "" // если поля нет — оставим пустым
      }

      // const { rows: finalRows } = computeRoomShareMatrix(reportData, {
      //   mode: "shared_equal", // равные доли
      //   serviceDayHour: 12,
      //   filterStart,
      //   filterEnd
      // })

      const new_report = buildAllocation(reportData, filterStart, filterEnd)

      const reportName = filter.passengersReport
        ? `passenger_report_${startDateStr}-${endDateStr}_${Date.now()}.${format}`
        : `hotel_report_${startDateStr}-${endDateStr}_${Date.now()}.${format}`
      const reportPath = path.resolve(`./reports/${reportName}`)
      fs.mkdirSync(path.dirname(reportPath), { recursive: true })

      if (format === "pdf") {
        throw new Error("PDF формат не реализован в данном примере")
      } else if (format === "xlsx") {
        await generateExcelHotel(
          new_report,
          reportPath,
          companyData,
          createFilterInput
        )
      } else {
        throw new Error("Unsupported report format")
      }

      const reportRecord = {
        name: reportName,
        url: `/files/reports/${reportName}`,
        startDate: new Date(filter.startDate),
        endDate: new Date(filter.endDate),
        createdAt: new Date(),
        hotelId: user.role === "HOTELADMIN" ? user.hotelId : filter.hotelId,
        separator: separator
      }

      if (!reportRecord.hotelId) {
        throw new Error("Hotel ID is required for this report")
      }

      const savedReport = await prisma.savedReport.create({
        data: reportRecord
      })
      pubsub.publish(REPORT_CREATED, { reportCreated: savedReport })
      return savedReport
    },

    deleteReport: async (_, { id }, context) => {
      const { user } = context
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
        hotelAdminMiddleware(context)
      }
      if (report.url) {
        await deleteFiles(report.url)
      }
      await prisma.savedReport.delete({ where: { id } })
      pubsub.publish(REPORT_CREATED, { reportCreated: report })
      return report
    }
  },

  Subscription: {
    reportCreated: {
      subscribe: withFilter(
        () => pubsub.asyncIterator([REPORT_CREATED]),
        (payload, variables, context) => {
          const { subject, subjectType } = context

          if (!subject || subjectType !== "USER") return false

          // SUPERADMIN и диспетчеры видят все отчеты
          if (subject.role === "SUPERADMIN" || subject.dispatcher === true) {
            return true
          }

          // Пользователи видят только свои отчеты
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

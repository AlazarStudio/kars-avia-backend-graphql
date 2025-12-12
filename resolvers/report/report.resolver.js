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
import { deleteFiles } from "../../services/files/uploadFiles.js"
import { computeRoomShareMatrix } from "../../services/rooms/computeRoomShareMatrix.js"

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
        url: `/reports/${reportName}`,
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
        url: `/reports/${reportName}`,
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
      subscribe: () => pubsub.asyncIterator([REPORT_CREATED])
    }
  }
}

// Функции для формирования фильтров ---------------- ↓↓↓↓

const applyCreateFilters = (filter) => {
  const {
    startDate,
    endDate,
    archived,
    personId,
    hotelId,
    airlineId,
    airportId,
    positionId,
    //position Id`s,
    region
  } = filter
  const where = {}

  if (startDate || endDate) {
    where.OR = [
      {
        arrival: {
          gte: new Date(startDate),
          lte: new Date(endDate)
        }
      },
      {
        departure: {
          gte: new Date(startDate),
          lte: new Date(endDate)
        }
      },
      {
        AND: [
          { arrival: { lte: new Date(startDate) } },
          { departure: { gte: new Date(endDate) } }
        ]
      }
    ]
  }

  if (archived !== undefined) where.archived = archived
  if (personId) where.personId = personId
  if (hotelId) where.hotelId = hotelId
  if (airlineId) where.airlineId = airlineId
  if (airportId) where.airportId = airportId
  // position Id`s []
  if (positionId) {
    where.person = {
      positionId: positionId
    }
  }
  // if (region) {
  //   where.airport = {
  //     isNot: null,
  //     city: region
  //   }
  // }
  if (region && region.trim()) {
    const AND = []
    const s = region.trim()
    AND.push({
      OR: [
        { contractNumber: { contains: s, mode: "insensitive" } },
        { region: { contains: s, mode: "insensitive" } },
        { applicationType: { contains: s, mode: "insensitive" } },
        { notes: { contains: s, mode: "insensitive" } },
        { airline: { name: { contains: s, mode: "insensitive" } } },
        { company: { name: { contains: s, mode: "insensitive" } } }
      ]
    })
    where
  }

  return where
}

const applyFilters = (filter) => {
  if (filter == null || filter == undefined) {
    return
  }
  const {
    startDate,
    endDate,
    archived,
    personId,
    hotelId,
    airlineId,
    positionId,
    region
  } = filter

  const where = {}

  if (startDate)
    where.startDate = { gte: new Date(startDate), lte: new Date(endDate) }
  if (endDate)
    where.endDate = { gte: new Date(startDate), lte: new Date(endDate) }
  if (archived !== undefined) where.archived = archived
  if (personId) where.personId = personId
  if (hotelId) where.hotelId = hotelId
  if (airlineId) where.airlineId = airlineId
  if (positionId) where.positionId = positionId

  if (region) {
    where.airport = {
      isNot: null,
      city: region
    }
  }

  return where
}

const TECH_POS = ["Техник", "Инженер"]
const NOT_TECH_POS = [
  "КАЭ",
  "КВС",
  "ВП",
  "СБ",
  "ИПБ",
  "БП",
  "СА",
  "Директор",
  "Заместитель директора",
  "Нач. СБП",
  "Нач. ЛМО",
  "ЛД"
]

const buildPositionWhere = (position) => {
  const p = String(position || "all").toLowerCase()
  if (p === "squadron") {
    return { person: { position: { name: { notIn: TECH_POS } } } }
  }
  if (p === "technician") {
    return { person: { position: { name: { notIn: NOT_TECH_POS } } } }
  }
  return {} // all
}

// Функции для формирования фильтров ---------------- ↑↑↑↑

// Функции для подсчёта цен ---------------- ↓↓↓↓

const calculateLivingCost = (request, type, days) => {
  const roomCategory = request.roomCategory
  let pricePerDay = 0

  if (type === "airline") {
    pricePerDay = getAirlinePriceForCategory(request, roomCategory)
  } else if (type === "hotel") {
    const hotelPriceMapping = {
      studio: request.hotelChess[0]?.room?.price || 1,
      apartment: request.hotelChess[0]?.room?.price || 1,
      luxe: request.hotelChess[0]?.room?.roomKind?.price || 1,
      onePlace: request.hotelChess[0]?.room?.roomKind?.price || 1,
      twoPlace: request.hotelChess[0]?.room?.roomKind?.price || 1,
      threePlace: request.hotelChess[0]?.room?.roomKind?.price || 1,
      fourPlace: request.hotelChess[0]?.room?.roomKind?.price || 1,
      fivePlace: request.hotelChess[0]?.room?.roomKind?.price || 1,
      sixPlace: request.hotelChess[0]?.room?.roomKind?.price || 1,
      sevenPlace: request.hotelChess[0]?.room?.roomKind?.price || 1,
      eightPlace: request.hotelChess[0]?.room?.roomKind?.price || 1,
      ninePlace: request.hotelChess[0]?.room?.roomKind?.price || 1,
      tenPlace: request.hotelChess[0]?.room?.roomKind?.price || 1
    }
    pricePerDay = hotelPriceMapping[roomCategory] || 0
  }

  return days > 0 ? days * pricePerDay : 0
}

const getAirlinePriceForCategory = (request, category) => {
  const airportId = request.airport?.id

  const airlinePrices = request.airline?.prices
  for (const contract of airlinePrices) {
    if (contract.airports && contract.airports.length > 0) {
      const match = contract.airports.find(
        (item) => item.airportId && item.airportId === airportId
      )
      if (match) {
        switch (category) {
          case "studio":
            return contract.prices?.priceStudio || 0
          case "apartment":
            return contract.prices?.priceApartment || 0
          case "luxe":
            return contract.prices?.priceLuxe || 0
          case "onePlace":
            return contract.prices?.priceOneCategory || 0
          case "twoPlace":
            return contract.prices?.priceTwoCategory || 0
          case "threePlace":
            return contract.prices?.priceThreeCategory || 0
          case "fourPlace":
            return contract.prices?.priceFourCategory || 0
          case "fivePlace":
            return contract.prices?.priceFiveCategory || 0
          case "sixPlace":
            return contract.prices?.priceSixCategory || 0
          case "sevenPlace":
            return contract.prices?.priceSevenCategory || 0
          case "eightPlace":
            return contract.prices?.priceEightCategory || 0
          case "ninePlace":
            return contract.prices?.priceNineCategory || 0
          case "tenPlace":
            return contract.prices?.priceTenCategory || 0
          default:
            return 0
        }
      }
    }
  }
  return 0
}

const getAirlineMealPrice = (request) => {
  const airportId = request.airport?.id

  const airlinePrices = request.airline?.prices
  for (const contract of airlinePrices) {
    if (contract.airports && contract.airports.length > 0) {
      const match = contract.airports.find(
        (item) => item.airportId && item.airportId === airportId
      )
      if (match) {
        return contract.mealPrice
      }
    }
  }
  return 0
}

const calculateMealCostForReportDays = (
  request,
  reportType,
  effectiveDays,
  fullDays,
  mealPlan,
  startDate,
  endDate
) => {
  const start = toUTCDate(startDate)
  const end = toUTCDate(endDate)

  let breakfastCount = 0
  let lunchCount = 0
  let dinnerCount = 0

  mealPlan.dailyMeals.forEach((mealDay) => {
    const mealDate = toUTCDate(mealDay.date)

    // строго по календарным датам, без времени
    if (mealDate >= start && mealDate <= end) {
      breakfastCount += mealDay.breakfast ?? 0
      lunchCount += mealDay.lunch ?? 0
      dinnerCount += mealDay.dinner ?? 0
    }
  })

  const isNoMealCategory = ["apartment", "studio"].includes(
    request.roomCategory
  )
  if (isNoMealCategory) {
    breakfastCount = 0
    lunchCount = 0
    dinnerCount = 0
  }

  let mealPrices
  if (reportType === "airline") {
    mealPrices = getAirlineMealPrice(request)
  } else if (reportType === "hotel") {
    mealPrices = request.hotel?.mealPrice
  }

  const breakfastCost = breakfastCount * (mealPrices?.breakfast || 0)
  const lunchCost = lunchCount * (mealPrices?.lunch || 0)
  const dinnerCost = dinnerCount * (mealPrices?.dinner || 0)
  const totalMealCost = breakfastCost + lunchCost + dinnerCost

  return { totalMealCost, breakfastCount, lunchCount, dinnerCount }
}

// Функции для подсчёта цен ---------------- ↑↑↑↑

// Функции обработки дат ---------------- ↓↓↓↓

function parseAsLocal(input) {
  let year, monthIndex, day, hour, minute, second

  if (typeof input === "string") {
    const [y, m, d, h, min, s] = input
      .match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/)
      .slice(1)
      .map(Number)
    year = y
    monthIndex = m - 1
    day = d
    hour = h
    minute = min
    second = s
  } else if (input instanceof Date) {
    year = input.getUTCFullYear()
    monthIndex = input.getUTCMonth()
    day = input.getUTCDate()
    hour = input.getUTCHours()
    minute = input.getUTCMinutes()
    second = input.getUTCSeconds()
  } else {
    throw new TypeError("Ожидается строка ISO или Date")
  }

  return new Date(year, monthIndex, day, hour, minute, second)
}

const formatLocalDate = (date) => {
  const dd = String(date.getDate()).padStart(2, "0")
  const mm = String(date.getMonth() + 1).padStart(2, "0")
  const yyyy = date.getFullYear()
  const hh = String(date.getHours()).padStart(2, "0")
  const min = String(date.getMinutes()).padStart(2, "0")
  const ss = String(date.getSeconds()).padStart(2, "0")
  return `${dd}.${mm}.${yyyy} ${hh}:${min}:${ss}`
}

function formatDateToISO(dateInput) {
  const date = new Date(dateInput)

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0") // месяцы с 0
  const day = String(date.getDate()).padStart(2, "0")

  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")
  const seconds = String(date.getSeconds()).padStart(2, "0")

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`
}

// Функции обработки дат ---------------- ↑↑↑↑

// Функции агрегации заявок ---------------- ↓↓↓↓

const aggregateRequestReports = (
  requests,
  reportType,
  filterStart,
  filterEnd
) => {
  const filtered = requests.filter((r) => {
    const pos = r.person?.position?.name
    return pos !== null
  })

  filtered.sort((a, b) => {
    // Сортировка по отелю ---------------- ↓↓↓↓
    const hotelA = a.hotel?.name || ""
    const hotelB = b.hotel?.name || ""
    const hotelCmp = hotelA.localeCompare(hotelB, "ru")
    if (hotelCmp !== 0) return hotelCmp
    // Сортировка по отелю ---------------- ↑↑↑↑

    // Сортировка по категории номера ---------------- ↓↓↓↓
    const catOrder = [
      "studio",
      "apartment",
      "luxe",
      "onePlace",
      "twoPlace",
      "threePlace",
      "fourPlace",
      "fivePlace",
      "sixPlace",
      "sevenPlace",
      "eightPlace",
      "ninePlace",
      "tenPlace"
    ]
    const catA = catOrder.indexOf(a.roomCategory)
    const catB = catOrder.indexOf(b.roomCategory)
    if (catA !== catB) return catA - catB
    // Сортировка по категории номера ---------------- ↑↑↑↑

    // Сортировка по номеру и ID номера ---------------- ↓↓↓↓
    const roomNameA = a.roomName || ""
    const roomNameB = b.roomName || ""

    // Если roomName одинаков, сортируем по roomId
    if (roomNameA !== roomNameB) return roomNameA.localeCompare(roomNameB, "ru")

    const roomIdA = a.roomId || ""
    const roomIdB = b.roomId || ""

    if (roomIdA != roomIdB) return roomIdA.localeCompare(roomIdB, "ru")
    // Сортировка по номеру и ID номера ---------------- ↑↑↑↑

    // Сортировка по имени проживающего ---------------- ↓↓↓↓
    const nameA = a.person?.name || ""
    const nameB = b.person?.name || ""
    return nameA.localeCompare(nameB, "ru")
    // Сортировка по имени проживающего ---------------- ↑↑↑↑
  })

  return filtered.map((request, index) => {
    const hotelChess = request.hotelChess?.[0] || {}
    const rawIn = hotelChess.start
      ? parseAsLocal(hotelChess.start)
      : parseAsLocal(request.arrival)
    const rawOut = hotelChess.end
      ? parseAsLocal(hotelChess.end)
      : parseAsLocal(request.departure)

    const effectiveArrival = rawIn < filterStart ? filterStart : rawIn
    const effectiveDeparture = rawOut > filterEnd ? filterEnd : rawOut

    const categoryMapping = {
      studio: "Студия",
      apartment: "Апартаменты",
      luxe: "Люкс",
      onePlace: "Одноместный",
      twoPlace: "Двухместный",
      threePlace: "Трёхместный",
      fourPlace: "Четырёхместный",
      fivePlace: "Пятиместный",
      sixPlace: "Шестиместный",
      sevenPlace: "Семиместный",
      eightPlace: "Восьмиместный",
      ninePlace: "Девятиместный",
      tenPlace: "Десятиместный"
    }

    const fullDays = calculateTotalDays(effectiveArrival, effectiveDeparture)
    const effectiveDays = calculateEffectiveCostDaysWithPartial(
      formatDateToISO(effectiveArrival),
      formatDateToISO(effectiveDeparture),
      formatDateToISO(filterStart),
      formatDateToISO(filterEnd)
    )

    // const breakdown = calculateDaysBreakdown(
    //   rawIn,
    //   rawOut,
    //   filterStart,
    //   filterEnd
    // )

    const totalLivingCost = calculateLivingCost(
      request,
      reportType,
      effectiveDays
    )

    const { totalMealCost, breakfastCount, lunchCount, dinnerCount } =
      calculateMealCostForReportDays(
        request,
        reportType,
        effectiveDays,
        fullDays,
        request.mealPlan || {},
        effectiveArrival,
        effectiveDeparture
      )

    return {
      index: index + 1,
      id: request.id,
      hotelName: request.hotel?.name || "Не указано",
      arrival: formatLocalDate(effectiveArrival),
      departure: formatLocalDate(effectiveDeparture),
      totalDays: effectiveDays,
      category: categoryMapping[request.roomCategory] || request.roomCategory,
      personName: request.person?.name || "Не указано",
      personPosition: request.person?.position?.name || "Не указано",
      roomName: hotelChess.room?.name || "",
      roomId: hotelChess.room?.id || "",
      breakfastCount,
      lunchCount,
      dinnerCount,
      totalMealCost,
      totalLivingCost,
      totalDebt: totalLivingCost + totalMealCost
      // shareNote:
    }
  })
}

// Функции агрегации заявок ---------------- ↑↑↑↑

// Функции для подсчёта дней ---------------- ↓↓↓↓

const calculateTotalDays = (start, end) => {
  if (!start || !end) return 0
  const differenceInMilliseconds = new Date(end) - new Date(start)
  return Math.ceil(differenceInMilliseconds / (1000 * 60 * 60 * 24))
}

function calculateEffectiveCostDaysWithPartial(
  arrivalStr,
  departureStr,
  reportStart,
  reportEnd
) {
  // Парсим ISO (YYYY-MM-DDTHH:mm:ss.sssZ) и локальный "DD.MM.YYYY HH:mm[:ss]"
  const parseDateTime = (str) => {
    if (!str || typeof str !== "string") return null
    const s = str.trim()

    // ISO с T и необязательной Z/offset
    const iso = s.match(
      /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})?$/
    )
    if (iso) {
      const [, yyyy, MM, dd, hh, mm, ss = "0"] = iso
      return new Date(+yyyy, +MM - 1, +dd, +hh, +mm, +ss)
    }

    // DD.MM.YYYY HH:mm[:ss] или DD.MM.YYYYTHH:mm[:ss]
    const local = s.match(
      /^(\d{2})\.(\d{2})\.(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
    )
    if (local) {
      const [, dd, MM, yyyy, hh = "0", mm = "0", ss = "0"] = local
      return new Date(+yyyy, +MM - 1, +dd, +hh, +mm, +ss)
    }

    const d = new Date(s)
    return isNaN(d) ? null : d
  }

  const arrival = parseDateTime(arrivalStr)
  const departure = parseDateTime(departureStr)

  if (!arrival || !departure || isNaN(arrival) || isNaN(departure)) return 0

  // Считаем календарные дни между датами (без учёта времени)
  const arrivalYMD = new Date(
    arrival.getFullYear(),
    arrival.getMonth(),
    arrival.getDate()
  )
  const departureYMD = new Date(
    departure.getFullYear(),
    departure.getMonth(),
    departure.getDate()
  )
  const MS_PER_DAY = 1000 * 60 * 60 * 24
  const baseDays = Math.max(
    0,
    Math.floor((departureYMD - arrivalYMD) / MS_PER_DAY)
  )

  // Ранний заезд
  let arrivalAdjust = 0
  const arrivalMinutes = arrival.getHours() * 60 + arrival.getMinutes()

  if (arrival.getHours() === 0 && arrival.getMinutes() === 10) {
    // Спец-исключение: заезд ровно в 00:10 не считается ранним
    arrivalAdjust = 0
  } else if (arrivalMinutes < 6 * 60) {
    // До 06:00 → +1 день
    arrivalAdjust = 1
  } else if (arrivalMinutes < 14 * 60) {
    // 06:00–13:59 → +0.5 дня
    arrivalAdjust = 0.5
  }

  // Поздний выезд
  let departureAdjust = 0
  const departureMinutes = departure.getHours() * 60 + departure.getMinutes()

  // Особый случай: если выезд в 23:50, добавляем +1
  if (departure.getHours() === 23 && departure.getMinutes() === 50) {
    departureAdjust = 1
  } else if (departureMinutes >= 18 * 60) {
    // После 18:00 (включая 18:00) → +1
    departureAdjust = 1
  } else if (departureMinutes > 12 * 60) {
    // 12:01–17:59 → +0.5
    departureAdjust = 0.5
  }
  // Ровно 12:00 или до 12:00 → 0 (departureAdjust уже 0)

  // Итог: базовые сутки + поправки за ранний заезд и поздний выезд
  const total = baseDays + arrivalAdjust + departureAdjust
  return total < 0 ? 0 : total
}
// Функции для подсчёта дней ---------------- ↑↑↑↑

//  -----------------------------------------------------------------------------------------------------------------

// --- УТИЛИТЫ ДАТ (YMD) ---
const MS_PER_DAY = 86400000
const toUTCDate = (s) => {
  if (s instanceof Date)
    return new Date(Date.UTC(s.getFullYear(), s.getMonth(), s.getDate()))
  const str = String(s || "").trim()
  // DD.MM.YYYY [...]
  const m = str.match(/^(\d{2})\.(\d{2})\.(\d{4})/)
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]))
  // YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss
  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]))
  return new Date(NaN)
}
const fmtYMD = (d) => {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, "0")
  const da = String(d.getUTCDate()).padStart(2, "0")
  return `${y}-${m}-${da}`
}
const addDaysUTC = (d, n) => new Date(d.getTime() + n * MS_PER_DAY)
const eachDayInclusive = (startYMD, endYMD, cb) => {
  let d = toUTCDate(startYMD),
    stop = toUTCDate(endYMD)
  while (d.getTime() <= stop.getTime()) {
    cb(fmtYMD(d))
    d = addDaysUTC(d, 1)
  }
}
const fmtRu = (ymd) => {
  const [y, m, d] = ymd.split("-")
  return `${d}.${m}.${y}`
}
const parseNum = (v) => {
  if (v == null) return NaN
  if (typeof v === "number") return v
  const n = parseFloat(
    String(v)
      .replace(/[^\d.,\-]/g, "")
      .replace(",", ".")
  )
  return Number.isFinite(n) ? n : NaN
}

// --- ИСПРАВЛЕННОЕ СЕРДЦЕ: ВОЗВРАЩАЕТ МАССИВ ОБЪЕКТОВ ПО КОНТРАКТУ ---

function buildAllocation(data, rangeStart, rangeEnd) {
  if (!Array.isArray(data) || !data.length) return []

  // ---------------- helpers ----------------
  const parseLocalDT = (s) => {
    if (!s) return null
    const m = String(s).match(
      /^(\d{2})\.(\d{2})\.(\d{4})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/
    )
    if (!m) return null
    const [, dd, MM, yyyy, hh, mm, ss = "0"] = m
    return new Date(+yyyy, +MM - 1, +dd, +hh, +mm, +ss)
  }

  const formatLocal = (d) => {
    const pad = (n) => String(n).padStart(2, "0")
    return `${pad(d.getDate())}.${pad(
      d.getMonth() + 1
    )}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`
  }

  // ---------------- normalize ----------------
  const bookings = data.map((r) => ({
    ...r,
    arrivalTS: parseLocalDT(r.arrival),
    departureTS: parseLocalDT(r.departure)
  }))

  // ---------------- group by room ----------------
  const rooms = new Map()
  for (const b of bookings) {
    if (!rooms.has(b.roomId)) rooms.set(b.roomId, [])
    rooms.get(b.roomId).push(b)
  }

  const out = []
  let index = 1

  // ---------------- process each room ----------------
  for (const [, guests] of rooms.entries()) {
    // A = первый заехавший
    const A = guests.reduce((min, g) => (g.arrivalTS < min.arrivalTS ? g : min))

    // границы занятости номера
    const roomArrival = new Date(Math.min(...guests.map((g) => +g.arrivalTS)))
    const roomDeparture = new Date(
      Math.max(...guests.map((g) => +g.departureTS))
    )

    // количество суток занятости номера
    const roomDays = calculateEffectiveCostDaysWithPartial(
      formatLocal(roomArrival),
      formatLocal(roomDeparture),
      rangeStart,
      rangeEnd
    )

    // дневной тариф (берём от A)
    const dailyRate = A.totalDays > 0 ? A.totalLivingCost / A.totalDays : 0

    const roomLivingCost = Math.round(dailyRate * roomDays)

    // ---------- shareNote (кто с кем и когда) ----------
    const buildShareNote = (guest) => {
      const segments = []

      const sorted = guests
        .filter((g) => g !== guest)
        .sort((a, b) => a.arrivalTS - b.arrivalTS)

      for (const other of sorted) {
        const start = new Date(Math.max(+guest.arrivalTS, +other.arrivalTS))
        const end = new Date(Math.min(+guest.departureTS, +other.departureTS))

        if (start < end) {
          segments.push(
            `с ${formatLocal(start)} по ${formatLocal(end)} жил с ${
              other.personName
            }`
          )
        }
      }

      if (!segments.length) {
        return `с ${formatLocal(guest.arrivalTS)} по ${formatLocal(
          guest.departureTS
        )} жил один`
      }

      return segments.join(", ")
    }

    // ---------------- output rows ----------------
    for (const g of guests) {
      const isA = g === A

      const realDays = calculateEffectiveCostDaysWithPartial(
        formatLocal(g.arrivalTS),
        formatLocal(g.departureTS),
        rangeStart,
        rangeEnd
      )

      const shareNoteText = buildShareNote(g)

      const finalShareNote =
        isA && roomDays !== realDays
          ? `${shareNoteText} (оплата рассчитана за ${roomDays} суток)`
          : shareNoteText

      out.push({
        index: index++,
        arrival: g.arrival,
        departure: g.departure,
        // totalDays: isA ? roomDays : g.totalDays,
        totalDays: realDays,
        category: g.category,
        personName: g.personName,
        roomName: g.roomName,
        roomId: g.roomId,
        // shareNote: buildShareNote(g),
        shareNote: finalShareNote,
        personPosition: g.personPosition,
        breakfastCount: g.breakfastCount,
        lunchCount: g.lunchCount,
        dinnerCount: g.dinnerCount,
        totalMealCost: g.totalMealCost,
        totalLivingCost: isA ? roomLivingCost : 0,
        totalDebt: (isA ? roomLivingCost : 0) + g.totalMealCost,
        hotelName: g.hotelName
      })
    }
  }

  return out
}

//  -----------------------------------------------------------------------------------------------------------------

export default reportResolver

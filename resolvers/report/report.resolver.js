import { prisma } from "../../prisma.js"
import { generateExcelAvia } from "../../exports/exporter.js"
import path from "path"
import fs from "fs"
import {
  adminMiddleware,
  airlineAdminMiddleware,
  hotelAdminMiddleware
} from "../../middlewares/authMiddleware.js"
import { pubsub, REPORT_CREATED } from "../../exports/pubsub.js"
import { deleteFiles } from "../../exports/uploadFiles.js"

const reportResolver = {
  Query: {
    getAirlineReport: async (_, { filter }, context) => {
      const { user } = context
      airlineAdminMiddleware(context)

      if (filter.hotelId) {
        throw new Error("Cannot fetch hotel reports in getAirlineReport")
      }

      const separator = user.airlineId ? "airline" : "dispatcher"

      const reports = await prisma.savedReport.findMany({
        where: {
          separator,
          ...applyFilters(filter),
          airlineId: { not: null },
          ...(filter.airlineId
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
            filter.airlineId ||
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
    createAirlineReport: async (_, { input }, context) => {
      const { user } = context
      airlineAdminMiddleware(context)
      const { filter, format } = input

      if (!user) throw new Error("Access denied")

      const filterStart = new Date(filter.startDate)
      const filterEnd = new Date(filter.endDate)
      const startDateStr = filterStart.toISOString().slice(0, 10)
      const endDateStr = filterEnd.toISOString().slice(0, 10)

      // 1) Получаем данные авиакомпании разом
      const airlineData = await prisma.airline.findUnique({
        where: { id: user.airlineId },
        select: {
          id: true,
          name: true,
          prices: {
            select: {
              priceStudio: true,
              priceApartment: true,
              priceLuxe: true,
              priceOneCategory: true,
              priceTwoCategory: true,
              priceThreeCategory: true,
              priceFourCategory: true,
              priceFiveCategory: true,
              priceSixCategory: true,
              priceSevenCategory: true,
              priceEightCategory: true,
              priceNineCategory: true,
              priceTenCategory: true,
              airports: { select: { airportId: true } }
            }
          },
          mealPrice: true
        }
      })
      if (!airlineData) throw new Error("Airline not found")

      // 2) Получаем только необходимые поля заявок
      const requests = await prisma.request.findMany({
        where: {
          ...applyCreateFilters(filter),
          status: {
            in: [
              "done",
              "transferred",
              "extended",
              "archiving",
              "archived",
              "reduced"
            ]
          },
          person: { position: { name: { notIn: ["Техник", "Инженер"] } } }
        },
        select: {
          arrival: true,
          departure: true,
          roomCategory: true,
          person: {
            select: { name: true, position: { select: { name: true } } }
          },
          mealPlan: { select: { breakfast: true, lunch: true, dinner: true } },
          airport: { select: { id: true } },
          hotel: {
            select: {
              id: true,
              name: true,
              breakfast: true,
              lunch: true,
              dinner: true,
              mealPrice: true
            }
          },
          hotelChess: {
            select: {
              start: true,
              end: true,
              room: {
                select: {
                  name: true,
                  price: true,
                  roomKind: { select: { price: true } }
                }
              }
            }
          }
        },
        orderBy: { arrival: "asc" }
      })

      const reportData = aggregateRequestReports(
        requests,
        "airline",
        filterStart,
        filterEnd
      )

      const reportName = `airline_report_${startDateStr}-${endDateStr}_${Date.now()}.${format}`
      const reportPath = path.resolve(`./reports/${reportName}`)
      fs.mkdirSync(path.dirname(reportPath), { recursive: true })

      if (format === "xlsx") {
        await generateExcelAvia(reportData, reportPath)
      } else {
        throw new Error("Unsupported report format")
      }

      const savedReport = await prisma.savedReport.create({
        data: {
          name: reportName,
          url: `/reports/${reportName}`,
          startDate: filterStart,
          endDate: filterEnd,
          createdAt: new Date(),
          airlineId:
            user.role === "AIRLINEADMIN" ? user.airlineId : filter.airlineId,
          separator: user.airlineId ? "airline" : "dispatcher"
        }
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
      if (!report) throw new Error("Report not found")
      if (report.separator === "dispatcher") adminMiddleware(context)
      if (report.separator === "airline") airlineAdminMiddleware(context)
      if (report.separator === "hotel") hotelAdminMiddleware(context)
      if (report.url) await deleteFiles(report.url)
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

/* ================================= */
/* Функции для фильтров и утилиты */
/* ================================= */
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
    region
  } = filter
  const where = {}
  if (startDate || endDate) {
    where.OR = [
      { arrival: { gte: new Date(startDate), lte: new Date(endDate) } },
      { departure: { gte: new Date(startDate), lte: new Date(endDate) } },
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
  if (positionId) where.person = { positionId }
  if (region) where.airport = { isNot: null, city: region }
  return where
}

const applyFilters = (filter) => {
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
  if (startDate) where.createdAt = { gte: new Date(startDate) }
  if (endDate) where.createdAt = { lte: new Date(endDate) }
  if (archived !== undefined) where.archived = archived
  if (personId) where.personId = personId
  if (hotelId) where.hotelId = hotelId
  if (airlineId) where.airlineId = airlineId
  if (positionId) where.positionId = positionId
  if (region) where.airport = { isNot: null, city: region }
  return where
}

const getAirlinePriceForCategory = (request, category) => {
  const airportId = request.airport?.id
  for (const contract of request.requestedAirlinePrices || []) {
    const match = contract.airports?.find(
      (item) => item.airportId === airportId
    )
    if (match) {
      switch (category) {
        case "studio":
          return contract.priceStudio || 0
        case "apartment":
          return contract.priceApartment || 0
        case "luxe":
          return contract.priceLuxe || 0
        case "onePlace":
          return contract.priceOneCategory || 0
        case "twoPlace":
          return contract.priceTwoCategory || 0
        case "threePlace":
          return contract.priceThreeCategory || 0
        case "fourPlace":
          return contract.priceFourCategory || 0
        case "fivePlace":
          return contract.priceFiveCategory || 0
        case "sixPlace":
          return contract.priceSixCategory || 0
        case "sevenPlace":
          return contract.priceSevenCategory || 0
        case "eightPlace":
          return contract.priceEightCategory || 0
        case "ninePlace":
          return contract.priceNineCategory || 0
        case "tenPlace":
          return contract.priceTenCategory || 0
      }
    }
  }
  return 0
}

const getAirlineMealPrice = (request) => {
  const airportId = request.airport?.id
  for (const c of request.requestedAirlinePrices || []) {
    const match = c.airports?.find((i) => i.airportId === airportId)
    if (match) return c.mealPrice
  }
  return 0
}

const calculateTotalDays = (start, end) => {
  if (!start || !end) return 0
  return Math.ceil((new Date(end) - new Date(start)) / (1000 * 60 * 60 * 24))
}

const calculateEffectiveCostDaysWithPartial = (
  arrival,
  departure,
  filterStart,
  filterEnd
) => {
  const effArr = arrival < filterStart ? filterStart : arrival
  const effDep = departure > filterEnd ? filterEnd : departure
  if (effDep <= effArr) return 0
  const arrMid = new Date(
    effArr.getFullYear(),
    effArr.getMonth(),
    effArr.getDate()
  )
  const depMid = new Date(
    effDep.getFullYear(),
    effDep.getMonth(),
    effDep.getDate()
  )
  const dayDiff = Math.round((depMid - arrMid) / (1000 * 60 * 60 * 24))
  const hArr = effArr.getHours() + effArr.getMinutes() / 60
  let arrFactor = hArr < 6 ? 1 : hArr <= 14 ? 0.5 : 0
  const hDep = effDep.getHours() + effDep.getMinutes() / 60
  let depFactor = hDep < 12 ? 0 : hDep <= 18 ? 0.5 : 1
  if (dayDiff === 0) return Math.max(arrFactor, depFactor)
  return arrFactor + (dayDiff - 1) + depFactor
}

function parseAsLocal(input) {
  let y, m, d, h, min, s
  if (typeof input === "string") {
    ;[y, m, d, h, min, s] = input
      .match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/)
      .slice(1)
      .map(Number)
  } else {
    y = input.getUTCFullYear()
    m = input.getUTCMonth() + 1
    d = input.getUTCDate()
    h = input.getUTCHours()
    min = input.getUTCMinutes()
    s = input.getUTCSeconds()
  }
  return new Date(y, m - 1, d, h, min, s)
}

const formatLocalDate = (date) => {
  const dd = String(date.getDate()).padStart(2, "0")
  const mm = String(date.getMonth() + 1).padStart(2, "0")
  const yyyy = date.getFullYear()
  const hh = String(date.getHours()).padStart(2, "0")
  const mi = String(date.getMinutes()).padStart(2, "0")
  const ss = String(date.getSeconds()).padStart(2, "0")
  return `${dd}.${mm}.${yyyy} ${hh}:${mi}:${ss}`
}

const aggregateRequestReports = (
  requests,
  reportType,
  filterStart,
  filterEnd
) => {
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
  const filtered = requests.filter((r) => {
    const pos = r.person?.position?.name
    return pos != "Техник" && pos != "Инженер"
  })
  const categoryOrder = Object.keys(categoryMapping)
  filtered.sort((a, b) => {
    const hA = a.hotel?.name || "",
      hB = b.hotel?.name || ""
    const cmpH = hA.localeCompare(hB, "ru")
    if (cmpH) return cmpH
    const cA = categoryOrder.indexOf(a.roomCategory)
    const cB = categoryOrder.indexOf(b.roomCategory)
    if (cA !== cB) return cA - cB
    const nA = a.person?.name || "",
      nB = b.person?.name || ""
    return nA.localeCompare(nB, "ru")
  })

  return filtered.map((req, i) => {
    const hc = req.hotelChess?.[0] || {}
    const rawIn = hc.start ? parseAsLocal(hc.start) : parseAsLocal(req.arrival)
    const rawOut = hc.end ? parseAsLocal(hc.end) : parseAsLocal(req.departure)
    const effArr = rawIn < filterStart ? filterStart : rawIn
    const effDep = rawOut > filterEnd ? filterEnd : rawOut
    const days = calculateEffectiveCostDaysWithPartial(
      effArr,
      effDep,
      filterStart,
      filterEnd
    )
    const living = calculateLivingCost(req, reportType, days)
    const meal =
      reportType === "airline"
        ? getAirlineMealPrice(req)
        : req.hotel?.mealPrice || {}
    const fullDays = calculateTotalDays(effArr, effDep)
    let b = meal.breakfast || 0,
      l = meal.lunch || 0,
      d = meal.dinner || 0
    if (fullDays > 0 && days < fullDays) {
      const r = days / fullDays
      b = Math.round(b * r)
      l = Math.round(l * r)
      d = Math.round(d * r)
    }
    const totalMeal =
      b * (meal.breakfast || 0) + l * (meal.lunch || 0) + d * (meal.dinner || 0)
    return {
      index: i + 1,
      hotelName: req.hotel?.name || "Не указано",
      arrival: formatLocalDate(effArr),
      departure: formatLocalDate(effDep),
      totalDays: days,
      category: categoryMapping[req.roomCategory] || req.roomCategory,
      personName: req.person?.name || "Не указано",
      personPosition: req.person?.position?.name || "Не указано",
      roomName: hc.room?.name || "",
      breakfastCount: b,
      lunchCount: l,
      dinnerCount: d,
      totalMealCost: totalMeal,
      totalLivingCost: living,
      totalDebt: living + totalMeal
    }
  })
}

const calculateLivingCost = (request, type, days) => {
  if (days <= 0) return 0
  const cat = request.roomCategory
  if (type === "airline") return days * getAirlinePriceForCategory(request, cat)
  const room = request.hotelChess?.[0]?.room
  const mapping = {
    studio: room?.price,
    apartment: room?.price,
    luxe: room?.roomKind?.price,
    onePlace: room?.roomKind?.price,
    twoPlace: room?.roomKind?.price,
    threePlace: room?.roomKind?.price,
    fourPlace: room?.roomKind?.price,
    fivePlace: room?.roomKind?.price,
    sixPlace: room?.roomKind?.price,
    sevenPlace: room?.roomKind?.price,
    eightPlace: room?.roomKind?.price,
    ninePlace: room?.roomKind?.price,
    tenPlace: room?.roomKind?.price
  }
  return days * (mapping[cat] || 0)
}

export default reportResolver

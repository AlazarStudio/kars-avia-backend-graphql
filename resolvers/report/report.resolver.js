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
import { computeRoomShareMatrix } from "../../exports/computeRoomShareMatrix.js"

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
    createAirlineReport: async (_, { input }, context) => {
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

      // console.log("\n filterStart" + filterStart, "\n filterEnd" + filterEnd)

      let reportData
      let companyData
      let newReportData

      if (filter.passengersReport) {
        return (error = new Error(" \n passenger report not implemented! "))
      } else {
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
            person: {
              position: {
                name: {
                  notIn: ["Техник", "Инженер"]
                }
              }
            }
          },
          include: {
            person: { include: { position: true } },
            hotelChess: {
              include: {
                room: true
              }
            },
            hotel: true,
            airline: { include: { prices: { include: { airports: true } } } },
            mealPlan: true,
            airport: true
          },
          orderBy: { arrival: "asc" }
        })

        // console.log("\n requests: \n " + JSON.stringify(requests))
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
        // console.log("\n contract: \n " + JSON.stringify(contract))
        const city = await prisma.airport.findUnique({
          where: { id: airportId }
        })
        // console.log("company str " + JSON.stringify(company))

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

      // console.log(JSON.stringify(new_report))

      const reportName = filter.passengersReport
        ? `passenger_report_${startDateStr}-${endDateStr}_${Date.now()}.${format}`
        : `airline_report_${startDateStr}-${endDateStr}_${Date.now()}.${format}`
      const reportPath = path.resolve(`./reports/${reportName}`)
      fs.mkdirSync(path.dirname(reportPath), { recursive: true })

      if (format === "pdf") {
        throw new Error("PDF формат не реализован в данном примере")
      } else if (format === "xlsx") {
        // await generateExcelAvia(reportData, reportPath)
        await generateExcelAvia(new_report, reportPath, companyData)
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
    createHotelReport: async (_, { input }, context) => {
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

      // console.log("\n filterStart" + filterStart, "\n filterEnd" + filterEnd)

      let reportData
      if (filter.passengersReport) {
        return (error = new Error(" \n passenger report not implemented! "))
      } else {
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
            person: {
              position: {
                name: {
                  notIn: ["Техник", "Инженер"]
                }
              }
            }
          },
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

        // console.log("\n requests: \n " + JSON.stringify(requests))

        reportData = aggregateRequestReports(
          requests,
          "hotel",
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

      // console.log(JSON.stringify(new_report))

      const reportName = filter.passengersReport
        ? `passenger_report_${startDateStr}-${endDateStr}_${Date.now()}.${format}`
        : `hotel_report_${startDateStr}-${endDateStr}_${Date.now()}.${format}`
      const reportPath = path.resolve(`./reports/${reportName}`)
      fs.mkdirSync(path.dirname(reportPath), { recursive: true })

      if (format === "pdf") {
        throw new Error("PDF формат не реализован в данном примере")
      } else if (format === "xlsx") {
        // await generateExcelAvia(reportData, reportPath)
        await generateExcelAvia(new_report, reportPath)
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

  // console.log("price " + JSON.stringify(request.hotelChess[0]))

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
  // 1. Преобразуем startDate и endDate в Date объекты
  const start = new Date(startDate)
  const end = new Date(endDate)

  // 2. Инициализация счётчиков пищи
  let breakfastCount = 0
  let lunchCount = 0
  let dinnerCount = 0

  // 3. Проходим по каждому дню в dailyMeals
  mealPlan.dailyMeals.forEach((mealDay) => {
    const mealDate = new Date(mealDay.date)

    // Проверяем, попадает ли день в отчётный период
    if (mealDate >= start && mealDate <= end) {
      breakfastCount += mealDay.breakfast || 0
      lunchCount += mealDay.lunch || 0
      dinnerCount += mealDay.dinner || 0
    }
  })

  // 4. Если нет питания (по категории), то обнуляем количество
  const isNoMealCategory = ["apartment", "studio"].includes(
    request.roomCategory
  )
  if (isNoMealCategory) {
    breakfastCount = 0
    lunchCount = 0
    dinnerCount = 0
  }

  // 5. Получаем цены на еду в зависимости от типа отчёта
  let mealPrices
  if (reportType === "airline") {
    mealPrices = getAirlineMealPrice(request) // Для авиакомпаний
  } else if (reportType === "hotel") {
    mealPrices = request.hotel?.mealPrice // Для отелей
  }

  // 6. Рассчитываем стоимость пищи
  const breakfastCost = breakfastCount * (mealPrices?.breakfast || 0)
  const lunchCost = lunchCount * (mealPrices?.lunch || 0)
  const dinnerCost = dinnerCount * (mealPrices?.dinner || 0)
  const totalMealCost = breakfastCost + lunchCost + dinnerCost

  // Возвращаем результаты
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
    return pos !== "Техник" && pos !== "Инженер"
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

    // console.log(breakdown)

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
  let reportStartDay = +reportStart.split("T")[0].split("-")[2]
  let reportStartHour = +reportStart.split("T")[1].split(":")[0]
  let reportStartMinute = +reportStart.split("T")[1].split(":")[1]

  let reportEndDay = +reportEnd.split("T")[0].split("-")[2]
  let reportEndHour = +reportEnd.split("T")[1].split(":")[0]
  let reportEndMinute = +reportEnd.split("T")[1].split(":")[1]

  let arrivalDay = +arrivalStr.split("T")[0].split("-")[2]
  let arrivalHour = +arrivalStr.split("T")[1].split(":")[0]
  let arrivalMinute = +arrivalStr.split("T")[1].split(":")[1]

  let departureDay = +departureStr.split("T")[0].split("-")[2]
  let departureHour = +departureStr.split("T")[1].split(":")[0]
  let departureMinute = +departureStr.split("T")[1].split(":")[1]

  let countDays = 0
  let standartArrivalTime = 14
  let standartDepartureTime = 12

  if (
    reportStartDay == arrivalDay &&
    reportStartHour == arrivalHour &&
    reportStartMinute == arrivalMinute &&
    reportEndDay == departureDay &&
    reportEndHour == departureHour &&
    reportEndMinute == departureMinute
  ) {
    countDays = departureDay - arrivalDay + 1
  } else {
    if (
      reportStartDay == arrivalDay &&
      reportStartHour == arrivalHour &&
      reportStartMinute == arrivalMinute &&
      (reportEndDay != departureDay ||
        reportEndHour != departureHour ||
        reportEndMinute != departureMinute)
    ) {
      let innerDays = departureDay - arrivalDay

      if (innerDays > 0) {
        if (departureHour >= 18) {
          if (departureHour == 18 && departureMinute == 0) {
            innerDays = innerDays + 1
          } else {
            innerDays = innerDays + 1
          }
        } else if (departureHour >= 12) {
          if (departureHour == 12 && departureMinute == 0) {
            innerDays = innerDays + 0
          } else {
            innerDays = innerDays + 0.5
          }
        }

        countDays = innerDays
      } else {
        // if (departureHour - standartArrivalTime < 0) {
        //   countDays = 0.5
        // } else {
        //   countDays = 1
        // }

        if (departureHour >= 18) {
          if (departureHour == 18 && departureMinute == 0) {
            innerDays = 1
          } else {
            innerDays = 1
          }
        } else if (departureHour >= 12) {
          if (departureHour == 12 && departureMinute == 0) {
            innerDays = 0.5
          } else {
            innerDays = 0.5
          }
        } else {
          innerDays = 0.5
        }
        countDays = innerDays
      }
    }

    if (
      reportEndDay == departureDay &&
      reportEndHour == departureHour &&
      reportEndMinute == departureMinute &&
      (reportStartDay != arrivalDay ||
        reportStartHour != arrivalHour ||
        reportStartMinute != arrivalMinute)
    ) {
      let innerDays = departureDay - arrivalDay

      if (arrivalHour <= 6) {
        if (arrivalHour == 6 && arrivalMinute >= 0) {
          innerDays = innerDays + 0.5
        } else {
          innerDays = innerDays + 1
        }
      } else if (arrivalHour <= 14) {
        if (arrivalHour == 14 && arrivalMinute >= 0) {
          innerDays = innerDays + 0
        } else {
          innerDays = innerDays + 0.5
        }
      }

      countDays = innerDays + 1
    }
    if (
      (reportStartDay != arrivalDay ||
        reportStartHour != arrivalHour ||
        reportStartMinute != arrivalMinute) &&
      (reportEndDay != departureDay ||
        reportEndHour != departureHour ||
        reportEndMinute != departureMinute)
    ) {
      let innerDays = departureDay - arrivalDay

      if (innerDays > 0) {
        if (departureHour >= 18) {
          if (departureHour == 18 && departureMinute == 0) {
            innerDays = innerDays + 1
          } else {
            innerDays = innerDays + 1
          }
        } else if (departureHour >= 12) {
          if (departureHour == 12 && departureMinute == 0) {
            innerDays = innerDays + 0
          } else {
            innerDays = innerDays + 0.5
          }
        }

        if (arrivalHour <= 6) {
          if (arrivalHour == 6 && arrivalMinute >= 0) {
            innerDays = innerDays + 0.5
          } else {
            innerDays = innerDays + 1
          }
        } else if (arrivalHour <= 14) {
          if (arrivalHour == 14 && arrivalMinute >= 0) {
            innerDays = innerDays + 0
          } else {
            innerDays = innerDays + 0.5
          }
        }

        countDays = innerDays
      } else {
        // if (departureHour >= 18) {
        //     if (departureHour == 18 && departureMinute == 0) {
        //         innerDays = innerDays + 0.5
        //     } else {
        //         innerDays = innerDays + 1
        //     }
        // }
        // else
        //     if (departureHour >= 12) {
        //         if (departureHour == 12 && departureMinute == 0) {
        //             innerDays = innerDays + 0
        //         } else {
        //             innerDays = innerDays + 0.5
        //         }
        //     }

        if (departureHour < standartArrivalTime) {
          innerDays = innerDays - 0.5
        }

        if (arrivalHour <= 6) {
          if (arrivalHour == 6 && arrivalMinute >= 0) {
            innerDays = innerDays + 0.5
          } else {
            innerDays = innerDays + 1
          }
        } else if (arrivalHour <= 14) {
          if (arrivalHour == 14 && arrivalMinute >= 0) {
            innerDays = innerDays + 0
          } else {
            innerDays = innerDays + 0.5
          }
        }

        countDays = innerDays + 1
      }
    }
  }

  return countDays
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
  // console.log("rangeStart " + formatLocalDate(rangeStart))
  // 0) вход
  const raw = Array.isArray(data) ? data : []
  if (!raw.length) return []

  // 1) нормализуем записи (ВСЕ даты -> YMD!)
  const bookings = []
  for (const r of raw) {
    const arrivalYMD = fmtYMD(
      toUTCDate(r.arrival || r.start || r.checkin || "")
    )
    const departureYMD = fmtYMD(
      toUTCDate(r.departure || r.end || r.checkout || "")
    )
    if (isNaN(toUTCDate(arrivalYMD)) || isNaN(toUTCDate(departureYMD))) continue

    let a = arrivalYMD,
      b = departureYMD
    if (toUTCDate(a) > toUTCDate(b)) {
      const t = a
      a = b
      b = t
    } // починили перепутанные

    bookings.push({
      personName: String(r.personName || "").trim(),
      roomName: String(r.roomName || "").trim(),
      roomId: r.roomId ?? null,
      category: r.category ?? null,
      personPosition: r.personPosition ?? null,
      hotelName: r.hotelName ?? null,

      arrival: a, // YMD
      departure: b, // YMD
      totalDays: parseNum(r.totalDays), // не используется в расчёте долей
      totalLivingCost: parseNum(r.totalLivingCost), // только как запасной источник цены
      price: parseNum(r.price), // приоритетная дневная цена

      breakfastCount: parseNum(r.breakfastCount) || 0,
      lunchCount: parseNum(r.lunchCount) || 0,
      dinnerCount: parseNum(r.dinnerCount) || 0,
      totalMealCost: parseNum(r.totalMealCost) || 0
    })
  }
  if (!bookings.length) return []

  // 2) диапазон RS..RE (ТОЖЕ YMD!)
  let RS = rangeStart
    ? fmtYMD(toUTCDate(rangeStart))
    : bookings.reduce(
        (m, b) => (m < b.arrival ? m : b.arrival),
        bookings[0].arrival
      )
  let RE = rangeEnd
    ? fmtYMD(toUTCDate(rangeEnd))
    : bookings.reduce(
        (m, b) => (m > b.departure ? m : b.departure),
        bookings[0].departure
      )
  if (toUTCDate(RS) > toUTCDate(RE)) {
    const t = RS
    RS = RE
    RE = t
  }

  // 3) список дней включительно
  const days = []
  eachDayInclusive(RS, RE, (d) => days.push(d)) // ["YYYY-MM-DD", ...]

  // 4) присутствие по дням (roomKey -> day -> Set(guests))
  const roomKeyOf = (b) => (b.roomId != null ? `#${b.roomId}` : b.roomName)
  const rooms = Array.from(new Set(bookings.map(roomKeyOf)))
  const present = new Map(rooms.map((r) => [r, new Map()]))
  for (const b of bookings) {
    const key = roomKeyOf(b)
    for (const d of days) {
      if (d >= b.arrival && d <= b.departure) {
        // YMD vs YMD — OK
        const m = present.get(key)
        if (!m.has(d)) m.set(d, new Set())
        m.get(d).add(b.personName)
      }
    }
  }

  // 5) цена комнаты на каждый день (из price, иначе totalLivingCost/totalDays)
  const collect = new Map(rooms.map((r) => [r, new Map()])) // room->day->[]
  for (const b of bookings) {
    const key = roomKeyOf(b)
    const daily = Number.isFinite(b.price)
      ? b.price
      : Number.isFinite(b.totalLivingCost) &&
        Number.isFinite(b.totalDays) &&
        b.totalDays > 0
      ? b.totalLivingCost / b.totalDays
      : NaN
    if (!Number.isFinite(daily)) continue

    for (const d of days) {
      if (d >= b.arrival && d <= b.departure) {
        const m = collect.get(key)
        if (!m.has(d)) m.set(d, [])
        m.get(d).push(daily) // сохраняем дробные значения
      }
    }
  }

  const roomDayRate = new Map() // room->day->rate
  for (const rk of rooms) {
    const src = collect.get(rk)
    const m = new Map()
    for (const d of days) {
      const arr = (src && src.get(d)) || []
      if (!arr.length) continue
      const avg = arr.reduce((s, x) => s + x, 0) / arr.length // среднее при конфликте
      m.set(d, avg)
    }
    roomDayRate.set(rk, m)
  }

  // 6) считаем доли по людям
  const rowsMap = new Map() // key -> { guest, roomKey, perDay, total, allDays }
  for (const rk of rooms) {
    const byDay = roomDayRate.get(rk) || new Map()
    for (const d of days) {
      const rate = byDay.get(d) || 0
      if (!rate) continue
      const guests = present.get(rk).get(d) || new Set()
      const n = guests.size
      if (!n) continue
      const share = rate / n
      for (const g of guests) {
        const key = `${g}||${rk}`
        if (!rowsMap.has(key))
          rowsMap.set(key, {
            guest: g,
            roomKey: rk,
            perDay: new Map(),
            total: 0,
            allDays: []
          })
        const row = rowsMap.get(key)
        row.perDay.set(d, (row.perDay.get(d) || 0) + share)
        row.total += share
        row.allDays.push(d)
      }
    }
  }

  // 7) пояснение shareNote
  function buildShareNote(row) {
    const dlist = Array.from(new Set(row.allDays)).sort()
    if (!dlist.length) return ""
    const companionsByDay = dlist.map((d) => {
      const set = new Set(present.get(row.roomKey).get(d) || new Set())
      set.delete(row.guest)
      return Array.from(set).sort()
    })
    const same = (a, b) =>
      a.length === b.length && a.every((v, i) => v === b[i])
    const segs = []
    let segStart = dlist[0],
      cur = companionsByDay[0]
    for (let i = 1; i < dlist.length; i++) {
      if (!same(cur, companionsByDay[i])) {
        segs.push({ s: segStart, e: dlist[i - 1], c: cur })
        segStart = dlist[i]
        cur = companionsByDay[i]
      }
    }
    segs.push({ s: segStart, e: dlist[dlist.length - 1], c: cur })
    return segs
      .map((seg) => {
        const s = fmtRu(seg.s),
          e = fmtRu(seg.e)
        if (!seg.c.length) return `с ${s} по ${e} жил один`
        if (seg.c.length === 1) return `с ${s} по ${e} жил с ${seg.c[0]}`
        return `с ${s} по ${e} жил с: ${seg.c.join(", ")}`
      })
      .join(", ")
  }

  // 8) финальная проекция по контракту
  const out = []
  let idx = 1
  for (const row of Array.from(rowsMap.values()).sort((a, b) =>
    (a.roomKey + a.guest).localeCompare(b.roomKey + b.guest)
  )) {
    const dlist = Array.from(new Set(row.allDays)).sort()
    const arrivalYMD = dlist[0]
    const departureYMD = dlist[dlist.length - 1]
    const totalDaysIncluded = dlist.length

    const [roomId, roomName, hotelName, category, personPosition] = (() => {
      const match = bookings.find(
        (b) => b.personName === row.guest && roomKeyOf(b) === row.roomKey
      )
      return [
        match?.roomId ?? null,
        match?.roomName ?? (row.roomKey.startsWith("#") ? null : row.roomKey),
        match?.hotelName ?? null,
        match?.category ?? null,
        match?.personPosition ?? null
      ]
    })()

    // средний тариф по дням строки
    let avgDailyPrice = 0,
      cnt = 0
    for (const d of dlist) {
      const rate = roomDayRate.get(row.roomKey)?.get(d) || 0
      if (rate) {
        avgDailyPrice += rate
        cnt++
      }
    }
    avgDailyPrice = cnt ? avgDailyPrice / cnt : 0

    // агрегация питания по записям, попавшим в срез
    const agg = { breakfast: 0, lunch: 0, dinner: 0, mealCost: 0 }
    for (const b of bookings) {
      if (b.personName !== row.guest || roomKeyOf(b) !== row.roomKey) continue
      // пересечение с RS..RE (в YMD)
      const overlaps = !(b.departure < RS || b.arrival > RE)
      if (!overlaps) continue
      agg.breakfast += b.breakfastCount || 0
      agg.lunch += b.lunchCount || 0
      agg.dinner += b.dinnerCount || 0
      agg.mealCost += b.totalMealCost || 0
    }

    // округляем дроби
    // const totalLivingCost = Math.round(row.total)
    // const totalMealCost = Math.round(agg.mealCost)

    // сохраняем дробные значения
    const totalLivingCost = row.total
    const totalMealCost = agg.mealCost

    const totalDebt = totalLivingCost + totalMealCost

    out.push({
      index: idx++,
      arrival: formatLocalDate(rangeStart),
      // arrival: fmtRu(arrivalYMD),
      departure: formatLocalDate(rangeEnd),
      // departure: fmtRu(departureYMD),
      totalDays: totalDaysIncluded,
      category,
      personName: row.guest,
      roomName,
      roomId,
      shareNote: buildShareNote(row),
      personPosition,
      price: Math.round(avgDailyPrice),
      breakfastCount: agg.breakfast,
      lunchCount: agg.lunch,
      dinnerCount: agg.dinner,
      totalMealCost,
      totalLivingCost,
      totalDebt,
      hotelName
    })
  }

  return out
}

//  -----------------------------------------------------------------------------------------------------------------

export default reportResolver

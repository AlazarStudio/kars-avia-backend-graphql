import { prisma } from "../prisma.js"

const generateDispatcherReport = async ( startDate, endDate ) => {
  // const {startDate, endDate} = input
  const isoStart = new Date(startDate).toISOString()
  const isoEnd = new Date(endDate).toISOString()

  console.log("startDate", isoStart, "endDate", isoEnd)
  const requests = await prisma.request.findMany({
    where: {
      AND: {
        createdAt: {gte: isoStart, lte: isoEnd}
      }
    }
  })

  return requests.map((request) => {
    const arrivalDate = new Date(request.arrival.date)
    const departureDate = new Date(request.departure.date)

    return {
      employeeName: request.personId,
      requestNumber: request.requestNumber,
      stayDates: `${arrivalDate.toISOString().split("T")[0]} - ${
        departureDate.toISOString().split("T")[0]
      }`,
      numberOfNights: Math.ceil(
        (departureDate - arrivalDate) / (24 * 60 * 60 * 1000)
      ),
      // accommodationCost: request.accommodationCost,
      // mealCost: request.mealCost,
      // transferCost: request.transferCost || 0
    }
  })
}

const generateAirlineReport = async (startDate, endDate, airlineId) => {
  const requests = await prisma.request.findMany({
    where: {
      airlineId: airlineId,
      arrival: { date: { gte: startDate } }, // Используйте arrival.date
      departure: { date: { lte: endDate } }, // Используйте departure.date
      status: { not: "archived" } // Исключаем архивированные заявки
    },
    include: {
      employee: true,
      hotel: true
    }
  })

  return requests.map((request) => {
    const arrivalDate = new Date(request.arrival.date)
    const departureDate = new Date(request.departure.date)

    return {
      employeeName: request.employee.name,
      requestNumber: request.id,
      stayDates: `${arrivalDate.toISOString().split("T")[0]} - ${
        departureDate.toISOString().split("T")[0]
      }`,
      numberOfNights: Math.ceil(
        (departureDate - arrivalDate) / (24 * 60 * 60 * 1000)
      ),
      accommodationCost: request.accommodationCost,
      mealCost: request.mealCost,
      transferCost: request.transferCost || 0
    }
  })
}

const generateHotelReport = async (startDate, endDate, hotelId) => {
  const requests = await prisma.request.findMany({
    where: {
      hotelId: hotelId,
      arrival: { date: { gte: startDate } },
      departure: { date: { lte: endDate } },
      status: { not: "archived" } // Исключаем архивированные заявки
    },
    include: {
      employee: true,
      airline: true
    }
  })

  return requests.map((request) => {
    const arrivalDate = new Date(request.arrival.date)
    const departureDate = new Date(request.departure.date)

    return {
      employeeName: request.employee.name,
      requestNumber: request.id,
      stayDates: `${arrivalDate.toISOString().split("T")[0]} - ${
        departureDate.toISOString().split("T")[0]
      }`,
      numberOfNights: Math.ceil(
        (departureDate - arrivalDate) / (24 * 60 * 60 * 1000)
      ),
      accommodationCost: request.accommodationCost,
      mealCost: request.mealCost,
      transferCost: request.transferCost || 0
    }
  })
}

// Новый метод для получения отчетов по архивированным заявкам
const generateArchivedDispatcherReport = async (startDate, endDate) => {
  const requests = await prisma.request.findMany({
    where: {
      AND: [
        {
          arrival: {
            date: { gte: startDate } // Используйте только startDate
          }
        },
        {
          departure: {
            date: { lte: endDate } // Используйте только endDate
          }
        }
      ],
      status: "archived" // Включаем архивированные заявки
    },
    include: {
      employee: true,
      hotel: true,
      airline: true
    }
  })

  return requests.map((request) => {
    const arrivalDate = new Date(request.arrival.date)
    const departureDate = new Date(request.departure.date)

    return {
      employeeName: request.employee.name,
      requestNumber: request.id,
      stayDates: `${arrivalDate.toISOString().split("T")[0]} - ${
        departureDate.toISOString().split("T")[0]
      }`,
      numberOfNights: Math.ceil(
        (departureDate - arrivalDate) / (24 * 60 * 60 * 1000)
      ),
      accommodationCost: request.accommodationCost,
      mealCost: request.mealCost,
      transferCost: request.transferCost || 0
    }
  })
}

export {
  generateDispatcherReport,
  generateAirlineReport,
  generateHotelReport,
  generateArchivedDispatcherReport
}

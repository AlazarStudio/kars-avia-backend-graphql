import { prisma } from "../../prisma.js"
import {
  generateDispatcherReport,
  generateAirlineReport,
  generateHotelReport
} from "../../exports/reports.js"

const reportResolver = {
  Query: {
    dispatcherReport: async (_, { startDate, endDate }, context) => {
      return await generateDispatcherReport(startDate, endDate)
    },
    airlineReport: async (_, { startDate, endDate, airlineId }, context) => {
      return await generateAirlineReport(startDate, endDate, airlineId)
    },
    hotelReport: async (_, { startDate, endDate, hotelId }, context) => {
      return await generateHotelReport(startDate, endDate, hotelId)
    }
  }
}

export default reportResolver

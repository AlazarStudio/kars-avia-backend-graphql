import {
  generateDispatcherReport,
  generateAirlineReport,
  generateHotelReport
} from "../../exports/reports.js"

const reportResolver = {
  Query: {
    dispatcherReport: async (_, { startDate, endDate, includeArchive }) =>
      generateDispatcherReport(startDate, endDate, includeArchive),
    airlineReport: async (
      _,
      { startDate, endDate, airlineId, includeArchive }
    ) => generateAirlineReport(startDate, endDate, airlineId, includeArchive),
    hotelReport: async (_, { startDate, endDate, hotelId, includeArchive }) =>
      generateHotelReport(startDate, endDate, hotelId, includeArchive)
  }
}

export default reportResolver

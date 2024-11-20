import { prisma } from "../prisma.js";

const generateDispatcherReport = async (startDate, endDate, includeArchive) => {
  const filters = { createdAt: { gte: startDate, lte: endDate } };
  if (includeArchive) filters.archive = true;

  const requests = await prisma.request.findMany({ where: filters });
  return aggregateReportData(requests);
};

const generateAirlineReport = async (startDate, endDate, airlineId, includeArchive) => {
  const filters = { airlineId, createdAt: { gte: startDate, lte: endDate } };
  if (includeArchive) filters.archive = true;

  const requests = await prisma.request.findMany({ where: filters });
  return aggregateReportData(requests);
};

const generateHotelReport = async (startDate, endDate, hotelId, includeArchive) => {
  const filters = { hotelId, createdAt: { gte: startDate, lte: endDate } };
  if (includeArchive) filters.archive = true;

  const requests = await prisma.request.findMany({ where: filters });
  return aggregateReportData(requests);
};

const aggregateReportData = (requests) => {
  // Пример агрегации данных
  return requests.map((request) => ({
    name: request.person.name,
    roomCategory: request.roomCategory,
    stayDates: `${request.arrival.date} - ${request.departure.date}`,
    mealPlan: request.mealPlan,
    totalCost: calculateTotalCost(request),
  }));
};

const calculateTotalCost = (request) => {
  // Пример расчёта стоимости
  const mealCost = (request.mealPlan.breakfast || 0) * 500;
  const roomCost = request.roomCategory === "Standard" ? 3000 : 5000;
  return mealCost + roomCost;
};

export { generateDispatcherReport, generateAirlineReport, generateHotelReport };

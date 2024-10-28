import { prisma } from "../prisma.js";

const generateDispatcherReport = async (startDate, endDate) => {
  const requests = await prisma.request.findMany({
    where: {
      arrivalDate: { gte: new Date(startDate) },
      departureDate: { lte: new Date(endDate) },
    },
    include: {
      employee: true,
      hotel: true,
      airline: true,
    },
  });

  return requests.map((request) => ({
    employeeName: request.employee.name,
    requestNumber: request.id,
    stayDates: `${request.arrivalDate.toISOString().split("T")[0]} - ${request.departureDate.toISOString().split("T")[0]}`,
    numberOfNights: Math.ceil((request.departureDate - request.arrivalDate) / (1000 * 60 * 60 * 24)),
    accommodationCost: request.accommodationCost,
    mealCost: request.mealCost,
    transferCost: request.transferCost || 0,
  }));
};

const generateAirlineReport = async (startDate, endDate, airlineId) => {
  const requests = await prisma.request.findMany({
    where: {
      airlineId: airlineId,
      arrivalDate: { gte: new Date(startDate) },
      departureDate: { lte: new Date(endDate) },
    },
    include: {
      employee: true,
      hotel: true,
    },
  });

  return requests.map((request) => ({
    employeeName: request.employee.name,
    requestNumber: request.id,
    stayDates: `${request.arrivalDate.toISOString().split("T")[0]} - ${request.departureDate.toISOString().split("T")[0]}`,
    numberOfNights: Math.ceil((request.departureDate - request.arrivalDate) / (1000 * 60 * 60 * 24)),
    accommodationCost: request.accommodationCost,
    mealCost: request.mealCost,
    transferCost: request.transferCost || 0,
  }));
};

const generateHotelReport = async (startDate, endDate, hotelId) => {
  const requests = await prisma.request.findMany({
    where: {
      hotelId: hotelId,
      arrivalDate: { gte: new Date(startDate) },
      departureDate: { lte: new Date(endDate) },
    },
    include: {
      employee: true,
      airline: true,
    },
  });

  return requests.map((request) => ({
    employeeName: request.employee.name,
    requestNumber: request.id,
    stayDates: `${request.arrivalDate.toISOString().split("T")[0]} - ${request.departureDate.toISOString().split("T")[0]}`,
    numberOfNights: Math.ceil((request.departureDate - request.arrivalDate) / (1000 * 60 * 60 * 24)),
    accommodationCost: request.accommodationCost,
    mealCost: request.mealCost,
    transferCost: request.transferCost || 0,
  }));
};

export { generateDispatcherReport, generateAirlineReport, generateHotelReport };

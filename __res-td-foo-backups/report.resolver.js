import {
  // generatePDF, // если понадобится генерация PDF
  generateExcelHotel,
  generateExcelAvia
} from "../../exports/exporter.js";
import { prisma } from "../../prisma.js";
import path from "path";
import fs from "fs";
import {
  adminMiddleware,
  airlineAdminMiddleware,
  hotelAdminMiddleware
} from "../../middlewares/authMiddleware.js";
import { pubsub, REPORT_CREATED } from "../../exports/pubsub.js";

const reportResolver = {
  Query: {
    // Отчёт для авиакомпаний
    getAirlineReport: async (_, { filter }, context) => {
      const { user } = context;
      airlineAdminMiddleware(context);

      if (filter.hotelId) {
        throw new Error("Cannot fetch hotel reports in getAirlineReport");
      }

      const reports = await prisma.savedReport.findMany({
        where: {
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
      });

      const uniqueReports = [];
      const seenIds = new Set();

      reports.forEach((report) => {
        if (!seenIds.has(report.id)) {
          seenIds.add(report.id);
          uniqueReports.push(report);
        }
      });

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
      ];
    },

    // Отчёт для отелей
    getHotelReport: async (_, { filter }, context) => {
      const { user } = context;
      hotelAdminMiddleware(context);

      const reports = await prisma.savedReport.findMany({
        where: {
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
      });

      const uniqueReports = [];
      const seenIds = new Set();

      reports.forEach((report) => {
        if (!seenIds.has(report.id)) {
          seenIds.add(report.id);
          uniqueReports.push(report);
        }
      });

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
      ];
    }
  },

  Mutation: {
    // Мутация для создания отчёта для авиакомпании
    createAirlineReport: async (_, { input }, context) => {
      const { user } = context;
      airlineAdminMiddleware(context);
      const { filter, format } = input;

      if (!user) {
        throw new Error("Access denied");
      }

      // Задаём границы фильтра
      const filterStart = new Date(filter.startDate);
      const filterEnd = new Date(filter.endDate);
      const startDateStr = filterStart.toISOString().slice(0, 10);
      const endDateStr = filterEnd.toISOString().slice(0, 10);

      // Получаем запросы для формирования отчёта
      const requests = await prisma.request.findMany({
        where: {
          ...applyCreateFilters(filter),
          status: {
            in: ["done", "transferred", "extended", "archiving", "archived"]
          }
        },
        include: { person: true, hotelChess: true, hotel: true, airline: true },
        orderBy: { arrival: "asc" }
      });

      const airline = await prisma.airline.findUnique({
        where: { id: filter.airlineId },
        select: { name: true }
      });

      if (!airline) {
        throw new Error("Airline not found");
      }

      const name = airline.name;
      // Передаём границы фильтра в aggregateReports
      const reportData = aggregateReports(requests, "airline", filterStart, filterEnd);

      const reportName = `airline_report-${name}_${startDateStr}-${endDateStr}_${Date.now()}.${format}`;
      const reportPath = path.resolve(`./reports/${reportName}`);
      fs.mkdirSync(path.dirname(reportPath), { recursive: true });

      // Генерация отчёта (в данном примере поддерживается только xlsx)
      if (format === "pdf") {
        // await generatePDF(reportData, reportPath);
        throw new Error("PDF формат не реализован в данном примере");
      } else if (format === "xlsx") {
        await generateExcelAvia(reportData, reportPath);
      } else {
        throw new Error("Unsupported report format");
      }

      // Создание записи отчёта
      const reportRecord = {
        name: reportName,
        url: `/reports/${reportName}`,
        startDate: new Date(filter.startDate),
        endDate: new Date(filter.endDate),
        createdAt: new Date(),
        airlineId: user.role === "AIRLINEADMIN" ? user.airlineId : filter.airlineId
      };

      if (!reportRecord.airlineId) {
        throw new Error("Airline ID is required for this report");
      }

      const savedReport = await prisma.savedReport.create({
        data: reportRecord
      });
      pubsub.publish(REPORT_CREATED, { reportCreated: savedReport });
      return savedReport;
    },

    // Мутация для создания отчёта для отеля
    createHotelReport: async (_, { input }, context) => {
      const { user } = context;
      hotelAdminMiddleware(context);
      const { filter, format } = input;

      if (!user) {
        throw new Error("Access denied");
      }

      // Задаём границы фильтра
      const filterStart = new Date(filter.startDate);
      const filterEnd = new Date(filter.endDate);
      const startDateStr = filterStart.toISOString().slice(0, 10);
      const endDateStr = filterEnd.toISOString().slice(0, 10);

      // Получаем данные отеля
      const hotel = await prisma.hotel.findUnique({
        where: { id: filter.hotelId },
        select: {
          name: true,
          MealPrice: true,
          priceOneCategory: true,
          priceTwoCategory: true,
          priceThreeCategory: true,
          priceFourCategory: true,
          priceFiveCategory: true,
          priceSixCategory: true,
          priceSevenCategory: true,
          priceEightCategory: true,
          priceNineCategory: true,
          priceTenCategory: true
        }
      });

      if (!hotel) {
        throw new Error("Hotel not found");
      }

      // Получаем все заявки для отеля
      const requests = await prisma.request.findMany({
        where: {
          hotelId: filter.hotelId,
          status: {
            in: ["done", "transferred", "extended", "archiving", "archived"]
          }
        },
        include: {
          person: true,
          hotelChess: true,
          hotel: true
        },
        orderBy: { arrival: "asc" }
      });

      // Добавляем mealPlan отдельно (так как это JSON)
      const requestsWithMealPlan = await Promise.all(
        requests.map(async (request) => {
          const mealPlan = await prisma.request.findUnique({
            where: { id: request.id },
            select: { mealPlan: true }
          });
          return { ...request, mealPlan: mealPlan?.mealPlan || {} };
        })
      );

      const reportData = requestsWithMealPlan.map((request) => {
        const room = request.roomNumber || "Не указано";
        const category = request.roomCategory || "Не указано";
        const arrival = new Date(request.arrival);
        const departure = new Date(request.departure);

        // Вычисляем число дней пересечения периода проживания с диапазоном фильтра
        const totalDays = calculateOverlapDays(arrival, departure, filterStart, filterEnd);

        // Определяем стоимость проживания по категории
        const categoryPrices = {
          onePlace: request.hotel.priceOneCategory || 0,
          twoPlace: request.hotel.priceTwoCategory || 0,
          threePlace: request.hotel.priceThreeCategory || 0,
          fourPlace: request.hotel.priceFourCategory || 0,
          fivePlace: request.hotel.priceFiveCategory || 0,
          sixPlace: request.hotel.priceSixCategory || 0,
          sevenPlace: request.hotel.priceSevenCategory || 0,
          eightPlace: request.hotel.priceEightCategory || 0,
          ninePlace: request.hotel.priceNineCategory || 0,
          tenPlace: request.hotel.priceTenCategory || 0
        };

        const dailyPrice = categoryPrices[category] || 0;
        const totalLivingCost = dailyPrice * totalDays;

        // Подсчёт питания
        const mealPlan = request.mealPlan || {};
        const mealPrices = request.hotel.MealPrice || {};
        let totalMealCost = 0;
        let breakfastCount = 0;
        let lunchCount = 0;
        let dinnerCount = 0;

        let overlappingDailyMeals = [];
        if (mealPlan.dailyMeals && Array.isArray(mealPlan.dailyMeals)) {
          // Если дата заезда раньше начала фильтра – рассчитываем смещение (offset)
          const offsetDays = arrival < filterStart
            ? Math.ceil((filterStart - arrival) / (1000 * 60 * 60 * 24))
            : 0;
          overlappingDailyMeals = mealPlan.dailyMeals.slice(offsetDays, offsetDays + totalDays);
        }

        overlappingDailyMeals.forEach((meal) => {
          breakfastCount += meal.breakfast || 0;
          lunchCount     += meal.lunch || 0;
          dinnerCount    += meal.dinner || 0;
          totalMealCost  += (meal.breakfast || 0) * (mealPrices.breakfast || 0);
          totalMealCost  += (meal.lunch || 0) * (mealPrices.lunch || 0);
          totalMealCost  += (meal.dinner || 0) * (mealPrices.dinner || 0);
        });

        return {
          date: arrival.toISOString().slice(0, 10),
          roomName: room,
          category: category,
          isOccupied: "Занято",
          totalDays,
          breakfastCount,
          lunchCount,
          dinnerCount,
          dailyPrice,
          totalMealCost,
          totalLivingCost,
          totalDebt: totalLivingCost + totalMealCost
        };
      });

      // Добавляем пустые комнаты, если таковые есть
      const rooms = await prisma.room.findMany({
        where: { hotelId: filter.hotelId, reserve: false }
      });

      rooms.forEach((room) => {
        const alreadyOccupied = reportData.some((r) => r.roomName === room.name);
        if (!alreadyOccupied) {
          const categoryPrices = {
            onePlace: hotel.priceOneCategory || 0,
            twoPlace: hotel.priceTwoCategory || 0,
            threePlace: hotel.priceThreeCategory || 0,
            fourPlace: hotel.priceFourCategory || 0,
            fivePlace: hotel.priceFiveCategory || 0,
            sixPlace: hotel.priceSixCategory || 0,
            sevenPlace: hotel.priceSevenCategory || 0,
            eightPlace: hotel.priceEightCategory || 0,
            ninePlace: hotel.priceNineCategory || 0,
            tenPlace: hotel.priceTenCategory || 0
          };

          const category = room.category || "Не указано";
          const dailyPrice = categoryPrices[category] || 0;

          reportData.push({
            date: "Не указано",
            roomName: room.name,
            category: category,
            isOccupied: "Свободно",
            totalDays: 0,
            breakfastCount: 0,
            lunchCount: 0,
            dinnerCount: 0,
            dailyPrice: dailyPrice / 2,
            totalMealCost: 0,
            totalLivingCost: dailyPrice / 2,
            totalDebt: dailyPrice / 2
          });
        }
      });

      const reportName = `hotel_report-${hotel.name}_${startDateStr}-${endDateStr}_${Date.now()}.${format}`;
      const reportPath = path.resolve(`./reports/${reportName}`);
      fs.mkdirSync(path.dirname(reportPath), { recursive: true });

      if (format === "xlsx") {
        await generateExcelHotel(reportData, reportPath);
      } else {
        throw new Error("Unsupported report format");
      }

      const reportRecord = {
        name: reportName,
        url: `/reports/${reportName}`,
        startDate: new Date(filter.startDate),
        endDate: new Date(filter.endDate),
        createdAt: new Date(),
        hotelId: user.role === "HOTELADMIN" ? user.hotelId : filter.hotelId
      };

      if (!reportRecord.hotelId) {
        throw new Error("Hotel ID is required for this report");
      }

      const savedReport = await prisma.savedReport.create({
        data: reportRecord
      });
      pubsub.publish(REPORT_CREATED, { reportCreated: savedReport });
      return savedReport;
    }
  },

  Subscription: {
    reportCreated: {
      subscribe: () => pubsub.asyncIterator([REPORT_CREATED])
    }
  }
};

// Функция для формирования фильтра при создании отчёта
const applyCreateFilters = (filter) => {
  const { startDate, endDate, archived, personId, hotelId, airlineId } = filter;
  const where = {};

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
    ];
  }

  if (archived !== undefined) where.archived = archived;
  if (personId) where.personId = personId;
  if (hotelId) where.hotelId = hotelId;
  if (airlineId) where.airlineId = airlineId;

  return where;
};

// Функция для формирования фильтра по дате создания отчёта
const applyFilters = (filter) => {
  const { startDate, endDate, archived, personId, hotelId, airlineId } = filter;
  const where = {};

  if (startDate) where.createdAt = { gte: new Date(startDate) };
  if (endDate) where.createdAt = { lte: new Date(endDate) };
  if (archived !== undefined) where.archived = archived;
  if (personId) where.personId = personId;
  if (hotelId) where.hotelId = hotelId;
  if (airlineId) where.airlineId = airlineId;

  return where;
};

// Функция для вычисления числа дней пересечения двух периодов
const calculateOverlapDays = (stayStart, stayEnd, filterStart, filterEnd) => {
  const start = Math.max(stayStart.getTime(), filterStart.getTime());
  const end = Math.min(stayEnd.getTime(), filterEnd.getTime());
  if (end <= start) return 0;
  return Math.ceil((end - start) / (1000 * 60 * 60 * 24));
};

// Функция для вычисления общего числа дней между двумя датами (без учета фильтра)
const calculateTotalDays = (start, end) => {
  if (!start || !end) return 0;
  const differenceInMilliseconds = new Date(end) - new Date(start);
  return Math.ceil(differenceInMilliseconds / (1000 * 60 * 60 * 24));
};

// Функция для расчёта стоимости проживания по количеству дней
const calculateLivingCost = (request, type, days) => {
  const roomCategory = request.roomCategory;
  const priceMapping = {
    airline: {
      onePlace: request.airline?.priceOneCategory || 0,
      twoPlace: request.airline?.priceTwoCategory || 0,
      threePlace: request.airline?.priceThreeCategory || 0,
      fourPlace: request.airline?.priceFourCategory || 0,
      fivePlace: request.airline?.priceFiveCategory || 0,
      sixPlace: request.airline?.priceSixCategory || 0,
      sevenPlace: request.airline?.priceSevenCategory || 0,
      eightPlace: request.airline?.priceEightCategory || 0,
      ninePlace: request.airline?.priceNineCategory || 0,
      tenPlace: request.airline?.priceTenCategory || 0
    },
    hotel: {
      onePlace: request.hotel?.priceOneCategory || 0,
      twoPlace: request.hotel?.priceTwoCategory || 0,
      threePlace: request.hotel?.priceThreeCategory || 0,
      fourPlace: request.hotel?.priceFourCategory || 0,
      fivePlace: request.hotel?.priceFiveCategory || 0,
      sixPlace: request.hotel?.priceSixCategory || 0,
      sevenPlace: request.hotel?.priceSevenCategory || 0,
      eightPlace: request.hotel?.priceEightCategory || 0,
      ninePlace: request.hotel?.priceNineCategory || 0,
      tenPlace: request.hotel?.priceTenCategory || 0
    }
  };

  const pricePerDay = priceMapping[type]?.[roomCategory] || 0;
  return days > 0 ? days * pricePerDay : 0;
};

// Функция для расчёта стоимости питания (если питание задано в итоговых суммах)
const calculateMealCost = (request, type) => {
  const mealPlan = request.mealPlan || {};
  let mealPrices = {};

  if (type === "airline") {
    mealPrices = request.airline?.MealPrice || {};
  } else if (type === "hotel") {
    mealPrices = request.hotel?.MealPrice || {};
  }

  const breakfastCost = (mealPlan.breakfast || 0) * (mealPrices.breakfast || 0);
  const lunchCost = (mealPlan.lunch || 0) * (mealPrices.lunch || 0);
  const dinnerCost = (mealPlan.dinner || 0) * (mealPrices.dinner || 0);

  return breakfastCost + lunchCost + dinnerCost;
};

// Функция агрегирования данных для отчёта (для авиакомпании)
// Здесь производится пересчёт дней и, при необходимости, пропорциональное масштабирование питания
const aggregateReports = (requests, reportType, filterStart, filterEnd) => {
  return requests.map((request) => {
    const hotelChess = request.hotelChess?.[0] || {};
    const room = hotelChess.room || "Не указано";
    const startDate = hotelChess.start ? new Date(hotelChess.start) : null;
    const endDate = hotelChess.end ? new Date(hotelChess.end) : null;

    // Общее число дней по заявке без фильтра
    const fullDays = startDate && endDate ? calculateTotalDays(startDate, endDate) : 0;
    // Число дней пересечения с диапазоном фильтра
    const totalDays = startDate && endDate ? calculateOverlapDays(startDate, endDate, filterStart, filterEnd) : 0;

    // Если питание задано как итоговые суммы, масштабируем пропорционально
    const mealPlan = request.mealPlan || {};
    let breakfastCount = mealPlan.breakfast || 0;
    let lunchCount = mealPlan.lunch || 0;
    let dinnerCount = mealPlan.dinner || 0;

    if (fullDays > 0 && totalDays < fullDays) {
      const ratio = totalDays / fullDays;
      breakfastCount = Math.round(breakfastCount * ratio);
      lunchCount = Math.round(lunchCount * ratio);
      dinnerCount = Math.round(dinnerCount * ratio);
    }

    const mealPrices = request.airline?.MealPrice || request.hotel?.MealPrice || {};
    const breakfastCost = breakfastCount * (mealPrices.breakfast || 0);
    const lunchCost = lunchCount * (mealPrices.lunch || 0);
    const dinnerCost = dinnerCount * (mealPrices.dinner || 0);
    const totalMealCost = breakfastCost + lunchCost + dinnerCost;

    const totalLivingCost = calculateLivingCost(request, reportType, totalDays);

    return {
      room,
      personName: request.person?.name || "Не указано",
      arrival: startDate ? startDate.toLocaleString("ru-RU") : "Не указано",
      departure: endDate ? endDate.toLocaleString("ru-RU") : "Не указано",
      totalDays,
      breakfastCount,
      lunchCount,
      dinnerCount,
      breakfastCost,
      lunchCost,
      dinnerCost,
      totalMealCost: totalMealCost || 0,
      totalLivingCost: totalLivingCost || 0,
      totalDebt: (totalLivingCost || 0) + (totalMealCost || 0)
    };
  });
};

export default reportResolver;

import { PrismaClient } from "@prisma/client"
import dotenv from "dotenv"

dotenv.config()

// Создаём два клиента – для старой и для новой баз данных.
const prismaOld = new PrismaClient(
  process.env.OLD_DATABASE_URL
    ? {
        datasourceUrl: process.env.OLD_DATABASE_URL
      }
    : {}
)

const prismaNew = new PrismaClient(
  process.env.DATABASE_URL
    ? {
        datasourceUrl: process.env.DATABASE_URL
      }
    : {}
)

/* ============================
   Функция миграции пользователей
============================ */
async function migrateUsers() {
  const oldUsers = await prismaOld.user.findMany()
  for (const oldUser of oldUsers) {
    // Преобразуем поля – новые поля, которых не было, зададим дефолтные
    const newUser = {
      id: oldUser.id,
      createdAt: oldUser.createdAt ? new Date(oldUser.createdAt) : new Date(),
      updatedAt: oldUser.updatedAt ? new Date(oldUser.updatedAt) : new Date(),
      name: oldUser.name,
      email: oldUser.email,
      number: oldUser.number,
      login: oldUser.login,
      password: oldUser.password,
      images: oldUser.images || [],
      role: oldUser.role,
      position: oldUser.position,
      sender: { connect: [] }, // Связи можно обработать позже, если необходимо
      receiver: { connect: [] },
      reserve: { connect: [] },
      airlineId: oldUser.airlineId || null,
      airlineDepartmentId: oldUser.airlineDepartmentId || null,
      hotelId: oldUser.hotelId || null,
      chats: { connect: [] },
      messageSender: { connect: [] },
      messageReceiver: { connect: [] },
      logs: { connect: [] },
      dispatcher: oldUser.dispatcher || false,
      support: false,
      refreshToken: oldUser.refreshToken || null,
      is2FAEnabled: oldUser.is2FAEnabled || false,
      twoFASecret: oldUser.twoFASecret || null,
      twoFAMethod: oldUser.twoFAMethod || null,
      messageRead: { connect: [] },
      resetPasswordToken: null,
      resetPasswordExpires: null
    }

    try {
      await prismaNew.user.create({ data: newUser })
      console.log(`User ${newUser.email} migrated.`)
    } catch (error) {
      console.error(`Error migrating user ${newUser.email}:`, error)
    }
  }
}

/* ============================
   Функция миграции отелей
============================ */
async function migrateHotels() {
  const oldHotels = await prismaOld.hotel.findMany()
  for (const oldHotel of oldHotels) {
    // Переносим поля контактной информации в составной тип Information
    const newHotel = {
      id: oldHotel.id,
      name: oldHotel.name,
      provision: oldHotel.provision,
      quote: oldHotel.quote,
      information: {
        country: oldHotel.country,
        city: oldHotel.city,
        address: oldHotel.address,
        index: oldHotel.index,
        email: oldHotel.email,
        number: oldHotel.number,
        inn: oldHotel.inn,
        ogrn: oldHotel.ogrn,
        rs: oldHotel.rs,
        bank: oldHotel.bank,
        bik: oldHotel.bik,
        link: oldHotel.link,
        description: oldHotel.description
      },
      breakfast: oldHotel.breakfast, // предполагаем, что структура MealTime не изменилась
      lunch: oldHotel.lunch,
      dinner: oldHotel.dinner,
      images: oldHotel.images || [],
      mealPrice: oldHotel.MealPrice // в старой схеме имя было с большой буквы
      // Остальные поля (reserveHotel, hotelChesses, request, rooms, logs) будем создавать позже через связи
      // А также новые поля: stars, usStars, airportDistance, savedReport, chat, prices, Positions – можно задать дефолтно или оставить null
    }

    try {
      await prismaNew.hotel.create({ data: newHotel })
      console.log(`Hotel ${newHotel.name} migrated.`)
    } catch (error) {
      console.error(`Error migrating hotel ${newHotel.name}:`, error)
    }
  }
}

/* ============================
   Функция миграции заявок (Request)
============================ */
// async function migrateRequests() {
//   const oldRequests = await prismaOld.request.findMany()
//   for (const req of oldRequests) {
//     // Обработка arrival и departure – если раньше они были объектами с полем date
//     const newArrival =
//       req.arrival && req.arrival.date
//         ? new Date(req.arrival.date)
//         : new Date(req.arrival)
//     const newDeparture =
//       req.departure && req.departure.date
//         ? new Date(req.departure.date)
//         : new Date(req.departure)

//     // Преобразование mealPlan
//     let newMealPlan = null
//     if (req.mealPlan) {
//       newMealPlan = {
//         included: req.mealPlan.included,
//         breakfastEnabled: req.mealPlan.breakfast != null,
//         breakfast: req.mealPlan.breakfast,
//         lunchEnabled: req.mealPlan.lunch != null,
//         lunch: req.mealPlan.lunch,
//         dinnerEnabled: req.mealPlan.dinner != null,
//         dinner: req.mealPlan.dinner,
//         dailyMeals: Array.isArray(req.mealPlan.dailyMeals)
//           ? req.mealPlan.dailyMeals
//           : []
//       }
//     }
//     // Если раньше hotelChess была единичным объектом, преобразуем в массив
//     let newHotelChesses = []
//     if (req.hotelChess) {
//       newHotelChesses.push(req.hotelChess)
//     }
//     const newRequest = {
//       id: req.id,
//       createdAt: new Date(req.createdAt),
//       updatedAt: new Date(req.updatedAt),
//       senderId: req.senderId,
//       airportId: req.airportId,
//       airlineId: req.airlineId,
//       personId: req.personId,
//       arrival: newArrival,
//       departure: newDeparture,
//       requestNumber: req.requestNumber,
//       roomCategory: req.roomCategory,
//       roomNumber: req.roomNumber,
//       mealPlan: newMealPlan,
//       hotelId: req.hotelId,
//       receiverId: req.receiverId,
//       status: req.status,
//       archive: req.archive,
//       files: req.files || [],
//       reserve: req.reserve,
//       // Если в новой схеме связь с HotelChess – массив, то создаём связь через вложенное создание:
//       hotelChess: { create: newHotelChesses }
//       // Остальные связи (chat, logs) можно обрабатывать отдельно, если требуется
//     }

//     try {
//       await prismaNew.request.create({ data: newRequest })
//       console.log(`Request ${newRequest.requestNumber} migrated.`)
//     } catch (error) {
//       console.error(
//         `Error migrating request ${newRequest.requestNumber}:`,
//         error
//       )
//     }
//   }
// }

/* ============================
   Функция миграции резервов (Reserve)
============================ */
// async function migrateReserves() {
//   const oldReserves = await prismaOld.reserve.findMany()
//   for (const res of oldReserves) {
//     const newArrival =
//       res.arrival && res.arrival.date
//         ? new Date(res.arrival.date)
//         : new Date(res.arrival)
//     const newDeparture =
//       res.departure && res.departure.date
//         ? new Date(res.departure.date)
//         : new Date(res.departure)
//     let newMealPlan = null
//     if (res.mealPlan) {
//       newMealPlan = {
//         included: res.mealPlan.included,
//         breakfastEnabled: res.mealPlan.breakfast != null,
//         breakfast: res.mealPlan.breakfast,
//         lunchEnabled: res.mealPlan.lunch != null,
//         lunch: res.mealPlan.lunch,
//         dinnerEnabled: res.mealPlan.dinner != null,
//         dinner: res.mealPlan.dinner,
//         dailyMeals: Array.isArray(res.mealPlan.dailyMeals)
//           ? res.mealPlan.dailyMeals
//           : []
//       }
//     }
//     const newReserve = {
//       id: res.id,
//       createdAt: new Date(res.createdAt),
//       updatedAt: new Date(res.updatedAt),
//       senderId: res.senderId,
//       airportId: res.airportId,
//       airlineId: res.airlineId,
//       arrival: newArrival,
//       departure: newDeparture,
//       reserveNumber: res.reserveNumber,
//       passengerCount: res.passengerCount,
//       mealPlan: newMealPlan,
//       status: res.status,
//       archive: res.archive,
//       files: res.files || []
//       // Остальные связи (hotel, passengers, chat, logs, hotelChess) можно добавить при необходимости
//     }
//     try {
//       await prismaNew.reserve.create({ data: newReserve })
//       console.log(`Reserve ${newReserve.reserveNumber} migrated.`)
//     } catch (error) {
//       console.error(
//         `Error migrating reserve ${newReserve.reserveNumber}:`,
//         error
//       )
//     }
//   }
// }

/* ============================
   Функция миграции HotelChess
============================ */
// async function migrateHotelChesses() {
//   const oldHCs = await prismaOld.hotelChess.findMany()
//   for (const hc of oldHCs) {
//     const newHC = {
//       id: hc.id,
//       hotelId: hc.hotelId,
//       reserveHotelId: hc.reserveHotelId || null,
//       public: hc.public,
//       roomId: hc.room || null, // если в старой схеме поле room было строкой – здесь можно попробовать использовать его как roomId
//       place: hc.place,
//       start: hc.start ? new Date(hc.start) : null,
//       end: hc.end ? new Date(hc.end) : null,
//       clientId: hc.clientId,
//       requestId: hc.requestId,
//       reserveId: hc.reserveId || null,
//       passengerId: hc.passengerId || null,
//       status: hc.status || null,
//       mealPlan: hc.mealPlan || null
//     }
//     try {
//       await prismaNew.hotelChess.create({ data: newHC })
//       console.log(`HotelChess ${newHC.id} migrated.`)
//     } catch (error) {
//       console.error(`Error migrating HotelChess ${newHC.id}:`, error)
//     }
//   }
// }

/* ============================
   Функция миграции комнат (Room)
============================ */
async function migrateRooms() {
  const oldRooms = await prismaOld.room.findMany()
  for (const room of oldRooms) {
    const newRoom = {
      id: room.id,
      name: room.name,
      hotelId: room.hotelId,
      description: room.description || "",
      images: room.images || [],
      category: room.category,
      places: room.places,
      reserve: room.reserve,
      active: room.active
    }
    try {
      await prismaNew.room.create({ data: newRoom })
      console.log(`Room ${newRoom.name} migrated.`)
    } catch (error) {
      console.error(`Error migrating room ${newRoom.name}:`, error)
    }
  }
}

/* ============================
   Функция миграции авиакомпаний (Airline)
============================ */
async function migrateAirlines() {
  const oldAirlines = await prismaOld.airline.findMany()
  for (const airline of oldAirlines) {
    const newAirline = {
      id: airline.id,
      name: airline.name,
      images: airline.images || [],
      information: {
        country: airline.country,
        city: airline.city,
        address: airline.address,
        index: airline.index,
        email: airline.email,
        number: airline.number,
        inn: airline.inn,
        ogrn: airline.ogrn,
        rs: airline.rs,
        bank: airline.bank,
        bik: airline.bik,
        link: airline.link,
        description: airline.description
      },
      mealPrice: airline.MealPrice,
      prices: {
        priceOneCategory: airline.priceOneCategory,
        priceTwoCategory: airline.priceTwoCategory,
        priceThreeCategory: 0,
        priceFourCategory: 0,
        priceFiveCategory: 0,
        priceSixCategory: 0,
        priceSevenCategory: 0,
        priceEightCategory: 0,
        priceNineCategory: 0,
        priceTenCategory: 0
      }
    }
    try {
      await prismaNew.airline.create({ data: newAirline })
      console.log(`Airline ${newAirline.name} migrated.`)
    } catch (error) {
      console.error(`Error migrating airline ${newAirline.name}:`, error)
    }
  }
}

/* ============================
   Главный запуск миграции
============================ */
async function runMigration() {
  try {
    console.log("Starting migration from OLD DB to NEW DB...")
    await migrateUsers()
    await migrateHotels()
    await migrateRooms()
    // await migrateRequests()
    // await migrateReserves()
    // await migrateHotelChesses()
    await migrateAirlines()
    console.log("Migration completed successfully.")
  } catch (error) {
    console.error("Migration failed:", error)
  } finally {
    await prismaOld.$disconnect()
    await prismaNew.$disconnect()
  }
}

runMigration()

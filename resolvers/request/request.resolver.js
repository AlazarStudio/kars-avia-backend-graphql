// Импорт необходимых модулей и утилит
import { prisma } from "../../prisma.js"
import GraphQLUpload from "graphql-upload/GraphQLUpload.mjs"
import logAction from "../../exports/logaction.js"
import {
  pubsub,
  REQUEST_CREATED,
  REQUEST_UPDATED,
  NOTIFICATION,
  MESSAGE_SENT,
  HOTEL_UPDATED
} from "../../exports/pubsub.js"
import { withFilter } from "graphql-subscriptions"
import calculateMeal from "../../exports/calculateMeal.js"
import nodemailer from "nodemailer"
import {
  formatDate,
  reverseDateTimeFormatter
} from "../../exports/dateTimeFormater.js"
import {
  adminHotelAirMiddleware,
  airlineAdminMiddleware,
  airlineModerMiddleware,
  dispatcherModerMiddleware,
  moderatorMiddleware
} from "../../middlewares/authMiddleware.js"
import updateDailyMeals from "../../exports/updateDailyMeals.js"
import { uploadFiles, deleteFiles } from "../../exports/uploadFiles.js"

const transporter = nodemailer.createTransport({
  // host: "smtp.mail.ru",
  host: "smtp.beget.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
})

// Основной объект-резольвер для работы с заявками (request)
const requestResolver = {
  // Подключаем тип Upload для обработки загрузки файлов через GraphQL
  Upload: GraphQLUpload,

  Query: {
    // Получение списка заявок с пагинацией и фильтрацией по статусу.
    // Если у пользователя задан airlineId, добавляется фильтр по нему.
    // Исключаются архивные заявки (archive: true).
    requests: async (_, { pagination }, context) => {
      const { user } = context
      const { skip, take, status } = pagination
      // Формирование фильтра по статусу: если статус указан и не содержит "all" – фильтруем по нему.
      const statusFilter =
        status && status.length > 0 && !status.includes("all")
          ? { status: { in: status } }
          : {}
      // Если у пользователя есть airlineId, добавляем соответствующий фильтр.
      const airlineFilter = user.airlineId ? { airlineId: user.airlineId } : {}

      // Подсчёт общего количества заявок с учетом фильтров и исключения архивных.
      const totalCount = await prisma.request.count({
        where: {
          ...statusFilter,
          ...airlineFilter,
          archive: { not: true }
        }
      })
      const totalPages = Math.ceil(totalCount / take)
      // Получаем список заявок с указанными фильтрами, пагинацией и сортировкой (по убыванию даты создания).
      const requests = await prisma.request.findMany({
        where: {
          ...statusFilter,
          ...airlineFilter,
          archive: { not: true }
        },
        skip: skip * take,
        take: take,
        include: {
          // airline: true,
          airline: { select: { name: true, images: true } },
          // airport: true,
          airport: { select: { name: true, code: true } },
          // hotel: true,
          // hotelChess: true,
          chat: true
          // logs: true,
        },
        orderBy: { createdAt: "desc" }
        // orderBy: { updatedAt: "desc" }
      })

      return {
        totalCount,
        requests,
        totalPages
      }
    },

    // Получение архивных заявок.
    // Доступно только для администраторов авиалиний (airlineAdminMiddleware).
    requestArchive: async (_, { pagination }, context) => {
      const { user } = context
      airlineAdminMiddleware(context)
      const { skip, take, status } = pagination
      // Если статус содержит "all" – фильтр не применяется, иначе фильтруем по указанным статусам.
      const statusFilter =
        status && status.includes("all") ? {} : { status: { in: status } }
      const airlineFilter = user.airlineId ? { airlineId: user.airlineId } : {}
      // Подсчёт количества архивных заявок.
      const totalCount = await prisma.request.count({
        where: {
          ...statusFilter,
          ...airlineFilter,
          archive: true
        }
      })
      const totalPages = Math.ceil(totalCount / take)
      // Получение архивных заявок с пагинацией и сортировкой.
      const requests = await prisma.request.findMany({
        where: {
          ...statusFilter,
          ...airlineFilter,
          archive: true
        },
        skip: skip * take,
        take: take,
        include: {
          airline: true,
          airport: true,
          hotel: true,
          hotelChess: true,
          logs: true
        },
        orderBy: { createdAt: "desc" }
      })
      return {
        totalCount,
        requests,
        totalPages
      }
    },

    // Получение одной заявки по ID.
    // Включает связанные данные: airline, airport, hotel, hotelChess, logs.
    // Если заявка имеет статус "created" и пользователь является диспетчером, статус обновляется на "opened".
    request: async (_, { id }, context) => {
      const { user } = context
      const request = await prisma.request.findUnique({
        where: { id },
        include: {
          airline: true,
          airport: true,
          hotel: true,
          hotelChess: true,
          logs: true,
          chat: true
        }
      })
      if (!request) {
        throw new Error("Request not found")
      }
      // Если заявка находится в архиве, для доступа требуется проверка прав администратора.

      // if (request.archive === true) {
      //   airlineAdminMiddleware(context)
      // }

      // Если пользователь является диспетчером, при первом открытии заявки (status === "created")
      // обновляем статус на "opened", записываем лог и публикуем событие.
      if (!user || !user.dispatcher) {
        return request
      }
      if (request.status === "created") {
        const updatedRequest = await prisma.request.update({
          where: { id },
          data: { status: "opened", receiverId: user.id }
        })
        const existingLog = await prisma.log.findFirst({
          where: {
            action: "open_request",
            requestId: updatedRequest.id
          }
        })
        if (!existingLog) {
          try {
            await logAction({
              context,
              action: "open_request",
              description: `Заявка № <span style='color:#545873'>${updatedRequest.requestNumber}</span> открыта пользователем <span style='color:#545873'>${user.name}</span>`,
              oldData: { status: "created" },
              newData: { status: "opened" },
              requestId: updatedRequest.id
            })
          } catch (error) {
            console.error("Ошибка при логировании открытия заявки:", error)
          }
        }
        pubsub.publish(REQUEST_UPDATED, { requestUpdated: updatedRequest })
        return updatedRequest
      }
      return request
    }
  },

  Mutation: {
    // Создание новой заявки.
    // Здесь происходит проверка мидлвара (airlineModerMiddleware), формирование уникального номера заявки,
    // загрузка файлов, создание записи в базе, создание чата для заявки и логирование действия.
    createRequest: async (_, { input, files }, context) => {
      const { user } = context
      airlineModerMiddleware(context)
      const {
        personId,
        airportId,
        arrival,
        departure,
        roomCategory,
        mealPlan,
        airlineId,
        senderId,
        status,
        reserve
      } = input
      // Приведение дат к формату YYYY-MM-DD (отсекаем время)
      const arrivalDate = arrival.split("T")[0]
      const departureDate = departure.split("T")[0]
      // Проверяем, существует ли уже заявка с такими же параметрами (исключая отмененные).
      let existingRequest = null
      if (personId) {
        existingRequest = await prisma.request.findFirst({
          where: {
            personId,
            airlineId,
            airportId,
            arrival: {
              gte: new Date(`${arrivalDate}T00:00:00Z`),
              lte: new Date(`${arrivalDate}T23:59:59Z`)
            },
            departure: {
              gte: new Date(`${departureDate}T00:00:00Z`),
              lte: new Date(`${departureDate}T23:59:59Z`)
            },
            status: {
              not: "canceled"
            }
          }
        })
        // console.log("\n existingRequest", existingRequest)
      }
      if (existingRequest != null) {
        throw new Error(`Request already exists with id: ${existingRequest.id}`)
      }
      // Определение текущего месяца и года для формирования номера заявки
      const currentDate = new Date()
      const month = String(currentDate.getMonth() + 1).padStart(2, "0") // двузначный номер месяца
      const year = String(currentDate.getFullYear()).slice(-2)
      // Определение границ месяца для поиска последней заявки
      const startOfMonth = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth(),
        1
      )
      const endOfMonth = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth() + 1,
        0,
        23,
        59,
        59
      )
      // Поиск последней созданной заявки в текущем месяце
      const lastRequest = await prisma.request.findFirst({
        where: { createdAt: { gte: startOfMonth, lte: endOfMonth } },
        orderBy: { createdAt: "desc" }
      })
      // Формирование последовательного номера заявки
      let sequenceNumber
      if (lastRequest) {
        const lastNumber = parseInt(lastRequest.requestNumber.slice(0, 4), 10)
        sequenceNumber = String(lastNumber + 1).padStart(4, "0")
      } else {
        sequenceNumber = "0001"
      }
      // Получение данных об аэропорте для формирования кода заявки
      const airport = await prisma.airport.findUnique({
        where: { id: airportId }
      })
      if (!airport) {
        throw new Error("Airport not found")
      }
      // Формирование номера заявки: номер + код аэропорта + месяц + год + буква "e"
      const requestNumber = `${sequenceNumber}${airport.code}${month}${year}e`
      // Обработка загрузки файлов (если они есть)
      let filesPath = []
      if (files && files.length > 0) {
        for (const file of files) {
          const uploadedPath = await uploadFiles(file)
          filesPath.push(uploadedPath)
        }
      }
      if (mealPlan && mealPlan.included) {
        // Если требуется, чтобы все приёмы были включены, можно проверять:
        if (
          !mealPlan.breakfastEnabled ||
          !mealPlan.lunchEnabled ||
          !mealPlan.dinnerEnabled
        ) {
          // Например, можно установить соответствующие поля в 0 или вернуть ошибку
          // throw new Error("При включенном питании необходимо активировать завтрак, обед и ужин");
          // Либо:
          mealPlan.breakfastEnabled = mealPlan.breakfastEnabled || false
          mealPlan.lunchEnabled = mealPlan.lunchEnabled || false
          mealPlan.dinnerEnabled = mealPlan.dinnerEnabled || false
        }
      }
      // Создание заявки в базе данных с подключением связанных сущностей
      const newRequest = await prisma.request.create({
        data: {
          // person: { connect: { id: personId } },
          ...(personId ? { person: { connect: { id: personId } } } : {}),
          airport: airportId ? { connect: { id: airportId } } : null,
          arrival,
          departure,
          roomCategory,
          mealPlan,
          airline: { connect: { id: airlineId } },
          sender: { connect: { id: senderId } },
          status,
          reserve,
          files: filesPath,
          requestNumber
        },
        include: {
          airline: true,
          airport: true,
          person: true
        }
      })
      // Создание чата для заявки, связанного с авиалинией
      const newChat = await prisma.chat.create({
        data: {
          request: { connect: { id: newRequest.id } },
          separator: "airline",
          airline: { connect: { id: airlineId } }
        }
      })
      // Добавление отправителя в созданный чат
      await prisma.chatUser.create({
        data: {
          chat: { connect: { id: newChat.id } },
          user: { connect: { id: senderId } }
        }
      })
      const mailOptions = {
        from: `${process.env.EMAIL_USER}`,
        to: `${process.env.EMAIL_RESIEVER}`,
        subject: "Request created",
        html:
          newRequest.person && newRequest.person.position
            ? `Пользователь <span style='color:#545873'>${user.name}</span> создал заявку <span style='color:#545873'>№${newRequest.requestNumber}</span> 
        для <span style='color:#545873'>${newRequest.person.position} ${newRequest.person.name}</span> в аэропорт 
        <span style='color:#545873'>${newRequest.airport.name}</span>`
            : `Пользователь <span style='color:#545873'>${user.name}</span> создал предварительную бронь <span style='color:#545873'>№${newRequest.requestNumber}</span> 
        в аэропорт <span style='color:#545873'>${newRequest.airport.name}</span>`
      }

      // Отправка письма через настроенный транспортёр
      await transporter.sendMail(mailOptions)

      // Логирование создания заявки
      try {
        const description =
          newRequest.person && newRequest.person.position
            ? `Пользователь <span style='color:#545873'>${user.name}</span> создал заявку <span style='color:#545873'>№${newRequest.requestNumber}</span> 
            для <span style='color:#545873'>${newRequest.person.position} ${newRequest.person.name}</span> в аэропорт 
            <span style='color:#545873'>${newRequest.airport.name}</span>`
            : `Пользователь <span style='color:#545873'>${user.name}</span> создал предварительную бронь <span style='color:#545873'>№${newRequest.requestNumber}</span> 
            в аэропорт <span style='color:#545873'>${newRequest.airport.name}</span>`

        await logAction({
          context,
          action: "create_request",
          description,
          newData: {
            requestNumber: newRequest.requestNumber,
            airportId,
            personId,
            status
          },
          airlineId,
          requestId: newRequest.id
        })
      } catch (error) {
        console.error("Ошибка при логировании создания заявки:", error)
      }
      // Публикация уведомления и события о создании заявки
      await prisma.notification.create({
        data: {
          request: { connect: { id: newRequest.id } },
          airline: { connect: { id: airlineId } },
          description: {
            action: "create_request",
            description:
              newRequest.person && newRequest.person.position
                ? `Создана заявка <span style='color:#545873'>${newRequest.requestNumber}</span> 
                      для <span style='color:#545873'>${newRequest.person.position} ${newRequest.person.name}</span> 
                      в аэропорт <span style='color:#545873'>${newRequest.airport.name}</span>`
                : `Создана предварительная бронь <span style='color:#545873'>${newRequest.requestNumber}</span> 
                      в аэропорт <span style='color:#545873'>${newRequest.airport.name}</span>`
          }
        }
      })
      pubsub.publish(NOTIFICATION, {
        notification: {
          __typename: "RequestCreatedNotification",
          ...newRequest
        }
      })
      pubsub.publish(REQUEST_CREATED, { requestCreated: newRequest })
      return newRequest
    },

    // Обновление существующей заявки.
    // Производится сравнение новых дат с текущими, обновление связанных сущностей (например, hotelChess)
    // и пересчёт плана питания, если даты изменились.

    // updateRequest: async (_, { id, input }, context) => {
    //   const { user } = context
    //   // Проверка прав: airlineModerMiddleware для модераторов авиалиний
    //   moderatorMiddleware(context)
    //   const {
    //     airportId,
    //     arrival,
    //     departure,
    //     roomCategory,
    //     mealPlan,
    //     hotelId,
    //     hotelChessId,
    //     roomNumber,
    //     status
    //   } = input
    //   // Получаем старую заявку для сравнения
    //   const oldRequest = await prisma.request.findUnique({
    //     where: { id },
    //     include: {
    //       hotelChess: true,
    //       hotel: true,
    //       person: true
    //     }
    //   })
    //   if (!oldRequest) {
    //     throw new Error("Request not found")
    //   }

    //   // console.log("\n input: \n", JSON.stringify(input), "\n")

    //   // Определяем, изменились ли даты прибытия или отбытия
    //   const isArrivalChanged =
    //     arrival &&
    //     new Date(arrival).getTime() !== new Date(oldRequest.arrival).getTime()
    //   const isDepartureChanged =
    //     departure &&
    //     new Date(departure).getTime() !==
    //       new Date(oldRequest.departure).getTime()

    //   // Формируем объект с данными для обновления заявки
    //   const dataToUpdate = {
    //     airport: airportId ? { connect: { id: airportId } } : undefined,
    //     arrival: arrival ? new Date(arrival) : undefined,
    //     departure: departure ? new Date(departure) : undefined,
    //     roomCategory,
    //     roomNumber,
    //     status
    //     // mealPlan
    //   }
    //   if (hotelId) {
    //     dataToUpdate.hotel = { connect: { id: hotelId } }
    //   }
    //   if (hotelChessId) {
    //     dataToUpdate.hotelChess = { connect: { id: hotelChessId } }
    //   }

    //   // Обработка hotelChess: если заявка уже привязана к номеру, обновляем даты
    //   let hotelChessToUpdate = null
    //   if (
    //     Array.isArray(oldRequest.hotelChess) &&
    //     oldRequest.hotelChess.length > 0
    //   ) {
    //     hotelChessToUpdate = oldRequest.hotelChess[0]
    //   } else if (
    //     oldRequest.hotelChess &&
    //     typeof oldRequest.hotelChess === "object"
    //   ) {
    //     hotelChessToUpdate = oldRequest.hotelChess
    //   }
    //   if (hotelChessToUpdate && hotelChessToUpdate.id) {
    //     await prisma.hotelChess.update({
    //       where: { id: hotelChessToUpdate.id },
    //       data: {
    //         start: isArrivalChanged
    //           ? new Date(arrival)
    //           : hotelChessToUpdate.start,
    //         end: isDepartureChanged
    //           ? new Date(departure)
    //           : hotelChessToUpdate.end
    //       }
    //     })
    //   } else {
    //     console.warn("No valid hotelChess found for updating.")
    //   }

    //   // Если даты изменились и у заявки привязан отель, пересчитываем план питания
    //   // if ((isArrivalChanged || isDepartureChanged) && oldRequest.hotel) {
    //   //   const hotel = await prisma.hotel.findUnique({
    //   //     where: { id: oldRequest.hotel.id },
    //   //     select: {
    //   //       breakfast: true,
    //   //       lunch: true,
    //   //       dinner: true
    //   //     }
    //   //   })
    //   //   const mealTimes = {
    //   //     breakfast: hotel.breakfast,
    //   //     lunch: hotel.lunch,
    //   //     dinner: hotel.dinner
    //   //   }
    //   //   const enabledMeals = {
    //   //     breakfast: oldRequest.mealPlan.breakfastEnabled,
    //   //     lunch: oldRequest.mealPlan.lunchEnabled,
    //   //     dinner: oldRequest.mealPlan.dinnerEnabled
    //   //   }
    //   //   const newMealPlan = calculateMeal(
    //   //     isArrivalChanged ? arrival : oldRequest.arrival,
    //   //     isDepartureChanged ? departure : oldRequest.departure,
    //   //     mealTimes,
    //   //     enabledMeals
    //   //   )
    //   //   dataToUpdate.mealPlan = {
    //   //     breakfast: newMealPlan.totalBreakfast,
    //   //     lunch: newMealPlan.totalLunch,
    //   //     dinner: newMealPlan.totalDinner,
    //   //     dailyMeals: newMealPlan.dailyMeals
    //   //   }
    //   // }

    //   const updatedStart = arrival ? arrival : oldRequest.arrival
    //   const updatedEnd = departure ? departure : oldRequest.departure

    //   const enabledMeals = {
    //     breakfast: oldRequest.mealPlan?.breakfastEnabled,
    //     lunch: oldRequest.mealPlan?.lunchEnabled,
    //     dinner: oldRequest.mealPlan?.dinnerEnabled
    //   }
    //   let mealPlanData = oldRequest.mealPlan
    //   if (oldRequest.hotelChess && oldRequest.hotelChess.length != 0) {
    //     // Получаем настройки приема пищи от отеля для расчета нового плана питания.
    //     const hotel = await prisma.hotel.findUnique({
    //       where: { id: oldRequest.hotelId },
    //       select: {
    //         breakfast: true,
    //         lunch: true,
    //         dinner: true
    //       }
    //     })
    //     const mealTimes = {
    //       breakfast: hotel.breakfast,
    //       lunch: hotel.lunch,
    //       dinner: hotel.dinner
    //     }
    //     const calculatedMealPlan = calculateMeal(
    //       updatedStart,
    //       updatedEnd,
    //       mealTimes,
    //       enabledMeals
    //     )
    //     mealPlanData = {
    //       included: oldRequest.mealPlan.included,
    //       breakfast: calculatedMealPlan.totalBreakfast,
    //       breakfastEnabled: enabledMeals.breakfast,
    //       lunch: calculatedMealPlan.totalLunch,
    //       lunchEnabled: enabledMeals.lunch,
    //       dinner: calculatedMealPlan.totalDinner,
    //       dinnerEnabled: enabledMeals.dinner,
    //       dailyMeals: calculatedMealPlan.dailyMeals
    //     }

    //     // Обновляем связанные данные hotelChess с новыми датами.

    //     const updatedHotelChess = await prisma.hotelChess.update({
    //       where: { id: oldRequest.hotelChess[0].id },
    //       data: { start: updatedStart, end: updatedEnd, mealPlan: mealPlanData }
    //     })
    //     pubsub.publish(HOTEL_UPDATED, { hotelUpdated: updatedHotelChess })
    //   }
    //   dataToUpdate.mealPlan = mealPlanData
    //   // Обновление заявки в базе данных
    //   const updatedRequest = await prisma.request.update({
    //     where: { id },
    //     data: dataToUpdate,
    //     include: {
    //       hotelChess: true,
    //       person: true
    //     }
    //   })

    //   // Логирование изменения заявки
    //   try {
    //     await logAction({
    //       context,
    //       action: "update_request",
    //       description: `Пользователь <span style='color:#545873'>${
    //         user.name
    //       }</span> изменил заявку <span style='color:#545873'> № ${
    //         updatedRequest.requestNumber
    //       }</span> для <span style='color:#545873'>${
    //         updatedRequest.person.position
    //       } ${
    //         updatedRequest.person.name
    //       }</span> c <span style='color:#545873'>${formatDate(
    //         oldRequest.arrival
    //       )} - ${formatDate(
    //         oldRequest.departure
    //       )}</span> до <span style='color:#545873'>${
    //         formatDate(arrival) || formatDate(oldRequest.arrival)
    //       } - ${
    //         formatDate(departure) || formatDate(oldRequest.departure)
    //       }</span>`,
    //       requestId: updatedRequest.id
    //     })
    //   } catch (error) {
    //     console.error("Ошибка при логировании изменения заявки:", error)
    //   }
    //   // Публикация события обновления заявки
    //   pubsub.publish(REQUEST_UPDATED, { requestUpdated: updatedRequest })
    //   return updatedRequest
    // },

    // ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

    // updateRequest: async (_, { id, input }, context) => {
    //   const { user } = context
    //   console.log(`Request update`)
    //   moderatorMiddleware(context)
    //   const {
    //     personId, // Добавили personId в параметры
    //     airportId,
    //     arrival,
    //     departure,
    //     roomCategory,
    //     mealPlan,
    //     hotelId,
    //     hotelChessId,
    //     roomNumber,
    //     status
    //   } = input
    //   // Получаем старую заявку
    //   const oldRequest = await prisma.request.findUnique({
    //     where: { id },
    //     include: {
    //       hotelChess: true,
    //       hotel: true,
    //       person: true
    //     }
    //   })
    //   if (!oldRequest) {
    //     throw new Error("Request not found")
    //   }
    //   const dataToUpdate = {
    //     airport: airportId ? { connect: { id: airportId } } : undefined,
    //     arrival: arrival ? new Date(arrival) : undefined,
    //     departure: departure ? new Date(departure) : undefined,
    //     roomCategory,
    //     roomNumber,
    //     status
    //   }
    //   if (personId) {
    //     dataToUpdate.person = { connect: { id: personId } }
    //   }
    //   if (hotelId) {
    //     dataToUpdate.hotel = { connect: { id: hotelId } }
    //   }
    //   if (hotelChessId) {
    //     dataToUpdate.hotelChess = { connect: { id: hotelChessId } }
    //   }
    //   // Обновление заявки в базе данных
    //   const updatedRequest = await prisma.request.update({
    //     where: { id },
    //     data: dataToUpdate,
    //     include: {
    //       hotelChess: true,
    //       person: true
    //     }
    //   })

    //   const mailOptions = {
    //     from: `${process.env.EMAIL_USER}`,
    //     to: `${process.env.EMAIL_RESIEVER}`,
    //     subject: "Request created",
    //     html: `Пользователь <span style='color:#545873'>${user.name}</span> изменил заявку <span style='color:#545873'>№${updatedRequest.requestNumber}</span>`
    //   }

    //   // Отправка письма через настроенный транспортёр
    //   await transporter.sendMail(mailOptions)

    //   // Логирование изменения заявки
    //   try {
    //     await logAction({
    //       context,
    //       action: "update_request",
    //       description: `Пользователь <span style='color:#545873'>${
    //         user.name
    //       }</span>
    //         изменил заявку <span style='color:#545873'> № ${
    //           updatedRequest.requestNumber
    //         }</span>
    //         ${
    //           updatedRequest.person
    //             ? `для <span style='color:#545873'>${updatedRequest.person.position} ${updatedRequest.person.name}</span>`
    //             : ""
    //         }
    //         c <span style='color:#545873'>${formatDate(
    //           oldRequest.arrival
    //         )} - ${formatDate(oldRequest.departure)}</span>
    //         до <span style='color:#545873'>${
    //           formatDate(arrival) || formatDate(oldRequest.arrival)
    //         } - ${
    //         formatDate(departure) || formatDate(oldRequest.departure)
    //       }</span>`,
    //       requestId: updatedRequest.id
    //     })
    //   } catch (error) {
    //     console.error("Ошибка при логировании изменения заявки:", error)
    //   }
    //   // Публикация события обновления заявки
    //   pubsub.publish(REQUEST_UPDATED, { requestUpdated: updatedRequest })
    //   return updatedRequest
    // },

    updateRequest: async (_, { id, input }, context) => {
      const { user } = context
      // airlineModerMiddleware(context)
      moderatorMiddleware(context)

      const currentTime = new Date()
      const adjustedTime = new Date(currentTime.getTime() + 3 * 60 * 60 * 1000)
      const formattedTime = adjustedTime.toISOString()

      const newStart = input.arrival
      const newEnd = input.departure
      const status = input.status

      // const { newStart, newEnd, status } = input
      const requestId = id
      const request = await prisma.request.findUnique({
        where: { id: requestId },
        include: {
          hotelChess: true,
          hotel: true,
          mealPlan: true,
          chat: true,
          airline: true
        }
      })
      if (!request) {
        throw new Error("Request not found")
      }

      // Инициализация переменной newMealPlan
      // let newMealPlan = null
      if (input.personId) {
        await prisma.request.update({
          where: { id: requestId },
          data: {
            person: { connect: { id: input.personId } }
          },
          include: {
            hotelChess: true,
            person: true
          }
        })

        if (request.hotelChess) {
          await prisma.hotelChess.update({
            where: { id: request.hotelChess[0].id },
            data: { client: { connect: { id: input.personId } } }
          })
        }
      }

      // Если пользователь связан с авиалинией и статус заявки не "created",
      // создаётся запрос на изменение дат через чат для уведомления диспетчера.
      if (user.airlineId && request.status != "created") {
        const extendRequest = {
          requestId,
          newStart,
          newEnd
        }
        const updatedStart = newStart ? newStart : request.arrival
        const updatedEnd = newEnd ? newEnd : request.departure
        const chat = await prisma.chat.findFirst({
          where: { requestId: requestId, separator: "airline" }
        })
        const message = await prisma.message.create({
          data: {
            text: `Запрос на изменение дат заявки ${
              request.requestNumber
            } с ${formatDate(request.arrival)} - ${formatDate(
              request.departure
            )} на ${formatDate(updatedStart)} - ${formatDate(updatedEnd)}`,
            sender: { connect: { id: user.id } },
            chat: { connect: { id: chat.id } },
            separator: "important",
            createdAt: formattedTime
          },
          include: {
            sender: {
              select: {
                id: true,
                name: true,
                number: true,
                images: true,
                role: true,
                position: true,
                airlineId: true,
                airlineDepartmentId: true,
                hotelId: true,
                dispatcher: true
              }
            }
          }
        })
        await prisma.notification.create({
          data: {
            request: { connect: { id: extendRequest.id } },
            airlineId: extendRequest.airlineId,
            description: {
              action: "extend_request",
              description: `Запрос на изменение дат заявки ${
                request.requestNumber
              } с ${formatDate(request.arrival)} - ${formatDate(
                request.departure
              )} на ${formatDate(updatedStart)} - ${formatDate(updatedEnd)}`
            }
          }
        })
        const mailOptions = {
          from: `${process.env.EMAIL_USER}`,
          to: `${process.env.EMAIL_RESIEVER}`,
          subject: "Request updated",
          html: `Пользователь <span style='color:#545873'>${
            user.name
          }</span> отправил запрос на изменение дат заявки <span style='color:#545873'>№${
            extendRequest.requestNumber
          }</span> с ${formatDate(request.arrival)} - ${formatDate(
            request.departure
          )} на ${formatDate(updatedStart)} - ${formatDate(updatedEnd)}`
        }

        // Отправка письма через настроенный транспортёр
        await transporter.sendMail(mailOptions)

        pubsub.publish(NOTIFICATION, {
          notification: {
            __typename: "ExtendRequestNotification",
            ...extendRequest
          }
        })
        pubsub.publish(`${MESSAGE_SENT}_${chat.id}`, { messageSent: message })
        return request
      }

      // Если пользователь диспетчер, обновляем даты и план питания.
      const updatedStart = newStart ? newStart : request.arrival
      const updatedEnd = newEnd ? newEnd : request.departure

      const enabledMeals = {
        breakfast: request.mealPlan?.breakfastEnabled,
        lunch: request.mealPlan?.lunchEnabled,
        dinner: request.mealPlan?.dinnerEnabled
      }
      let mealPlanData = request.mealPlan
      if (request.hotelChess && request.hotelChess.length != 0) {
        // Получаем настройки приема пищи от отеля для расчета нового плана питания.
        const hotel = await prisma.hotel.findUnique({
          where: { id: request.hotelId },
          select: {
            breakfast: true,
            lunch: true,
            dinner: true
          }
        })
        const mealTimes = {
          breakfast: hotel.breakfast,
          lunch: hotel.lunch,
          dinner: hotel.dinner
        }
        const calculatedMealPlan = calculateMeal(
          updatedStart,
          updatedEnd,
          mealTimes,
          enabledMeals
        )
        mealPlanData = {
          included: request.mealPlan.included,
          breakfast: calculatedMealPlan.totalBreakfast,
          breakfastEnabled: enabledMeals.breakfast,
          lunch: calculatedMealPlan.totalLunch,
          lunchEnabled: enabledMeals.lunch,
          dinner: calculatedMealPlan.totalDinner,
          dinnerEnabled: enabledMeals.dinner,
          dailyMeals: calculatedMealPlan.dailyMeals
        }

        // Обновляем связанные данные hotelChess с новыми датами.

        const updatedHotelChess = await prisma.hotelChess.update({
          where: { id: request.hotelChess[0].id },
          data: { start: updatedStart, end: updatedEnd, mealPlan: mealPlanData }
        })
        pubsub.publish(HOTEL_UPDATED, { hotelUpdated: updatedHotelChess })
      }
      // Обновляем заявку с новыми датами, пересчитанным планом питания и измененным статусом.
      const updatedRequest = await prisma.request.update({
        where: { id: requestId },
        data: {
          arrival: updatedStart,
          departure: updatedEnd,
          mealPlan: mealPlanData,
          status: status,
          ...input
        },
        include: {
          hotelChess: true,
          person: true
        }
      })

      const mailOptions = {
        from: `${process.env.EMAIL_USER}`,
        to: `${process.env.EMAIL_RESIEVER}`,
        subject: "Request updated",
        html: `Пользователь <span style='color:#545873'>${
          user.name
        }</span> изменил ${
          updatedRequest.person
            ? `заявку <span style='color:#545873'> № ${updatedRequest.requestNumber}</span> для <span style='color:#545873'> ${updatedRequest.person.position} ${updatedRequest.person.name}</span>`
            : `предварительную бронь <span style='color:#545873'> № ${updatedRequest.requestNumber}</span>`
        } c <span style='color:#545873'>${formatDate(
          request.arrival
        )} - ${formatDate(
          request.departure
        )}</span> до <span style='color:#545873'>${formatDate(
          updatedStart
        )} - ${formatDate(updatedEnd)}</span>`
      }

      // Отправка письма через настроенный транспортёр
      await transporter.sendMail(mailOptions)

      try {
        await logAction({
          context,
          action: "update_request",
          description: `Пользователь <span style='color:#545873'>${
            user.name
          }</span> изменил ${
            updatedRequest.person
              ? `заявку <span style='color:#545873'> № ${updatedRequest.requestNumber}</span> для <span style='color:#545873'> ${updatedRequest.person.position} ${updatedRequest.person.name}</span>`
              : `предварительную бронь <span style='color:#545873'> № ${updatedRequest.requestNumber}</span>`
          } c <span style='color:#545873'>${formatDate(
            request.arrival
          )} - ${formatDate(
            request.departure
          )}</span> до <span style='color:#545873'>${formatDate(
            updatedStart
          )} - ${formatDate(updatedEnd)}</span>`,
          requestId: updatedRequest.id
        })
      } catch (error) {
        console.error("Ошибка при логировании изменения заявки:", error)
      }

      pubsub.publish(REQUEST_UPDATED, { requestUpdated: updatedRequest })
      return updatedRequest
    },

    // Изменение ежедневного плана питания заявки.
    // Вызывает функцию updateDailyMeals для обновления плана питания и логирует действие.
    modifyDailyMeals: async (_, { input }, context) => {
      const { user } = context
      const { requestId, dailyMeals } = input
      const request = await prisma.request.findUnique({
        where: { id: requestId },
        select: { id: true, requestNumber: true }
      })
      if (!request) {
        throw new Error("Request not found")
      }
      const updatedMealPlan = await updateDailyMeals(requestId, dailyMeals)
      try {
        await logAction({
          context,
          action: "update_request",
          description: `Пользователь <span style='color:#545873'>${user.name}</span> изменил питание для заявки<span style='color:#545873'> № ${request.requestNumber}</span>`,
          requestId: request.id
        })
      } catch (error) {
        console.error("Ошибка при логировании изменения питания заявки:", error)
      }
      pubsub.publish(REQUEST_UPDATED, { requestUpdated: updatedMealPlan })
      return updatedMealPlan
    },

    // Продление дат заявки.
    // Если пользователь не диспетчер и связан с авиалинией, отправляется уведомление диспетчеру через чат.
    // Если диспетчер, обновляются даты в hotelChess, пересчитывается план питания и обновляется заявка.
    extendRequestDates: async (_, { input }, context) => {
      const { user } = context
      // airlineModerMiddleware(context)
      moderatorMiddleware(context)

      const currentTime = new Date()
      const adjustedTime = new Date(currentTime.getTime() + 3 * 60 * 60 * 1000)
      const formattedTime = adjustedTime.toISOString()

      const { requestId, newStart, newEnd, status } = input
      const request = await prisma.request.findUnique({
        where: { id: requestId },
        include: {
          hotelChess: true,
          hotel: true,
          mealPlan: true,
          chat: true,
          airline: true
        }
      })
      if (!request) {
        throw new Error("Request not found")
      }

      // Инициализация переменной newMealPlan
      // let newMealPlan = null

      // Если пользователь связан с авиалинией и статус заявки не "created",
      // создаётся запрос на изменение дат через чат для уведомления диспетчера.
      if (user.airlineId && request.status != "created") {
        const extendRequest = {
          requestId,
          newStart,
          newEnd
        }
        const updatedStart = newStart ? newStart : request.arrival
        const updatedEnd = newEnd ? newEnd : request.departure
        const chat = await prisma.chat.findFirst({
          where: { requestId: requestId, separator: "airline" }
        })
        const message = await prisma.message.create({
          data: {
            text: `Запрос на изменение дат заявки ${
              request.requestNumber
            } с ${formatDate(request.arrival)} - ${formatDate(
              request.departure
            )} на ${formatDate(updatedStart)} - ${formatDate(updatedEnd)}`,
            sender: { connect: { id: user.id } },
            chat: { connect: { id: chat.id } },
            separator: "important",
            createdAt: formattedTime
          },
          include: {
            sender: {
              select: {
                id: true,
                name: true,
                number: true,
                images: true,
                role: true,
                position: true,
                airlineId: true,
                airlineDepartmentId: true,
                hotelId: true,
                dispatcher: true
              }
            }
          }
        })
        await prisma.notification.create({
          data: {
            request: { connect: { id: extendRequest.id } },
            airlineId: extendRequest.airlineId,
            description: {
              action: "extend_request",
              description: `Запрос на изменение дат заявки ${
                request.requestNumber
              } с ${formatDate(request.arrival)} - ${formatDate(
                request.departure
              )} на ${formatDate(updatedStart)} - ${formatDate(updatedEnd)}`
            }
          }
        })
        const mailOptions = {
          from: `${process.env.EMAIL_USER}`,
          to: `${process.env.EMAIL_RESIEVER}`,
          subject: "Request updated",
          html: `Пользователь <span style='color:#545873'>${
            user.name
          }</span> отправил запрос на изменение дат заявки <span style='color:#545873'>№${
            extendRequest.requestNumber
          }</span> с ${formatDate(request.arrival)} - ${formatDate(
            request.departure
          )} на ${formatDate(updatedStart)} - ${formatDate(updatedEnd)}`
        }

        // Отправка письма через настроенный транспортёр
        await transporter.sendMail(mailOptions)

        pubsub.publish(NOTIFICATION, {
          notification: {
            __typename: "ExtendRequestNotification",
            ...extendRequest
          }
        })
        pubsub.publish(`${MESSAGE_SENT}_${chat.id}`, { messageSent: message })
        return request
      }

      // Если пользователь диспетчер, обновляем даты и план питания.
      const updatedStart = newStart ? newStart : request.arrival
      const updatedEnd = newEnd ? newEnd : request.departure

      const enabledMeals = {
        breakfast: request.mealPlan?.breakfastEnabled,
        lunch: request.mealPlan?.lunchEnabled,
        dinner: request.mealPlan?.dinnerEnabled
      }
      let mealPlanData = request.mealPlan
      if (request.hotelChess && request.hotelChess.length != 0) {
        // Получаем настройки приема пищи от отеля для расчета нового плана питания.
        const hotel = await prisma.hotel.findUnique({
          where: { id: request.hotelId },
          select: {
            breakfast: true,
            lunch: true,
            dinner: true
          }
        })
        const mealTimes = {
          breakfast: hotel.breakfast,
          lunch: hotel.lunch,
          dinner: hotel.dinner
        }
        const calculatedMealPlan = calculateMeal(
          updatedStart,
          updatedEnd,
          mealTimes,
          enabledMeals
        )
        mealPlanData = {
          included: request.mealPlan.included,
          breakfast: calculatedMealPlan.totalBreakfast,
          breakfastEnabled: enabledMeals.breakfast,
          lunch: calculatedMealPlan.totalLunch,
          lunchEnabled: enabledMeals.lunch,
          dinner: calculatedMealPlan.totalDinner,
          dinnerEnabled: enabledMeals.dinner,
          dailyMeals: calculatedMealPlan.dailyMeals
        }

        // Обновляем связанные данные hotelChess с новыми датами.

        const updatedHotelChess = await prisma.hotelChess.update({
          where: { id: request.hotelChess[0].id },
          data: { start: updatedStart, end: updatedEnd, mealPlan: mealPlanData }
        })
        pubsub.publish(HOTEL_UPDATED, { hotelUpdated: updatedHotelChess })
      }
      // Обновляем заявку с новыми датами, пересчитанным планом питания и измененным статусом.
      const updatedRequest = await prisma.request.update({
        where: { id: requestId },
        data: {
          arrival: updatedStart,
          departure: updatedEnd,
          mealPlan: mealPlanData,
          status: status
        },
        include: {
          hotelChess: true,
          person: true
        }
      })

      const mailOptions = {
        from: `${process.env.EMAIL_USER}`,
        to: `${process.env.EMAIL_RESIEVER}`,
        subject: "Request updated",
        html: `Пользователь <span style='color:#545873'>${
          user.name
        }</span> изменил заявку <span style='color:#545873'> № ${
          updatedRequest.requestNumber
        }</span> для <span style='color:#545873'>${
          updatedRequest.person
            ? `${updatedRequest.person.position} ${updatedRequest.person.name}`
            : "Предварительная бронь"
        }</span> c <span style='color:#545873'>${formatDate(
          request.arrival
        )} - ${formatDate(
          request.departure
        )}</span> до <span style='color:#545873'>${formatDate(
          updatedStart
        )} - ${formatDate(updatedEnd)}</span>`
      }

      // Отправка письма через настроенный транспортёр
      await transporter.sendMail(mailOptions)

      try {
        await logAction({
          context,
          action: "update_request",
          description: `Пользователь <span style='color:#545873'>${
            user.name
          }</span> изменил заявку <span style='color:#545873'> № ${
            updatedRequest.requestNumber
          }</span> для <span style='color:#545873'>${
            updatedRequest.person
              ? `${updatedRequest.person.position} ${updatedRequest.person.name}`
              : "Предварительная бронь"
          }</span> c <span style='color:#545873'>${formatDate(
            request.arrival
          )} - ${formatDate(
            request.departure
          )}</span> до <span style='color:#545873'>${formatDate(
            updatedStart
          )} - ${formatDate(updatedEnd)}</span>`,
          requestId: updatedRequest.id
        })
      } catch (error) {
        console.error("Ошибка при логировании изменения заявки:", error)
      }

      pubsub.publish(REQUEST_UPDATED, { requestUpdated: updatedRequest })
      return updatedRequest
    },

    // Архивация заявки.
    // Если дата отбытия меньше текущей и статус заявки не "archived", меняем статус на "archived".
    archivingRequest: async (_, input, context) => {
      const { user } = context
      dispatcherModerMiddleware(context)
      const requestId = input.id
      const request = await prisma.request.findUnique({
        where: { id: requestId }
      })
      if (
        new Date(request.departure) < new Date() &&
        request.status !== "archived"
      ) {
        const archiveRequest = await prisma.request.update({
          where: { id: requestId },
          data: { status: "archived", archive: true }
        })
        await logAction({
          context,
          action: "archive_request",
          description: `Пользователь <span style='color:#545873'>${user.name}</span> отправил заявку <span style='color:#545873'>№ ${archiveRequest.requestNumber}</span> в архив`,
          oldData: request,
          newData: { status: "archived" },
          hotelId: request.hotelId,
          requestId: request.id
        })
        pubsub.publish(REQUEST_UPDATED, { requestUpdated: archiveRequest })
        return archiveRequest
      } else {
        throw new Error("Request is not expired or already archived")
      }
    },

    // Отмена заявки.
    // Обновляем статус заявки на "canceled", удаляем связанные hotelChess и логируем действие.
    cancelRequest: async (_, input, context) => {
      const { user } = context
      airlineModerMiddleware(context)
      const requestId = input.id
      const request = await prisma.request.findUnique({
        where: { id: requestId },
        include: { hotelChess: true }
      })

      if (user.airlineId && request.status != "created") {
        const currentTime = new Date()
        const adjustedTime = new Date(
          currentTime.getTime() + 3 * 60 * 60 * 1000
        )
        const formattedTime = adjustedTime.toISOString()

        const chat = await prisma.chat.findFirst({
          where: { requestId: requestId, separator: "airline" }
        })
        const message = await prisma.message.create({
          data: {
            text: `Запрос на отмену заявки`,
            sender: { connect: { id: user.id } },
            chat: { connect: { id: chat.id } },
            separator: "important",
            createdAt: formattedTime
          },
          include: {
            sender: {
              select: {
                id: true,
                name: true,
                number: true,
                images: true,
                role: true,
                position: true,
                airlineId: true,
                airlineDepartmentId: true,
                hotelId: true,
                dispatcher: true
              }
            }
          }
        })
        await prisma.notification.create({
          data: {
            request: { connect: { id: request.id } },
            airlineId: request.airlineId,
            description: {
              action: "cancel_request",
              description: `Пользователь <span style='color:#545873'>${user.name}</span> отправил запрос на отмену заявки № <span style='color:#545873'>${request.requestNumber}</span>`
            }
          }
        })

        const mailOptions = {
          from: `${process.env.EMAIL_USER}`,
          to: `${process.env.EMAIL_RESIEVER}`,
          subject: "Request cancelled",
          html: `Пользователь <span style='color:#545873'>${user.name}</span> отпраил запрос на отмену заявки <span style='color:#545873'>№${request.requestNumber}</span>`
        }

        // Отправка письма через настроенный транспортёр
        await transporter.sendMail(mailOptions)

        pubsub.publish(NOTIFICATION, {
          notification: {
            __typename: "ExtendRequestNotification",
            ...request
          }
        })
        pubsub.publish(`${MESSAGE_SENT}_${chat.id}`, { messageSent: message })
      }

      const canceledRequest = await prisma.request.update({
        where: { id: requestId },
        data: { status: "canceled" }
      })
      if (request.hotelChess) {
        await prisma.hotelChess.deleteMany({
          where: { requestId: requestId }
        })
      }

      const mailOptions = {
        from: `${process.env.EMAIL_USER}`,
        to: `${process.env.EMAIL_RESIEVER}`,
        subject: "Request canceled",
        html: `Пользователь <span style='color:#545873'>${user.name}</span> отменил заявку <span style='color:#545873'>№${canceledRequest.requestNumber}</span>`
      }

      // Отправка письма через настроенный транспортёр
      await transporter.sendMail(mailOptions)

      await logAction({
        context,
        action: "cancel_request",
        description: `Пользователь <span style='color:#545873'>${user.name}</span> отменил заявку № <span style='color:#545873'>${canceledRequest.requestNumber}</span>`,
        oldData: request,
        newData: { status: "canceled" },
        hotelId: request.hotelId,
        requestId: request.id
      })
      pubsub.publish(REQUEST_UPDATED, { requestUpdated: canceledRequest })
      return canceledRequest
    }
  },

  Subscription: {
    // Подписка на событие создания заявки
    // requestCreated: {
    //   subscribe: () => pubsub.asyncIterator([REQUEST_CREATED])
    // },

    requestCreated: {
      subscribe: withFilter(
        () => pubsub.asyncIterator(REQUEST_CREATED),
        (payload, variables, context) => {
          const user = context.user
          if (user.dispatcher === true) {
            return true
          }
          if (
            user.airlineId &&
            user.airlineId === payload.requestCreated.airlineId
          ) {
            return true
          }
          return false
        }
      )
    },

    // Подписка на событие обновления заявки
    requestUpdated: {
      subscribe: withFilter(
        () => pubsub.asyncIterator(REQUEST_UPDATED),
        (payload, variables, context) => {
          const user = context.user
          if (user.dispatcher === true) {
            return true
          }
          if (
            user.airlineId &&
            user.airlineId === payload.requestUpdated.airlineId
          ) {
            return true
          }
          if (user.hotelId && user.hotelId === payload.requestUpdated.hotelId) {
            return true
          }
          return false
        }
      )
    },
    // Подписка на уведомления
    notification: {
      subscribe: () => pubsub.asyncIterator([NOTIFICATION])
    }
  },

  // Резольверы для полей типа Request,
  // обеспечивающие получение связанных сущностей: аэропорт, авиалиния, отель, hotelChess, сотрудник и чат.
  Request: {
    // Получение аэропорта по ID, указанному в заявке.
    airport: async (parent) => {
      return await prisma.airport.findUnique({
        where: { id: parent.airportId }
      })
    },
    // Получение авиалинии по ID, указанному в заявке.
    airline: async (parent) => {
      return await prisma.airline.findUnique({
        where: { id: parent.airlineId }
      })
    },
    // Получение отеля, связанного с заявкой (если задан).
    hotel: async (parent) => {
      if (!parent.hotelId) return null
      return await prisma.hotel.findUnique({
        where: { id: parent.hotelId }
      })
    },
    // Получение первой записи hotelChess, связанной с данной заявкой.
    hotelChess: async (parent) => {
      return await prisma.hotelChess.findFirst({
        where: { requestId: parent.id }
      })
    },
    // Получение данных сотрудника авиакомпании, к которому привязана заявка.
    person: async (parent) => {
      if (parent.personId) {
        return await prisma.airlinePersonal.findUnique({
          where: { id: parent.personId }
        })
      } else {
        return null
      }
    },
    // // Получение чатов, связанных с данной заявкой.
    // chat: async (parent) => {
    //   return await prisma.chat.findMany({
    //     where: { requestId: parent.id }
    //   })
    // },
    // Получение логов по заявке с информацией о пользователе, выполнившем действие.
    // logs: async (parent) => {
    //   return await prisma.log.findMany({
    //     where: { requestId: parent.id },
    //     include: { user: true }
    //   })
    // }
    logs: async (parent, { pagination }) => {
      const { skip, take } = pagination || {}

      const totalCount = await prisma.log.count({
        where: { requestId: parent.id }
      })

      const logs = await prisma.log.findMany({
        where: { requestId: parent.id },
        include: { user: true },
        skip,
        take,
        orderBy: { createdAt: "desc" } // сортируем от новых к старым
      })

      const totalPages = Math.ceil(totalCount / take)

      return { totalCount, totalPages, logs }
    }
  }
}

export default requestResolver

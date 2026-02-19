// Импорт необходимых модулей и утилит
import { prisma } from "../../prisma.js"
import GraphQLUpload from "graphql-upload/GraphQLUpload.mjs"
import logAction from "../../services/infra/logaction.js"
import {
  HOTEL_UPDATED,
  MESSAGE_SENT,
  NOTIFICATION,
  pubsub,
  RESERVE_CREATED,
  RESERVE_HOTEL,
  RESERVE_PERSONS,
  RESERVE_UPDATED
} from "../../services/infra/pubsub.js"
import { withFilter } from "graphql-subscriptions"
import calculateMeal from "../../services/meal/calculateMeal.js"
import updateDailyMeals from "../../services/meal/updateDailyMeals.js"
import {
  airlineAdminMiddleware,
  airlineModerMiddleware,
  allMiddleware,
  dispatcherModerMiddleware
} from "../../middlewares/authMiddleware.js"
import { uploadFiles, deleteFiles } from "../../services/files/uploadFiles.js"
import { formatDate } from "../../services/format/dateTimeFormater.js"
import {
  generateReserveExcel
} from "../../services/reserve/generateReservePas.js"
import path from "path"
import fs from "fs"

// Резольвер для работы с резервами (reserve)
const reserveResolver = {
  // Определяем тип Upload для работы с загрузкой файлов через GraphQL
  Upload: GraphQLUpload,

  Query: {
    // Получение списка резервов с пагинацией и фильтрацией по статусу.
    // Включаются связанные данные: airline, airport, пассажиры, hotel, hotelChess, chat, logs.
    reserves: async (_, { pagination }, context) => {
      await allMiddleware(context)
      const { skip, take, status } = pagination
      // Если статус не указан или содержит "all", фильтр по статусу не применяется.
      const statusFilter =
        !status || status.length === 0 || status.includes("all")
          ? {}
          : { status: { in: status } }

      // Подсчет общего количества резервов с учетом фильтра.
      const totalCount = await prisma.reserve.count({
        where: {
          ...statusFilter
          // archive: { not: true }, // (Закомментировано) Исключение архивных записей.
        }
      })
      const totalPages = Math.ceil(totalCount / take)

      // Получение списка резервов с пагинацией и сортировкой по дате создания (по убыванию)
      const reserves = await prisma.reserve.findMany({
        where: {
          ...statusFilter
          // archive: { not: true },
        },
        skip: skip * take,
        take: take,
        include: {
          airline: true,
          airport: true,
          // person: true, // (Закомментировано)
          passengers: true,
          hotel: true,
          hotelChess: true,
          chat: true
          // logs: true
        },
        orderBy: { createdAt: "desc" }
      })
      return {
        totalCount,
        reserves,
        totalPages
      }
    },

    // Получение архивных резервов (archive: true). Доступно только администраторам авиалиний.
    reserveArchive: async (_, { pagination }, context) => {
      await airlineAdminMiddleware(context)
      const { skip, take, status } = pagination
      const statusFilter =
        status && status.includes("all") ? {} : { status: { in: status } }

      const totalCount = await prisma.reserve.count({
        where: {
          ...statusFilter,
          archive: true
        }
      })
      const totalPages = Math.ceil(totalCount / take)
      const reserves = await prisma.reserve.findMany({
        where: {
          ...statusFilter,
          archive: true
        },
        skip: skip * take,
        take: take,
        include: {
          airline: true,
          airport: true,
          // person: true,
          passengers: true,
          hotel: true,
          hotelChess: true,
          chat: true,
          logs: true
        },
        orderBy: { createdAt: "desc" }
      })
      return {
        totalCount,
        reserves,
        totalPages
      }
    },

    // Получение одного резерва по ID с включением всех связанных данных.
    reserve: async (_, { id }, context) => {
      await allMiddleware(context)
      const reserve = await prisma.reserve.findUnique({
        where: { id },
        include: {
          airline: true,
          airport: true,
          // person: true,
          passengers: true,
          hotel: true,
          hotelChess: true,
          chat: true,
          logs: true
        }
      })
      if (!reserve) {
        throw new Error("Reserve not found")
      }
      const { user } = context
      // Если пользователь не диспетчер и не привязан к отелю – возвращаем резерв как есть.
      if (!user.dispatcher && !user.hotelId) {
        return reserve
      }
      // Если резерв имеет статус "created", обновляем его на "opened" и логируем событие.
      if (reserve.status === "created") {
        const updatedReserve = await prisma.reserve.update({
          where: { id },
          data: { status: "opened" }
        })
        const existingLog = await prisma.log.findFirst({
          where: {
            action: "open_reserve",
            reserveId: updatedReserve.id
          }
        })
        if (!existingLog) {
          try {
            await logAction({
              context,
              action: "open_reserve",
              description: `Заявка № <span style='color:#545873'>${updatedReserve.reserveNumber}</span> открыта пользователем <span style='color:#545873'>${user.name}</span>`,
              oldData: { status: "created" },
              newData: { status: "opened" },
              reserveId: updatedReserve.id
            })
          } catch (error) {
            console.error("Ошибка при логировании открытия заявки:", error)
          }
        }
        pubsub.publish(RESERVE_UPDATED, { reserveUpdated: updatedReserve })
        return updatedReserve
      }
      return reserve
    },

    // Получение списка резервных отелей (reserveHotel) для данного резерва по его ID.
    reservationHotels: async (_, { id }, context) => {
      await allMiddleware(context)
      return await prisma.reserveHotel.findMany({
        where: { reserveId: id },
        include: {
          reserve: true,
          hotel: true,
          // person: true,
          passengers: true,
          hotelChess: true
        }
      })
    },

    // Получение одного резервного отеля (reserveHotel) по его ID.
    reservationHotel: async (_, { id }, context) => {
      await allMiddleware(context)
      return await prisma.reserveHotel.findUnique({
        where: { id },
        include: {
          reserve: true,
          hotel: true,
          // person: true,
          passengers: true,
          hotelChess: true
        }
      })
    },

    // Получение списка пассажиров, связанных с резервом по ID резерва.
    reservationPassengers: async (_, { reservationId }, context) => {
      await allMiddleware(context)
      return await prisma.passenger.findMany({
        where: { reserveId: reservationId },
        include: {
          // person: true,
          hotel: true
        }
      })
    }
  },

  Mutation: {
    // Создание нового резерва.
    // Здесь генерируется уникальный номер резерва, выполняется загрузка файлов,
    // создается чат для резерва и происходит логирование действия.
    createReserve: async (_, { input, files }, context) => {
      // console.log("\n createReserve log")
      // process.stdout.write(`\n createReserve stdout `)
      const { user } = context
      await airlineModerMiddleware(context)
      const {
        airportId,
        arrival,
        departure,
        mealPlan,
        airlineId,
        senderId,
        status,
        passengers,
        passengerCount
      } = input

      // Определяем текущий месяц и год для формирования номера резерва.
      const currentDate = new Date()
      const month = String(currentDate.getMonth() + 1).padStart(2, "0") // двузначный номер месяца
      const year = String(currentDate.getFullYear()).slice(-2)

      // Определяем границы месяца для поиска последнего резерва.
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

      // Находим последний созданный резерв в этом месяце.
      const lastreserve = await prisma.reserve.findFirst({
        where: { createdAt: { gte: startOfMonth, lte: endOfMonth } },
        orderBy: { createdAt: "desc" }
      })

      // Формирование последовательного номера резерва.
      let sequenceNumber
      if (lastreserve) {
        // Если резервы уже существуют, увеличиваем номер.
        const lastNumber = parseInt(lastreserve.reserveNumber.slice(0, 4), 10)
        sequenceNumber = String(lastNumber + 1).padStart(4, "0")
      } else {
        // Если резерва ещё не было, начинаем с "0001".
        sequenceNumber = "0001"
      }

      // Получаем данные об аэропорте для формирования номера резерва.
      const airport = await prisma.airport.findUnique({
        where: { id: airportId }
      })
      if (!airport) {
        throw new Error("Airport not found")
      }

      // Формирование номера резерва: номер + код аэропорта + месяц + год + буква "p".
      const reserveNumber = `${sequenceNumber}${airport.code}${month}${year}p`

      // Обработка загрузки файлов.
      let filesPath = []
      if (files && files.length > 0) {
        for (const file of files) {
          const uploadedPath = await uploadFiles(file)
          filesPath.push(uploadedPath)
        }
      }

      // Создание нового резерва с подключением связанных сущностей.
      const newReserve = await prisma.reserve.create({
        data: {
          airport: { connect: { id: airportId } },
          arrival,
          departure,
          mealPlan,
          airline: { connect: { id: airlineId } },
          sender: { connect: { id: senderId } },
          status,
          reserveNumber,
          passengers,
          passengerCount,
          files: filesPath
        },
        include: {
          airline: true,
          airport: true,
          passengers: true,
          hotel: true,
          hotelChess: true,
          chat: true
        }
      })

      // Создание чата для резерва, связанного с авиалинией.
      const newChat = await prisma.chat.create({
        data: {
          reserve: { connect: { id: newReserve.id } },
          separator: "airline",
          airline: { connect: { id: airlineId } }
        }
      })
      // Добавление отправителя в чат.
      await prisma.chatUser.create({
        data: {
          chat: { connect: { id: newChat.id } },
          user: { connect: { id: senderId } }
        }
      })

      // Логирование действия создания резерва.
      await logAction({
        context,
        action: "create_reserve",
        description: `Пользователь <span style='color:#545873'>${user.name}</span> создал заявку № <span style='color:#545873'>${newReserve.reserveNumber}</span> в аэропорт <span style='color:#545873'>${newReserve.airport.name}</span>`,
        reserveId: newReserve.id,
        airlineId: newReserve.airlineId
      })
      // Публикация уведомления и события создания резерва.
      await prisma.notification.create({
        data: {
          reserve: { connect: { id: newReserve.id } },
          airline: { connect: { id: airlineId } },
          description: {
            action: "create_reserve",
            description: `Создана заявка <span style='color:#545873'>${newReserve.reserveNumber}</span> в аэропорт <span style='color:#545873'>${newReserve.airport.name}</span> `
          }
        }
      })
      pubsub.publish(NOTIFICATION, {
        notification: {
          __typename: "ReserveCreatedNotification",
          action: "create_reserve",
          ...newReserve
        }
      })
      pubsub.publish(RESERVE_CREATED, { reserveCreated: newReserve })
      return newReserve
    },

    // Обновление существующего резерва.
    // Если пользователь связан с авиалинией, создается запрос на изменение дат через чат.
    updateReserve: async (_, { id, input, files }, context) => {
      const { user } = context
      const { arrival, departure, status } = input
      await airlineModerMiddleware(context)
      const currentTime = new Date()
      const adjustedTime = new Date(currentTime.getTime() + 3 * 60 * 60 * 1000)
      const formattedTime = adjustedTime.toISOString()

      // Получаем резерв с зависимыми сущностями
      const reserve = await prisma.reserve.findUnique({
        where: { id },
        include: {
          airline: true,
          airport: true,
          passengers: true,
          hotel: true,
          hotelChess: true,
          chat: true
        }
      })

      if (!reserve) {
        throw new Error("Резерв не найден")
      }

      // Обработка файлов (если есть)
      let filesPath = []
      if (files?.length > 0) {
        for (const file of files) {
          const uploadedPath = await uploadFiles(file)
          filesPath.push(uploadedPath)
        }
      }

      if (filesPath.length > 0) {
        if (reserve.files?.length > 0) {
          for (const filePath of reserve.files) {
            await deleteFiles(filePath)
          }
        }
        await prisma.reserve.update({
          where: { id },
          data: { files: filesPath }
        })
      }

      // process.stdout.write(`\n files \n`)

      // Если пользователь связан с авиалинией, создаем запрос на изменение через чат

      if (user.airlineId) {
        if (!arrival && !departure) return reserve

        const extendReserve = { id, arrival, departure }
        const updatedStart = arrival ?? reserve.arrival
        const updatedEnd = departure ?? reserve.departure

        const chat = await prisma.chat.findFirst({
          where: { reserveId: id, separator: "airline" }
        })

        if (chat) {
          const message = await prisma.message.create({
            data: {
              text: `Запрос на изменение дат заявки ${
                reserve.reserveNumber
              } с ${formatDate(reserve.arrival)} - ${formatDate(
                reserve.departure
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
              },
              chat: {
                select: {
                  id: true,
                  requestId: true,
                  reserveId: true,
                  airlineId: true,
                  hotelId: true
                }
              }
            }
          })
          await prisma.notification.create({
            data: {
              reserve: { connect: { id: extendReserve.id } },
              airline: { connect: { id: reserve.airlineId } },
              description: {
                action: "reserve_dates_change",
                description: `Запрос на изменение дат заявки ${
                  reserve.reserveNumber
                } с ${formatDate(reserve.arrival)} - ${formatDate(
                  reserve.departure
                )} на ${formatDate(updatedStart)} - ${formatDate(updatedEnd)}`
              }
            }
          })
          pubsub.publish(NOTIFICATION, {
            notification: {
              __typename: "ReserveUpdatedNotification",
              action: "reserve_dates_change",
              ...extendReserve
            }
          })
          pubsub.publish(MESSAGE_SENT, { messageSent: message })
        }

        return extendReserve
      }

      // Обновляем резерв
      try {
        const updatedReserve = await prisma.reserve.update({
          where: { id },
          data: {
            arrival: arrival ?? reserve.arrival,
            departure: departure ?? reserve.departure,
            status: status ?? reserve.status
          },
          include: { hotelChess: true }
        })

        if (!arrival && !departure) {
          pubsub.publish(RESERVE_UPDATED, { reserveUpdated: updatedReserve })
          return reserve
        }

        // Обновляем hotelChess (если есть)
        if (updatedReserve?.hotelChess?.length > 0) {
          for (const hc of updatedReserve.hotelChess) {
            const hotel = await prisma.hotel.findUnique({
              where: { id: hc.hotelId },
              include: { breakfast: true, lunch: true, dinner: true }
            })

            if (hotel) {
              const enabledMeals = {
                breakfast: updatedReserve.mealPlan?.breakfastEnabled,
                lunch: updatedReserve.mealPlan?.lunchEnabled,
                dinner: updatedReserve.mealPlan?.dinnerEnabled
              }

              const mealTimes = {
                breakfast: hotel.breakfast,
                lunch: hotel.lunch,
                dinner: hotel.dinner
              }

              const calculatedMealPlan = calculateMeal(
                updatedReserve.arrival,
                updatedReserve.departure,
                mealTimes,
                enabledMeals
              )

              const mealPlanData = {
                included: updatedReserve.mealPlan?.included,
                breakfast: calculatedMealPlan.totalBreakfast,
                breakfastEnabled: updatedReserve.mealPlan?.breakfastEnabled,
                lunch: calculatedMealPlan.totalLunch,
                lunchEnabled: updatedReserve.mealPlan?.lunchEnabled,
                dinner: calculatedMealPlan.totalDinner,
                dinnerEnabled: updatedReserve.mealPlan?.dinnerEnabled,
                dailyMeals: calculatedMealPlan.dailyMeals
              }

              const updatedHotelChess = await prisma.hotelChess.update({
                where: { id: hc.id },
                data: {
                  start: updatedReserve.arrival,
                  end: updatedReserve.departure,
                  mealPlan: mealPlanData
                }
              })
              pubsub.publish(HOTEL_UPDATED, { hotelUpdated: hotel })
            }
          }
        }
        await prisma.notification.create({
          data: {
            reserve: { connect: { id: updatedReserve.id } },
            airline: { connect: { id: reserve.airlineId } },
            description: {
              action: "update_reserve",
              description: `Заявка ${
                reserve.reserveNumber
              } была изменена с ${formatDate(reserve.arrival)} - ${formatDate(
                reserve.departure
              )} на ${formatDate(updatedReserve.arrival)} - ${formatDate(
                updatedReserve.departure
              )}`
            }
          }
        })
        pubsub.publish(NOTIFICATION, {
          notification: {
            __typename: "ReserveUpdatedNotification",
            action: "update_reserve",
            ...updatedReserve
          }
        })

        pubsub.publish(RESERVE_UPDATED, { reserveUpdated: updatedReserve })

        return updatedReserve
      } catch (error) {
        const timestamp = new Date().toISOString()
        console.error(
          timestamp,
          "\n❌ Ошибка при обновлении резерва: \n",
          error
        )
        // console.error("\n❌ Ошибка при обновлении резерва: \n", error)
        throw new Error(
          "Ошибка обновления резерва",
          JSON.stringify(error, null, 2)
        )
      }
    },

    // Добавление отеля к резерву.
    // Создается запись reserveHotel, и если для данной комбинации чата еще нет, создается новый чат.
    addHotelToReserve: async (
      _,
      { reservationId, hotelId, capacity },
      context
    ) => {
      await allMiddleware(context)
      const { user } = context
      try {
        const reserveHotel = await prisma.reserveHotel.create({
          data: {
            reserve: { connect: { id: reservationId } },
            hotel: { connect: { id: hotelId } },
            capacity
          },
          include: { hotel: true }
        })
        const oldChat = await prisma.chat.findFirst({
          where: {
            reserve: { id: reservationId },
            hotel: { id: hotelId },
            separator: "hotel"
          }
        })
        if (!oldChat) {
          const newChat = await prisma.chat.create({
            data: {
              reserve: { connect: { id: reservationId } },
              hotel: { connect: { id: hotelId } },
              separator: "hotel"
            }
          })
          await prisma.chatUser.create({
            data: {
              chat: { connect: { id: newChat.id } },
              user: { connect: { id: user.id } }
            }
          })
        }
        const updatedReserve = await prisma.reserve.findUnique({
          where: { id: reservationId },
          include: {
            chat: true
          }
        })
        await logAction({
          context,
          action: "update_reserve",
          description: `К заявке <span style='color:#545873'>${updatedReserve.reserveNumber}</span> добавлен отель <span style='color:#545873'>${reserveHotel.hotel.name}</span>`,
          reserveId: reserveHotel.reservationId,
          hotelId: reserveHotel.hotelId
        })
        pubsub.publish(RESERVE_UPDATED, { reserveUpdated: updatedReserve })
        pubsub.publish(RESERVE_HOTEL, { reserveHotel })
        return reserveHotel
      } catch (error) {
        const timestamp = new Date().toISOString()
        console.error(timestamp, " \n Ошибка при добавлении отеля: \n", error)
        // console.error(" \n Ошибка при добавлении отеля: \n", error)
        // Если возникает ошибка уникальности (уже существует такая комбинация),
        // можно вернуть соответствующее сообщение, здесь закомментировано.
        // if (
        //   error.code === "P2002" &&
        //   error.meta?.target?.includes("reserveId_hotelId")
        // ) {
        //   throw new Error("This reserve and hotel combination already exists.")
        // }
        // throw error
      }
    },

    // Добавление пассажира к резерву.
    // Если для заданного отеля в резерве еще не создана запись reserveHotel, она создается.
    addPassengerToReserve: async (
      _,
      { reservationId, input, hotelId, capacity },
      context
    ) => {
      await allMiddleware(context)
      const { user } = context
      const { name, number, gender, child, animal } = input
      const reserve = await prisma.reserve.findUnique({
        where: { id: reservationId }
      })
      if (!reserve) {
        throw new Error("Reservation not found")
      }
      let reserveHotel = await prisma.reserveHotel.findFirst({
        where: {
          reserveId: reservationId,
          hotelId: hotelId
        },
        include: { hotel: true }
      })
      if (!reserveHotel) {
        reserveHotel = await prisma.reserveHotel.create({
          data: {
            reserve: { connect: { id: reservationId } },
            hotel: { connect: { id: hotelId } },
            capacity: capacity || 1
          },
          include: { hotel: true }
        })
      }
      const newPassenger = await prisma.passenger.create({
        data: {
          name,
          number,
          gender,
          child: child || false,
          animal: animal || false,
          reserve: { connect: { id: reservationId } },
          reserveHotel: { connect: { id: reserveHotel.id } }
        }
      })
      const updatedReserveHotel = await prisma.reserveHotel.findUnique({
        where: { id: reserveHotel.id },
        include: { passengers: true }
      })
      await logAction({
        context,
        action: "update_reserve",
        description: `Пассажир <span style='color:#545873'>${newPassenger.name}</span> добавлен в отель <span style='color:#545873'>${reserveHotel.hotel.name}</span> для заявки № <span style='color:#545873'>${reserve.reserveNumber}</span>`,
        reserveId: reservationId,
        hotelId: hotelId
      })
      pubsub.publish(RESERVE_PERSONS, { reservePersons: updatedReserveHotel })
      return newPassenger
    },

    // Удаление пассажира из резерва.
    // После удаления возвращается обновленная информация о соответствующем reserveHotel.
    deletePassengerFromReserve: async (_, { id }, context) => {
      await allMiddleware(context)
      const { user } = context
      const deletedPassenger = await prisma.passenger.delete({
        where: { id }
      })
      const reserveHotel = await prisma.reserveHotel.findUnique({
        where: { id: deletedPassenger.reserveHotelId },
        include: { passengers: true }
      })
      pubsub.publish(RESERVE_PERSONS, { reservePersons: reserveHotel })
      return reserveHotel
    },

    // Генерация файла (например, Excel) с данными о пассажирах резерва.
    generateReservePassengerFile: async (_, { reserveId, format }, context) => {
      await allMiddleware(context)
      // Получаем данные о резерве, включая информацию об отеле и пассажирах.
      const reserve = await prisma.reserve.findUnique({
        where: { id: reserveId },
        include: {
          hotel: {
            include: {
              hotel: {
                select: {
                  name: true,
                  information: {
                    select: { address: true }
                  }
                }
              },
              passengers: {
                select: {
                  name: true,
                  number: true,
                  gender: true
                }
              }
            }
          }
        }
      })

      // Если резерв или связанные отели не найдены, выбрасываем ошибку.
      if (!reserve || !reserve.hotel || reserve.hotel.length === 0) {
        throw new Error("Резерв с таким ID не найден или в нем нет отелей.")
      }

      // Формирование имени и пути для генерируемого файла.
      const listName = `reserve_${reserveId}_${Date.now()}.${format}`
      const listPath = path.resolve(`./reserve_files/${listName}`)
      fs.mkdirSync(path.dirname(listPath), { recursive: true })

      if (format === "xlsx") {
        await generateReserveExcel(reserve, listPath)
      } else {
        throw new Error("Unsupported format")
      }

      const updatedReserve = await prisma.reserve.update({
        where: { id: reserveId },
        data: {
          passengerList: { set: [`/files/reserve_files/${listName}`] }
        }
      })

      pubsub.publish(RESERVE_UPDATED, { reserveUpdated: updatedReserve })

      return {
        name: listName,
        url: `/files/reserve_files/${listName}`
      }
    },

    // Архивация резерва.
    // Резерв архивируется, если дата вылета меньше текущей и статус не равен "archived".
    archivingReserve: async (_, input, context) => {
      const { user } = context
      await dispatcherModerMiddleware(context)
      const reserveId = input.id
      const reserve = await prisma.reserve.findUnique({
        where: { id: reserveId }
      })
      if (
        new Date(reserve.departure.date) < new Date(Date.now()) &&
        reserve.status !== "archived"
      ) {
        const archiveReserve = await prisma.reserve.update({
          where: { id: reserveId },
          data: { status: "archived", archive: true }
        })
        await logAction({
          context,
          action: "archive_reserve",
          description: `Пользователь <span style='color:#545873'>${user.name}</span> отправил заявку № <span style='color:#545873'>${archiveReserve.reserveNumber}</span> в архив`,
          oldData: reserve,
          newData: { status: "archived" },
          reserveId: reserve.id
        })
        pubsub.publish(RESERVE_UPDATED, { reserveUpdated: archiveReserve })
        return archiveReserve
      } else {
        throw new Error("Reserve is not expired or already archived")
      }
    }
  },

  Subscription: {
    // Подписка на событие создания нового резерва.
    reserveCreated: {
      subscribe: withFilter(
        () => pubsub.asyncIterator([RESERVE_CREATED]),
        (payload, variables, context) => {
          const { subject, subjectType } = context

          if (!subject || subjectType !== "USER") return false

          const reserve = payload.reserveCreated

          // SUPERADMIN и диспетчеры видят все
          if (subject.role === "SUPERADMIN" || subject.dispatcher === true) {
            return true
          }

          // Проверяем права по airlineId
          if (subject.airlineId && reserve.airlineId === subject.airlineId) {
            return true
          }

          return false
        }
      )
    },
    // Подписка на событие обновления резерва.
    reserveUpdated: {
      subscribe: withFilter(
        () => pubsub.asyncIterator([RESERVE_UPDATED]),
        (payload, variables, context) => {
          const { subject, subjectType } = context

          if (!subject || subjectType !== "USER") return false

          const reserve = payload.reserveUpdated

          // SUPERADMIN и диспетчеры видят все
          if (subject.role === "SUPERADMIN" || subject.dispatcher === true) {
            return true
          }

          // Проверяем права по airlineId
          if (subject.airlineId && reserve.airlineId === subject.airlineId) {
            return true
          }

          // Проверяем права по hotelId через связанные отели
          if (subject.hotelId && reserve.hotel) {
            const hasAccess = reserve.hotel.some(
              (hotel) => hotel.hotelId === subject.hotelId
            )
            if (hasAccess) return true
          }

          return false
        }
      )
    },
    // Подписка на событие, связанное с изменением информации об отеле в резерве.
    reserveHotel: {
      subscribe: withFilter(
        () => pubsub.asyncIterator([RESERVE_HOTEL]),
        (payload, variables, context) => {
          const { subject, subjectType } = context

          if (!subject || subjectType !== "USER") return false

          const reserveHotel = payload.reserveHotel

          // SUPERADMIN и диспетчеры видят все
          if (subject.role === "SUPERADMIN" || subject.dispatcher === true) {
            return true
          }

          // Проверяем права по hotelId
          if (subject.hotelId && reserveHotel.hotelId === subject.hotelId) {
            return true
          }

          // Проверяем права по airlineId через reserve
          if (reserveHotel.reserve && subject.airlineId) {
            if (reserveHotel.reserve.airlineId === subject.airlineId) {
              return true
            }
          }

          return false
        }
      )
    },
    // Подписка на событие, связанное с изменением информации о пассажирах в резерве.
    reservePersons: {
      subscribe: withFilter(
        () => pubsub.asyncIterator([RESERVE_PERSONS]),
        (payload, variables, context) => {
          const { subject, subjectType } = context

          if (!subject || subjectType !== "USER") return false

          const reservePersons = payload.reservePersons

          // SUPERADMIN и диспетчеры видят все
          if (subject.role === "SUPERADMIN" || subject.dispatcher === true) {
            return true
          }

          // Проверяем права по airlineId через reserve
          if (reservePersons.reserve && subject.airlineId) {
            if (reservePersons.reserve.airlineId === subject.airlineId) {
              return true
            }
          }

          return false
        }
      )
    }
  },

  // Резольверы для типа Reserve
  Reserve: {
    // Получение списка резервных отелей (reserveHotel) для данного резерва.
    hotel: async (parent) => {
      return await prisma.reserveHotel.findMany({
        where: { reserveId: parent.id }
      })
    },
    // Получение связанных hotelChess для данного резерва.
    hotelChess: async (parent) => {
      return await prisma.hotelChess.findMany({
        where: { reserveId: parent.id }
      })
    },
    // Получение списка пассажиров, привязанных к резерву.
    passengers: async (parent) => {
      return await prisma.passenger.findMany({
        where: { reserveId: parent.id }
      })
    },
    logs: async (parent, { pagination }) => {
      const { skip, take } = pagination || {}

      const totalCount = await prisma.log.count({
        where: { reserveId: parent.id }
      })

      const logs = await prisma.log.findMany({
        where: { reserveId: parent.id },
        include: { user: true },
        skip,
        take,
        orderBy: { createdAt: "desc" } // сортируем от новых к старым
      })

      const totalPages = Math.ceil(totalCount / take)

      return { totalCount, totalPages, logs }
    }
  },

  // Резольверы для типа ReserveHotel
  ReserveHotel: {
    // Получение основного резерва, к которому относится данная запись.
    reserve: async (parent) => {
      return await prisma.reserve.findUnique({
        where: { id: parent.reserveId }
      })
    },
    // Получение отеля, связанного с данной записью.
    hotel: async (parent) => {
      return await prisma.hotel.findUnique({
        where: { id: parent.hotelId }
      })
    },
    // Получение пассажиров, связанных с данным ReserveHotel.
    passengers: async (parent) => {
      return await prisma.passenger.findMany({
        where: { reserveHotelId: parent.id }
      })
    },
    // Получение записей hotelChess для данного отеля и резерва.
    hotelChess: async (parent) => {
      return await prisma.hotelChess.findMany({
        where: { hotelId: parent.hotelId, reserveId: parent.reserveId }
      })
    }
  },

  // Резольверы для типа Passenger
  Passenger: {
    // Получение резерва, к которому привязан пассажир.
    reserve: async (parent) => {
      return await prisma.reserve.findUnique({
        where: { id: parent.reserveId }
      })
    }
  },

  // Резольверы для типа ReserveHotelPersonal (если используются для связи персонала с ReserveHotel)
  ReserveHotelPersonal: {
    // Получение пассажиров, связанных с данным ReserveHotelPersonal.
    passengers: async (parent) => {
      return await prisma.passenger.findMany({
        where: { reserveId: parent.reserveId }
      })
    },
    // Получение записи ReserveHotel по составному ключу (reserveId и hotelId).
    reserveHotel: async (parent) => {
      return await prisma.reserveHotel.findUnique({
        where: {
          reserveId_hotelId: {
            reserveId: parent.reserveId,
            hotelId: parent.hotelId
          }
        }
      })
    }
  }
}

export default reserveResolver

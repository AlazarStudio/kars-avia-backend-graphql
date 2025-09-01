// Импорт необходимых модулей и утилит
import { prisma } from "../../prisma.js"
import GraphQLUpload from "graphql-upload/GraphQLUpload.mjs"
import { deleteImage, uploadImage } from "../../exports/uploadImage.js"
import logAction from "../../exports/logaction.js"
import {
  superAdminMiddleware,
  adminMiddleware,
  hotelAdminMiddleware,
  hotelModerMiddleware,
  hotelMiddleware,
  allMiddleware
} from "../../middlewares/authMiddleware.js"
import nodemailer from "nodemailer"
import {
  pubsub,
  REQUEST_UPDATED,
  HOTEL_CREATED,
  HOTEL_UPDATED,
  RESERVE_UPDATED
} from "../../exports/pubsub.js"
import calculateMeal from "../../exports/calculateMeal.js"
import { sendEmail } from "../../utils/sendMail.js"
import { ensureNoOverlap } from "../../exports/ensureNoOverlap.js"
import { request } from "express"
import { logger } from "../../utils/logger.js"

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

// Объект для сопоставления текстового названия категории с числовым значением мест
const categoryToPlaces = {
  apartment: 2,
  studio: 2,
  luxe: 2,
  onePlace: 1,
  twoPlace: 2,
  threePlace: 3,
  fourPlace: 4,
  fivePlace: 5,
  sixPlace: 6,
  sevenPlace: 7,
  eightPlace: 8,
  ninePlace: 9,
  tenPlace: 10
}

// Функция для расчёта количества мест по заданной категории.
// Если категория не найдена, возвращается 1
const calculatePlaces = (category) => categoryToPlaces[category] || 1

// Основной объект-резольвер для работы с отелями
const hotelResolver = {
  // Подключение типа Upload для работы с загрузкой файлов через GraphQL
  Upload: GraphQLUpload,

  Query: {
    // Получение списка отелей с возможностью пагинации.
    // При запросе возвращаются отели с включением связанных комнат (rooms) и записей hotelChesses.
    hotels: async (_, { pagination }, context) => {
      await allMiddleware(context)
      const { user } = context
      const { skip, take, all } = pagination || {}

      // Получаем общее количество отелей
      let whereFilter
      if (user.role === "SUPERADMIN" || user.dispatcher === true) {
        whereFilter = { active: true }
      } else {
        whereFilter = { active: true, show: true }
      }
       console.log("whereFilter " + whereFilter, "\n whereFilter str " + JSON.stringify(whereFilter))
      const totalCount = await prisma.hotel.count({ where: whereFilter })

      // Если передан флаг all, возвращаем все отели, иначе – с учетом пагинации
      const hotels = all
        ? await prisma.hotel.findMany({
            where: whereFilter,
            include: {
              rooms: true,
              hotelChesses: true
            },
            orderBy: {
              information: {
                city: "asc"
              }
            }
          })
        : await prisma.hotel.findMany({
            where: whereFilter,
            skip: skip ? skip * take : undefined,
            take: take || undefined,
            include: {
              rooms: true,
              airport: true,
              hotelChesses: true
            },
            orderBy: {
              information: {
                city: "asc"
              }
            }
          })

      // Расчет общего количества страниц при наличии пагинации
      const totalPages = take && !all ? Math.ceil(totalCount / take) : 1

      return {
        hotels,
        totalCount,
        totalPages
      }
    },

    // Получение данных одного отеля по его id с включением связанных комнат, hotelChesses и логов
    hotel: async (_, { id }, context) => {
      await allMiddleware(context)
      return await prisma.hotel.findUnique({
        where: { id },
        include: {
          rooms: true,
          roomKind: true,
          hotelChesses: true,
          airport: true,
          logs: true
        }
      })
    }
  },

  Mutation: {
    // Создание нового отеля.
    // Выполняется проверка прав доступа, обработка изображений, установка значений по умолчанию
    // и логирование действия.
    createHotel: async (_, { input, images, gallery }, context) => {
      const { user } = context
      // Проверка доступа: требуется администратор
      await adminMiddleware(context)

      // Значения по умолчанию для цен на питание (mealPrice)
      const defaultMealPrice = {
        breakfast: 0,
        lunch: 0,
        dinner: 0
      }

      // Значения по умолчанию для различных категорий цен
      const defaultPrices = {
        priceOneCategory: 0,
        priceTwoCategory: 0,
        priceThreeCategory: 0,
        priceFourCategory: 0,
        priceFiveCategory: 0,
        priceSixCategory: 0,
        priceSevenCategory: 0,
        priceEightCategory: 0,
        priceNineCategory: 0,
        priceTenCategory: 0
      }

      // Значения по умолчанию для времени приёма пищи
      const defaultMealTime = {
        breakfast: { start: "07:00", end: "10:00" },
        lunch: { start: "12:00", end: "16:00" },
        dinner: { start: "18:00", end: "20:00" }
      }

      // Обработка загрузки изображений: загружаем каждое изображение и собираем пути
      let imagePaths = []
      if (images && images.length > 0) {
        for (const image of images) {
          imagePaths.push(await uploadImage(image))
        }
      }

      let galleryPaths = []
      if (gallery && gallery.length > 0) {
        for (const image of gallery) {
          galleryPaths.push(await uploadImage(image))
        }
      }

      const airportId = input.airportId

      // Формируем объект данных для создания отеля, подставляя значения по умолчанию при отсутствии
      const data = {
        ...input,
        airportId,
        mealPrice: input.mealPrice || defaultMealPrice,
        prices: input.prices || defaultPrices,
        breakfast: input.breakfast || defaultMealTime.breakfast,
        lunch: input.lunch || defaultMealTime.lunch,
        dinner: input.dinner || defaultMealTime.dinner,
        images: imagePaths,
        gallery: galleryPaths
      }

      // Создаем новый отель с включением связанных комнат
      const createdHotel = await prisma.hotel.create({
        data,
        include: {
          rooms: true
        }
      })

      // Логирование действия создания отеля
      await logAction({
        context,
        action: "create_hotel",
        description: `Пользователь <span style='color:#545873'>${user.name}</span> создал отель <span style='color:#545873'>${createdHotel.name}</span> `,
        hotelName: createdHotel.name,
        hotelId: createdHotel.id
      })

      // Публикация события создания отеля для подписчиков
      pubsub.publish(HOTEL_CREATED, { hotelCreated: createdHotel })
      return createdHotel
    },

    // Обновление данных отеля.
    // Помимо основной информации, здесь обрабатываются:
    // - загрузка и обновление изображений;
    // - обновление записей hotelChesses (связанных с заявками, бронями и т.д.) с расчетом плана питания;
    // - обработка информации о комнатах (rooms) и обновление количества мест в отеле.
    updateHotel: async (
      _,
      { id, input, images, roomImages, roomKindImages, gallery },
      context
    ) => {
      const { user } = context
      // Проверка прав доступа для администратора отеля
      // hotelAdminMiddleware(context)

      if (input.hotelChesses && input.hotelChesses.length > 0) {
        await hotelModerMiddleware(context) // Если обновляются hotelChesses → проверяем права модератора
      } else {
        hotelAdminMiddleware(context) // В остальных случаях → права администратора отеля
      }

      // Обработка загрузки новых изображений для отеля
      let imagePaths = []
      if (images && images.length > 0) {
        for (const image of images) {
          imagePaths.push(await uploadImage(image))
        }
      }

      let galleryPaths = []
      if (gallery && gallery.length > 0) {
        for (const image of gallery) {
          galleryPaths.push(await uploadImage(image))
        }
      }

      // Извлекаем из input данные по комнатам и hotelChesses, остальные данные сохраняем в restInput
      const {
        tariffs,
        rooms,
        roomKind,
        hotelChesses,
        airportId,
        ...restInput
      } = input
      // Формируем объект данных для логирования обновлений
      const updatedData = {
        tariffs,
        rooms,
        roomKind,
        hotelChesses,
        ...restInput
      }

      try {
        // Сохраняем предыдущие данные отеля для логирования изменений
        const previousHotelData = await prisma.hotel.findUnique({
          where: { id },
          select: { prices: true, mealPrice: true } // Получаем текущие цены
        })

        const updatedHotel = await prisma.hotel.update({
          where: { id },
          data: {
            airportId,
            ...restInput,
            prices: {
              ...previousHotelData.prices, // Оставляем старые цены
              ...input.prices // Обновляем только переданные поля
            },
            mealPrice: {
              ...previousHotelData.mealPrice, // Оставляем старые значения
              ...input.mealPrice // Обновляем только переданные поля
            },
            ...(imagePaths.length > 0 && { images: { set: imagePaths } }),
            ...(galleryPaths.length > 0 && { gallery: { set: galleryPaths } })
          }
        })

        if (hotelChesses) {
          for (const hotelChess of hotelChesses) {
            let mealPlanData = null
            // Если заданы временные интервалы start и end, рассчитываем план питания
            if (hotelChess.start && hotelChess.end) {
              const arrival = hotelChess.start.toString()
              const departure = hotelChess.end.toString()
              // Получаем информацию отеля для расчёта времени приема пищи
              const hotelInfo = await prisma.hotel.findUnique({
                where: { id: hotelChess.hotelId || id },
                select: {
                  breakfast: true,
                  lunch: true,
                  dinner: true,
                  name: true
                }
              })
              if (hotelInfo) {
                const mealTimes = {
                  breakfast: hotelInfo.breakfast,
                  lunch: hotelInfo.lunch,
                  dinner: hotelInfo.dinner
                }
              }
            }

            // Если hotelChess содержит id, обновляем существующую запись
            if (hotelChess.id) {
              // Сохраняем предыдущие данные hotelChess для логирования
              const previousHotelChessData = await prisma.hotelChess.findUnique(
                { where: { id: hotelChess.id } }
              )

              let clientConnectData = undefined
              // Если задан clientId, подготавливаем данные для связи
              if (hotelChess.clientId) {
                const clientRecord = await prisma.airlinePersonal.findUnique({
                  where: { id: hotelChess.clientId }
                })
                if (clientRecord) {
                  clientConnectData = { connect: { id: hotelChess.clientId } }
                }
              }

              await ensureNoOverlap(
                hotelChess.roomId,
                hotelChess.place,
                hotelChess.start
                  ? hotelChess.start
                  : previousHotelChessData.start,
                hotelChess.end ? hotelChess.end : previousHotelChessData.end,
                hotelChess.id
              )

              // const dupl = await prisma.hotelChess.findMany({
              //   where: {
              //     requestId: hotelChess.requestId
              //     // NOT: { id: hotelChess.id },
              //     // id: { not: hotelChess.id },
              //   },
              //   select: {
              //     id: true,
              //     // start: true,
              //     // end: true,
              //     requestId: true
              //   }
              // })

              // console.log("\n hotelChess.requestId: " + hotelChess.requestId)
              // console.log("\n dupl str: " + JSON.stringify(dupl))

              // Обновляем запись hotelChess
              await prisma.hotelChess.update({
                where: { id: hotelChess.id },
                data: {
                  public: hotelChess.public,
                  room: { connect: { id: hotelChess.roomId } },
                  place: hotelChess.place,
                  start: hotelChess.start,
                  end: hotelChess.end,
                  client: clientConnectData,
                  passenger: hotelChess.passengerId
                    ? { connect: { id: hotelChess.passengerId } }
                    : undefined,
                  request: hotelChess.requestId
                    ? { connect: { id: hotelChess.requestId } }
                    : undefined,
                  reserve: hotelChess.reserveId
                    ? { connect: { id: hotelChess.reserveId } }
                    : undefined,
                  status: hotelChess.status
                  // mealPlan: mealPlanData // Можно добавить, если требуется обновление плана питания
                }
              })

              // Если hotelChess связан с заявкой (request)
              if (hotelChess.requestId) {
                // Получаем данные комнаты для извлечения информации о категории и названии
                const room = await prisma.room.findUnique({
                  where: { hotelId: hotelChess.hotelId, id: hotelChess.roomId }
                })

                // Обновляем заявку: меняем статус, привязываем отель и комнату, обновляем план питания (если требуется)

                const updatedRequest = await prisma.request.update({
                  where: { id: hotelChess.requestId },
                  data: {
                    status: "transferred",
                    hotel: { connect: { id } },
                    hotelChess: { connect: { id: hotelChess.id } },
                    roomCategory: room?.category,
                    roomNumber: room?.name
                    // mealPlan: mealPlanData
                  }
                })

                await logAction({
                  context,
                  action: "update_hotel_chess",
                  description: `Заявка № <span style='color:#545873'>${updatedRequest.requestNumber}</span> была перенесена в номер <span style='color:#545873'>${room.name}</span> пользователем <span style='color:#545873'>${user.name}</span>`,
                  oldData: previousHotelChessData,
                  newData: hotelChess,
                  hotelId: hotelChess.hotelId,
                  requestId: updatedRequest.id
                })
                // Публикуем событие обновления заявки
                pubsub.publish(REQUEST_UPDATED, {
                  requestUpdated: updatedRequest
                })
              } else if (hotelChess.reserveId) {
                // Если hotelChess связан с бронью (reserve)
                const room = await prisma.room.findUnique({
                  where: { hotelId: hotelChess.hotelId, id: hotelChess.roomId }
                })
                const reserve = await prisma.reserve.update({
                  where: { id: hotelChess.reserveId },
                  data: {
                    hotelChess: { connect: { id: hotelChess.id } }
                    // mealPlan: mealPlanData
                  }
                })
                await logAction({
                  context,
                  action: "update_hotel_chess",
                  description: `Бронь № <span style='color:#545873'>${reserve.reserveNumber}</span> была перенесена в номер <span style='color:#545873'>${room.name}</span> пользователем <span style='color:#545873'>${user.name}</span>`,
                  oldData: previousHotelChessData,
                  newData: hotelChess,
                  hotelId: hotelChess.hotelId,
                  reserveId: hotelChess.reserveId
                })
                pubsub.publish(RESERVE_UPDATED, { reserveUpdated: reserve })
              }
            } else {
              // Создание новой записи hotelChess

              await ensureNoOverlap(
                hotelChess.roomId,
                hotelChess.place,
                hotelChess.start,
                hotelChess.end
              )

              let newHotelChess
              if (hotelChess.reserveId) {
                try {
                  const arrival = hotelChess.start.toString()
                  const departure = hotelChess.end.toString()
                  const hotel = await prisma.hotel.findUnique({
                    where: { id },
                    select: {
                      breakfast: true,
                      lunch: true,
                      dinner: true,
                      name: true
                    }
                  })
                  const mealTimes = {
                    breakfast: hotel.breakfast,
                    lunch: hotel.lunch,
                    dinner: hotel.dinner
                  }
                  const reserve = await prisma.reserve.findUnique({
                    where: { id: hotelChess.reserveId }
                  })
                  const enabledMeals = {
                    breakfast: reserve.mealPlan?.breakfastEnabled,
                    lunch: reserve.mealPlan?.lunchEnabled,
                    dinner: reserve.mealPlan?.dinnerEnabled
                  }
                  const calculatedMealPlan = calculateMeal(
                    arrival,
                    departure,
                    mealTimes,
                    enabledMeals
                  )
                  const mealPlanData = {
                    included: reserve.mealPlan.included,
                    breakfast: calculatedMealPlan.totalBreakfast,
                    breakfastEnabled: reserve.mealPlan.breakfastEnabled,
                    lunch: calculatedMealPlan.totalLunch,
                    lunchEnabled: reserve.mealPlan.lunchEnabled,
                    dinner: calculatedMealPlan.totalDinner,
                    dinnerEnabled: reserve.mealPlan.dinnerEnabled,
                    dailyMeals: calculatedMealPlan.dailyMeals
                  }

                  const existHotelChess = await prisma.hotelChess.findFirst({
                    where: {
                      roomId: hotelChess.roomId,
                      start: { gte: hotelChess.start, lte: hotelChess.end },
                      end: { gte: hotelChess.start, lte: hotelChess.end }
                    }
                  })
                  // console.log(existHotelChess)

                  newHotelChess = await prisma.hotelChess.create({
                    data: {
                      hotel: { connect: { id } },
                      public: hotelChess.public,
                      room: { connect: { id: hotelChess.roomId } },
                      place: hotelChess.place,
                      start: hotelChess.start,
                      end: hotelChess.end,
                      passenger: { connect: { id: hotelChess.clientId } },
                      reserve: { connect: { id: hotelChess.reserveId } },
                      status: hotelChess.status,
                      mealPlan: mealPlanData
                    }
                  })
                  pubsub.publish(RESERVE_UPDATED, { reserveUpdated: reserve })
                } catch (error) {
                  logger.error("Ошибка при бронировании", error)
                  const timestamp = new Date().toISOString()
                  console.error(timestamp, " \n Error: \n ", error)
                  // console.error(" \n Error: \n ", e)
                  throw new Error(
                    "Ошибка при создании клиентского бронирования: " +
                      error.message +
                      "\n\n :" +
                      error.stack
                  )
                }
              } else if (hotelChess.requestId) {
                const request = await prisma.request.findUnique({
                  where: { id: hotelChess.requestId },
                  include: { hotelChess: true }
                })
                if (request.hotelChess.length != 0) {
                  throw new Error("HotelChess already created")
                }
                const room = await prisma.room.findUnique({
                  where: { hotelId: hotelChess.hotelId, id: hotelChess.roomId }
                })
                const arrival = hotelChess.start.toString()
                const departure = hotelChess.end.toString()
                const hotel = await prisma.hotel.findUnique({
                  where: { id },
                  select: {
                    breakfast: true,
                    lunch: true,
                    dinner: true,
                    name: true
                  }
                })
                const mealTimes = {
                  breakfast: hotel.breakfast,
                  lunch: hotel.lunch,
                  dinner: hotel.dinner
                }
                const enabledMeals = {
                  breakfast: request.mealPlan?.breakfastEnabled,
                  lunch: request.mealPlan?.lunchEnabled,
                  dinner: request.mealPlan?.dinnerEnabled
                }
                const calculatedMealPlan = calculateMeal(
                  arrival,
                  departure,
                  mealTimes,
                  enabledMeals
                )
                const mealPlanData = {
                  included: request.mealPlan.included,
                  breakfast: calculatedMealPlan.totalBreakfast,
                  breakfastEnabled: request.mealPlan.breakfastEnabled,
                  lunch: calculatedMealPlan.totalLunch,
                  lunchEnabled: request.mealPlan.lunchEnabled,
                  dinner: calculatedMealPlan.totalDinner,
                  dinnerEnabled: request.mealPlan.dinnerEnabled,
                  dailyMeals: calculatedMealPlan.dailyMeals
                }

                const existHotelChess = await prisma.hotelChess.findFirst({
                  where: {
                    roomId: hotelChess.roomId,
                    start: { gte: hotelChess.start, lte: hotelChess.end },
                    end: { gte: hotelChess.start, lte: hotelChess.end }
                  }
                })
                // console.log(existHotelChess)

                // const dupl = await prisma.hotelChess.findMany({
                //   where: {
                //     requestId: hotelChess.requestId
                //   },
                //   select: {
                //     id: true,
                //     start: true,
                //     end: true,
                //     requestId: true
                //   }
                // })

                // console.log(
                //   "\n !id dupl" + dupl,
                //   "\n !id dupl str" + JSON.stringify(dupl)
                // )
                const currentTime = new Date()
                // const adjustedTime = new Date(
                //   currentTime.getTime() + 3 * 60 * 60 * 1000
                // )
                const formattedTime = currentTime.toISOString()

                const newHotelChess = await prisma.hotelChess.create({
                  data: {
                    ...(hotelChess.clientId
                      ? { client: { connect: { id: hotelChess.clientId } } }
                      : {}),
                    hotel: { connect: { id } },
                    public: hotelChess.public,
                    room: { connect: { id: hotelChess.roomId } },
                    place: hotelChess.place,
                    start: hotelChess.start,
                    end: hotelChess.end,
                    // client: { connect: { id: hotelChess.clientId } },
                    request: hotelChess.requestId
                      ? { connect: { id: hotelChess.requestId } }
                      : undefined,
                    status: hotelChess.status,
                    mealPlan: mealPlanData
                  }
                })

                const updatedRequest = await prisma.request.update({
                  where: { id: hotelChess.requestId },
                  data: {
                    status: "done",
                    hotel: { connect: { id } },
                    posted: { connect: { id: user.id } },
                    mealPlan: mealPlanData,
                    placementAt: formattedTime,
                    roomCategory: room?.category,
                    roomNumber: room?.name
                  },
                  include: {
                    hotel: true,
                    person: true,
                    hotelChess: true
                  }
                })
                // Создание нового чата для заявки, если его еще нет
                const oldChat = await prisma.chat.findFirst({
                  where: {
                    request: { id: updatedRequest.id },
                    separator: "hotel"
                  }
                })

                if (!oldChat) {
                  const newChat = await prisma.chat.create({
                    data: {
                      request: { connect: { id: updatedRequest.id } },
                      hotel: { connect: { id: hotelChess.hotelId } },
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

                const mailOptions = {
                  // from: `${process.env.EMAIL_USER}`,
                  to: `${process.env.EMAIL_HOTEL}`,
                  subject: "Request updated",
                  html: `<span style='color:#545873'>${
                    updatedRequest.person
                      ? updatedRequest.person.name
                      : "Предварительная бронь"
                  }</span> был(а) размещён в отеле <span style='color:#545873'>${
                    hotel?.name
                  }</span> в номер <span style='color:#545873'>${
                    room.name
                  }</span> по заявке <span style='color:#545873'>№ ${
                    updatedRequest.requestNumber
                  }</span> пользователем <span style='color:#545873'>${
                    user.name
                  }</span>`
                }

                // Отправка письма через настроенный транспортёр
                // await transporter.sendMail(mailOptions)
                await sendEmail(mailOptions)

                await logAction({
                  context,
                  action: "create_hotel_chess",
                  description: `<span style='color:#545873'>${
                    updatedRequest.person
                      ? updatedRequest.person.name
                      : "Предварительная бронь"
                  }</span> был(а) размещён в отеле <span style='color:#545873'>${
                    hotel?.name
                  }</span> в номер <span style='color:#545873'>${
                    room.name
                  }</span> по заявке <span style='color:#545873'>№ ${
                    updatedRequest.requestNumber
                  }</span> пользователем <span style='color:#545873'>${
                    user.name
                  }</span>`,
                  oldData: null,
                  newData: newHotelChess,
                  hotelId: hotelChess.hotelId,
                  requestId: hotelChess.requestId,
                  reserveId: hotelChess.reserveId
                })

                // Публикуем событие обновления заявки
                pubsub.publish(REQUEST_UPDATED, {
                  requestUpdated: updatedRequest
                })
              }
            }
          }
        }

        if (rooms) {
          for (const room of rooms) {
            // Определяем количество мест в комнате на основе категории
            // const places = calculatePlaces(room.category)
            if (room.id) {
              // Если комната существует, обновляем данные
              let imagePaths = []
              if (roomImages && roomImages.length > 0) {
                for (const image of roomImages) {
                  imagePaths.push(await uploadImage(image))
                }
              }
              const previousRoomData = await prisma.room.findUnique({
                where: { id: room.id }
              })

              let roomKind
              if (room.roomKindId != null) {
                roomKind = await prisma.roomKind.findUnique({
                  where: { id: room.roomKindId }
                })
              }

              let roomCategory
              if (room.category != null) {
                roomCategory = room.category
              } else {
                roomCategory = roomKind.category
              }

              const places = calculatePlaces(roomCategory)

              const updatedRoomData = {
                name: room.name,
                roomKindId: room.roomKindId,
                category: roomCategory,
                square: room.square,
                reserve: room.reserve,
                active: room.active,
                beds: room.beds,
                description: room.description,
                descriptionSecond: room.descriptionSecond,
                places: places,
                price: room.price,
                priceForAirline: room.priceForAirline,
                ...(roomImages && { images: imagePaths })
              }
              await prisma.room.update({
                where: { id: room.id },
                data: updatedRoomData
              })

              if (room.roomKindId) {
                updateRoomKindCounts(room.roomKindId)
              }

              await logAction({
                context,
                action: "update_room",
                description: `Пользователь <span style='color:#545873'>${user.name}</span> изменил данные в комнате <span style='color:#545873'>${room.name}</span>`,
                oldData: previousRoomData,
                newData: room,
                hotelId: room.hotelId
              })
            } else {
              // Если комната новая, создаем ее
              let imagePaths = []
              if (roomImages && roomImages.length > 0) {
                for (const image of roomImages) {
                  imagePaths.push(await uploadImage(image))
                }
              }

              let roomKind
              if (room.roomKindId != null) {
                roomKind = await prisma.roomKind.findUnique({
                  where: { id: room.roomKindId }
                })
              }

              let roomCategory
              if (room.category != null) {
                roomCategory = room.category
              } else {
                roomCategory = roomKind.category
              }

              const places = calculatePlaces(roomCategory)

              await prisma.room.create({
                data: {
                  hotelId: id,
                  name: room.name,
                  roomKindId: room.roomKindId,
                  category: roomCategory,
                  square: room.square,
                  reserve: room.reserve,
                  active: room.active,
                  beds: room.beds,
                  description: room.description,
                  descriptionSecond: room.descriptionSecond,
                  images: imagePaths,
                  places: places,
                  type: room.type,
                  price: room.price,
                  priceForAirline: room.priceForAirline
                }
              })

              if (room.roomKindId) {
                updateRoomKindCounts(room.roomKindId)
              }

              await logAction({
                context,
                action: "create_room",
                description: `Пользователь <span style='color:#545873'>${user.name}</span> добавил комнату <span style='color:#545873'>${room.name}</span>`,
                newData: room,
                hotelId: id
              })
            }
          }
          // Обновляем подсчет комнат отеля (резервных и квотных)
          await updateHotelRoomCounts(id)
        }

        if (roomKind) {
          for (const room of roomKind) {
            if (room.id) {
              let imagePaths = []
              if (roomKindImages && roomKindImages.length > 0) {
                for (const image of roomKindImages) {
                  imagePaths.push(await uploadImage(image))
                }
              }
              const updatedRoomData = {
                name: room.name,
                description: room.description,
                square: room.square,
                price: room.price,
                priceForAirline: room.priceForAirline,
                category: room.category,
                ...(roomKindImages && { images: imagePaths })
              }
              await prisma.roomKind.update({
                where: { id: room.id },
                data: updatedRoomData
              })
            } else {
              let imagePaths = []
              if (roomKindImages && roomKindImages.length > 0) {
                for (const image of roomKindImages) {
                  imagePaths.push(await uploadImage(image))
                }
              }
              await prisma.roomKind.create({
                data: {
                  hotelId: id,
                  name: room.name,
                  description: room.description,
                  square: room.square,
                  price: room.price,
                  priceForAirline: room.priceForAirline,
                  category: room.category,
                  images: imagePaths
                }
              })
            }
          }
        }

        // Логирование обновления отеля
        await logAction({
          context,
          action: "update_hotel",
          description: `Пользователь <span style='color:#545873'>${user.name}</span> изменил данные в отеле <span style='color:#545873'>${updatedHotel.name}</span>`,
          oldData: previousHotelData,
          newData: updatedData,
          hotelId: updatedHotel.id
        })
        // Получаем обновленную информацию об отеле вместе со связанными комнатами и hotelChesses
        const hotelWithRelations = await prisma.hotel.findUnique({
          where: { id },
          include: {
            rooms: true,
            hotelChesses: true,
            roomKind: true
          }
        })
        // Публикуем событие обновления отеля для подписчиков
        pubsub.publish(HOTEL_UPDATED, { hotelUpdated: hotelWithRelations })
        return hotelWithRelations
      } catch (error) {
        logger.error("Ошибка при обновлении отеля", error)
        const timestamp = new Date().toISOString()
        console.error(timestamp, " \n Ошибка при обновлении отеля: \n ", error)
        // console.error(" \n Ошибка при обновлении отеля: \n ", error)
        throw new Error("Не удалось обновить отель")
      }
    },

    createManyRooms: async (_, { input }, context) => {
      hotelAdminMiddleware(context)
      const {
        hotelId,
        roomKindId,
        reserve,
        active,
        beds,
        type,
        numberOfRooms,
        roomsName
      } = input

      let roomKind
      if (roomKindId != null) {
        roomKind = await prisma.roomKind.findUnique({
          where: { id: roomKindId }
        })
      }

      let roomCategory = roomKind.category
      const places = calculatePlaces(roomCategory)

      // Массив для хранения всех созданных комнат
      const createdRooms = []

      for (let i = 0; i < numberOfRooms; i++) {
        // const roomName = `${roomsName}-${i + 1}`;
        const roomName = `${roomsName + i}`

        const createdRoom = await prisma.room.create({
          data: {
            hotelId: hotelId,
            name: roomName,
            roomKindId: roomKindId,
            category: roomCategory,
            reserve: reserve,
            active: active,
            beds: beds,
            places: places,
            type: type
          }
        })

        // Добавляем созданную комнату в массив
        createdRooms.push(createdRoom)
      }

      // Возвращаем массив созданных комнат
      if (roomKindId) {
        updateRoomKindCounts(roomKindId)
      }
      return createdRooms
    },

    reorderRoomKindImages: async (_, { id, imagesArray }, context) => {
      hotelAdminMiddleware(context)
      const updatedRoomKind = await prisma.roomKind.update({
        where: { id },
        data: { images: imagesArray }
      })
      return updatedRoomKind
    },

    // Удаление отеля.
    // Требуется права супер-администратора. Выполняется удаление отеля,
    // логирование действия и, если есть изображения, их удаление.
    deleteHotel: async (_, { id }, context) => {
      // Проверка прав: только супер-администратор может удалять отели
      await adminMiddleware(context)
      const hotelToDelete = await prisma.hotel.findUnique({
        where: { id }
      })
      if (!hotelToDelete) {
        throw new Error("Отель не найден")
      }
      const deletedHotel = await prisma.hotel.update({
        where: { id },
        data: {
          active: false
        }
      })
      await prisma.user.updateMany({
        where: { hotelId: id },
        data: { active: false }
      })
      await logAction({
        context,
        action: "delete_hotel",
        description: `Пользователь <span style='color:#545873'>${context.user.name}</span> удалил отель <span style='color:#545873'>${hotelToDelete.name}</span>`,
        oldData: hotelToDelete,
        newData: hotelToDelete,
        hotelId: id
      })
      // Если у отеля есть изображения, удаляем их (функция deleteImage должна быть определена отдельно)
      // if (deletedHotel.images && deletedHotel.images.length > 0) {
      //   for (const imagePath of deletedHotel.images) {
      //     await deleteImage(imagePath)
      //   }
      // }
      return deletedHotel
    },

    // Удаление комнаты (room) отеля.
    // Проверяется доступ администратора отеля, затем комната удаляется,
    // обновляется подсчет комнат и производится логирование.
    deleteRoom: async (_, { id }, context) => {
      hotelAdminMiddleware(context)
      const roomToDelete = await prisma.room.findUnique({
        where: { id }
      })
      if (!roomToDelete) {
        throw new Error("Комната не найдена")
      }
      const deletedRoom = await prisma.room.delete({
        where: { id }
      })
      // Обновляем количество комнат отеля после удаления
      await updateHotelRoomCounts(roomToDelete.hotelId)
      await logAction({
        context,
        action: "delete_room",
        description: `Пользователь <span style='color:#545873'>${context.user.name}</span> удалил комнату <span style='color:#545873'> ${roomToDelete.name}</span>`,
        oldData: roomToDelete,
        newData: roomToDelete,
        hotelId: roomToDelete.hotelId
      })
      // Если у комнаты есть изображения, удаляем их
      if (deletedRoom.images && deletedRoom.images.length > 0) {
        for (const imagePath of deletedRoom.images) {
          await deleteImage(imagePath)
        }
      }
      if (deletedRoom.roomKindId) {
        updateRoomKindCounts(deletedRoom.roomKindId)
      }
      return deletedRoom
    },

    deleteRoomKind: async (_, { id }, context) => {
      hotelAdminMiddleware(context)
      const roomToDelete = await prisma.roomKind.findUnique({
        where: { id }
      })
      if (!roomToDelete) {
        throw new Error("Комната не найдена")
      }
      const deletedRoomKind = await prisma.roomKind.delete({
        where: { id }
      })
      if (deletedRoomKind.images && deletedRoomKind.images.length > 0) {
        for (const imagePath of deletedRoomKind.images) {
          await deleteImage(imagePath)
        }
      }
      return deletedRoomKind
    },

    updateAllRoomKindCount: async (_, { __ }, context) => {
      await allMiddleware(context)
      const hotels = await prisma.hotel.findMany({
        select: { roomKind: true }
      })
      for (const hotel of hotels) {
        for (const roomKind of hotel.roomKind) {
          updateRoomKindCounts(roomKind.id)
        }
      }
    }
  },

  Subscription: {
    // Подписка на событие создания нового отеля
    hotelCreated: {
      subscribe: () => pubsub.asyncIterator([HOTEL_CREATED])
    },
    // Подписка на событие обновления отеля
    hotelUpdated: {
      subscribe: () => pubsub.asyncIterator([HOTEL_UPDATED])
    }
  },

  // Резольверы для полей типа Hotel
  Hotel: {
    // Получение связанных комнат отеля
    rooms: async (parent) => {
      return await prisma.room.findMany({
        where: { hotelId: parent.id },
        include: { roomKind: true }
      })
    },
    roomKind: async (parent) => {
      return await prisma.roomKind.findMany({
        where: { hotelId: parent.id }
      })
    },
    // Получение связанных записей hotelChesses с включением данных клиента
    hotelChesses: async (parent, args) => {
      const hcPagination = args?.hcPagination || {}
      const { start, end } = hcPagination

      const where = {
        hotelId: parent.id
      }

      if (start && end) {
        // фильтрация по пересечению диапазонов
        where.AND = [
          {
            start: {
              lte: new Date(end)
            }
          },
          {
            end: {
              gte: new Date(start)
            }
          }
        ]
      }

      return await prisma.hotelChess.findMany({
        where,
        include: { client: true }
      })
    },
    airport: async (parent) => {
      if (parent.airportId) {
        return await prisma.airport.findUnique({
          where: { id: parent.airportId }
        })
      }
      return null
    },
    logs: async (parent, { pagination }) => {
      const { skip, take } = pagination || {}

      const totalCount = await prisma.log.count({
        where: { hotelId: parent.id }
      })

      const logs = await prisma.log.findMany({
        where: { hotelId: parent.id },
        include: { user: true },
        skip,
        take,
        orderBy: { createdAt: "desc" } // сортируем от новых к старым
      })

      const totalPages = Math.ceil(totalCount / take)

      return { totalCount, totalPages, logs }
    }
  },

  // Резольверы для полей типа HotelChess
  HotelChess: {
    // (Закомментировано) Пример получения данных клиента, если требуется
    // client: async (parent) => {
    //   if (!parent.clientId) return null
    //   return await prisma.airlinePersonal.findUnique({
    //     where: { id: parent.clientId }
    //   })
    // },
    // Получение данных пассажира по passengerId
    passenger: async (parent) => {
      if (!parent.passengerId) return null
      return await prisma.passenger.findUnique({
        where: { id: parent.passengerId }
      })
    },
    // Получение данных заявки, связанной с HotelChess
    request: async (parent) => {
      if (!parent.requestId || typeof parent.requestId !== "string") return null
      return await prisma.request.findUnique({
        where: { id: parent.requestId }
      })
    },
    // Получение данных брони, связанной с HotelChess
    reserve: async (parent) => {
      if (!parent.reserveId || typeof parent.reserveId !== "string") return null
      return await prisma.reserve.findUnique({
        where: { id: parent.reserveId }
      })
    },
    // Получение данных комнаты, связанной с HotelChess
    room: async (parent) => {
      if (!parent.roomId) return null
      return await prisma.room.findUnique({
        where: { id: parent.roomId },
        include: { roomKind: true }
      })
    }
  }
}

// Вспомогательная функция для обновления количества резервных (provision) и квотных (quote) комнат отеля.
// Производится подсчёт комнат с параметром reserve (true/false) и обновление соответствующих полей в отеле.
const updateHotelRoomCounts = async (hotelId) => {
  // Подсчёт резервных комнат
  const provisionCount = await prisma.room.count({
    where: {
      hotelId,
      reserve: true
    }
  })

  // Подсчёт квотных комнат
  const quoteCount = await prisma.room.count({
    where: {
      hotelId,
      reserve: false
    }
  })

  // Обновляем поля отеля с новыми значениями подсчетов
  const updatedHotel = await prisma.hotel.update({
    where: { id: hotelId },
    data: {
      provision: provisionCount,
      quote: quoteCount
    }
  })

  return updatedHotel
}

// Вспомогательная функция для обновления количества резервных (provision) и квотных (quote) комнат отеля.
// Производится подсчёт комнат с параметром reserve (true/false) и обновление соответствующих полей в отеле.
const updateRoomKindCounts = async (roomKindId) => {
  // Подсчёт комнат в тарифе
  const roomsCount = await prisma.room.count({
    where: { roomKindId }
  })

  // Обновляем поля отеля с новыми значениями подсчетов
  const updatedRoomKind = await prisma.roomKind.update({
    where: { id: roomKindId },
    data: { roomsCount }
  })

  return updatedRoomKind
}

export default hotelResolver

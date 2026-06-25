// Импорт необходимых модулей и утилит
import { prisma } from "../../prisma.js"
import GraphQLUpload from "graphql-upload/GraphQLUpload.mjs"
import logAction from "../../services/infra/logaction.js"
import {
  pubsub,
  REQUEST_CREATED,
  REQUEST_UPDATED,
  NOTIFICATION,
  MESSAGE_SENT,
  HOTEL_UPDATED
} from "../../services/infra/pubsub.js"
import { subscriptionAuthMiddleware } from "../../services/infra/subscriptionAuth.js"
import { publishRequestUpdated } from "../../services/infra/subscriptionPayloads.js"
import { withFilter } from "graphql-subscriptions"
import calculateMeal from "../../services/meal/calculateMeal.js"
import nodemailer from "nodemailer"
import {
  formatDate,
  reverseDateTimeFormatter
} from "../../services/format/dateTimeFormater.js"
import {
  adminHotelAirMiddleware,
  airlineAdminMiddleware,
  airlineModerMiddleware,
  allMiddleware,
  dispatcherModerMiddleware,
  moderatorMiddleware
} from "../../middlewares/authMiddleware.js"
import updateDailyMeals from "../../services/meal/updateDailyMeals.js"
import { uploadFiles, deleteFiles } from "../../services/files/uploadFiles.js"
import { shouldSendNotification } from "../../services/notification/notificationRateGuard.js"
import { sendRequestPartyEmail } from "../../services/notification/sendRequestPartyEmail.js"
import { resolveCreatorDepartmentFromSender } from "../../services/notification/resolveCreatorAirlineDepartment.js"
import {
  buildCancelRequestDoneEmail,
  buildCancelRequestRequestEmail,
  buildCreateRequestEmail,
  buildExtendRequestEmail,
  buildUpdateRequestEmail
} from "../../services/email/requestEmailTemplates.js"
import { ensureNoOverlap } from "../../services/rooms/ensureNoOverlap.js"
import { resolveAvailablePlace } from "../../services/rooms/roomAvailability.js"
import { logger } from "../../services/infra/logger.js"
import { travellineService } from "../../services/travelline/travellineService.js"
import {
  recalculateRequestPricing,
  recalculateOverlappingRequests,
  recalculateAffectedByRoomChange
} from "../../services/request/requestPricing.js"
import { generateNextRequestNumber } from "../../services/request/generateRequestNumber.js"
import { importBulkRequestsFromFile } from "../../services/request/bulkImport/createBulkRequests.js"
import {
  buildRequestListWhere,
  REQUEST_LIST_INCLUDE
} from "../../services/request/buildRequestListWhere.js"
import { groupRequestsByAirlineAirportMonth } from "../../services/request/groupRequestsByAirlineAirportMonth.js"

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

const notifyReceiverEmail =
  process.env.EMAIL_RECEIVER || process.env.EMAIL_RESIEVER

// Основной объект-резольвер для работы с заявками (request)
const requestResolver = {
  // Подключаем тип Upload для обработки загрузки файлов через GraphQL
  Upload: GraphQLUpload,

  Query: {
    // Получение списка заявок с пагинацией и фильтрацией по статусу.
    // Если у пользователя задан airlineId, добавляется фильтр по нему.
    // Исключаются архивные заявки (archive: true).
    requests: async (_, { pagination }, context) => {
      await allMiddleware(context) // MIDDLEWARE_REVIEW: allMiddleware
      const { user } = context
      const { skip = 0, take = 10 } = pagination || {}

      const where = buildRequestListWhere({
        pagination,
        user,
        archive: false
      })

      const totalCount = await prisma.request.count({ where })

      const totalPages = Math.ceil(totalCount / take)

      const requests = await prisma.request.findMany({
        where,
        skip: skip * take,
        take,
        include: REQUEST_LIST_INCLUDE,
        orderBy: { createdAt: "desc" }
      })

      return {
        totalCount,
        totalPages,
        requests
      }
    },
    requestsByGroup: async (_, { pagination }, context) => {
      await allMiddleware(context)
      const { user } = context

      const where = buildRequestListWhere({
        pagination,
        user,
        archive: false
      })

      return groupRequestsByAirlineAirportMonth({
        prisma,
        where,
        pagination
      })
    },
    // Получение архивных заявок.
    // Доступно только для администраторов авиалиний (airlineAdminMiddleware).
    requestArchive: async (_, { pagination }, context) => {
      const { user } = context
      await airlineAdminMiddleware(context)

      const { skip = 0, take = 10 } = pagination || {}

      const where = buildRequestListWhere({
        pagination,
        user,
        archive: true
      })

      const totalCount = await prisma.request.count({ where })

      const totalPages = Math.ceil(totalCount / take)

      const requests = await prisma.request.findMany({
        where,
        skip: skip * take,
        take,
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
      await allMiddleware(context) // MIDDLEWARE_REVIEW: allMiddleware
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
      //   await airlineAdminMiddleware(context)
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
              description: "Заявка открыта",
              fulldescription: `Заявка № ${updatedRequest.requestNumber} открыта пользователем ${user.name}`,
              oldData: { status: "created" },
              newData: { status: "opened" },
              requestId: updatedRequest.id
            })
          } catch (error) {
            console.error("Ошибка при логировании открытия заявки:", error)
          }
        }
        await publishRequestUpdated(updatedRequest.id)
        return updatedRequest
      }
      // if (request.hotelChess) {

      // }
      return request
    }
  },

  Mutation: {
    // Создание новой заявки.
    // Здесь происходит проверка мидлвара (airlineModerMiddleware), формирование уникального номера заявки,
    // загрузка файлов, создание записи в базе, создание чата для заявки и логирование действия.
    createRequest: async (_, { input, files }, context) => {
      const { user } = context
      await airlineModerMiddleware(context)
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
        reserve,
        defaultTimesUsed,
        note
      } = input
      // Приведение дат к формату YYYY-MM-DD (отсекаем время)
      const arrivalDate = arrival.split("T")[0]
      const departureDate = departure.split("T")[0]
      // Проверяем, существует ли уже заявка с такими же параметрами (исключая отмененные).
      let existingRequest = null
      let personExist = null

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

        personExist = await prisma.request.findFirst({
          where: {
            personId,
            airlineId,
            arrival: {
              gte: new Date(arrivalDate),
              lte: new Date(departureDate)
            },
            departure: {
              gte: new Date(arrivalDate),
              lte: new Date(departureDate)
            }
          }
        })
        if (personExist != null) {
          console.error(
            `person already exist in: ${personExist} \n requestId: ${personExist.id}`
          )
        }
      }
      // if (existingRequest != null) {
      //   throw new Error(
      //     `Request already exists with id: ${existingRequest.id} \n request number: ${existingRequest.requestNumber}`
      //   )
      // }
      // Формирование номера заявки
      const { requestNumber } = await generateNextRequestNumber(
        prisma,
        airportId
      )
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
      const creatorDepartmentId = await resolveCreatorDepartmentFromSender({
        senderId,
        personId
      })

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
          ...(creatorDepartmentId
            ? {
                airlineDepartment: { connect: { id: creatorDepartmentId } }
              }
            : {}),
          status,
          reserve,
          defaultTimesUsed: defaultTimesUsed ?? false,
          ...(note != null ? { note } : {}),
          files: filesPath,
          requestNumber
        },
        include: {
          airline: true,
          airport: true,
          person: { include: { position: true } }
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
      const createEmail = buildCreateRequestEmail({
        requestNumber: newRequest.requestNumber,
        personName: newRequest.person?.name,
        positionName: newRequest.person?.position?.name,
        airportName: newRequest.airport.name,
        isPreliminary: !(newRequest.person && newRequest.person.position),
        airlineName: newRequest.airline.name,
        arrivalTime: formatDate(newRequest.arrival),
        departureTime: formatDate(newRequest.departure),
        mealPlan: newRequest.mealPlan,
        requestId: newRequest.id
      })
      await sendRequestPartyEmail({
        actor: user,
        airlineId,
        action: "create_request",
        subject: createEmail.subject,
        html: createEmail.html,
        entityType: "request",
        entityId: newRequest.id,
        dispatcherFallbackTo: "EMAIL_KARS"
      })

      // Логирование создания заявки
      try {
        const description = "Заявка создана"
        const fulldescription =
          newRequest.person && newRequest.person.position
            ? `Пользователь ${user.name} создал заявку №${newRequest.requestNumber} для ${newRequest.person.position.name} ${newRequest.person.name} в аэропорт ${newRequest.airport.name}`
            : `Пользователь ${user.name} создал предварительную бронь №${newRequest.requestNumber} в аэропорт ${newRequest.airport.name}`

        await logAction({
          context,
          action: "create_request",
          description,
          fulldescription,
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
      const createRequestSiteAllowed = shouldSendNotification({
        channel: "site",
        action: "create_request",
        entityType: "request",
        entityId: newRequest.id
      }).allowed

      await prisma.notification.create({
        data: {
          request: { connect: { id: newRequest.id } },
          airline: { connect: { id: airlineId } },
          description: {
            action: "create_request",
            description:
              newRequest.person && newRequest.person.position
                ? `Создана заявка <span style='color:#545873'>${newRequest.requestNumber}</span> 
                        для <span style='color:#545873'>${newRequest.person.position.name} ${newRequest.person.name}</span> 
                        в аэропорт <span style='color:#545873'>${newRequest.airport.name}</span>`
                : `Создана предварительная бронь <span style='color:#545873'>${newRequest.requestNumber}</span> 
                        в аэропорт <span style='color:#545873'>${newRequest.airport.name}</span>`
          }
        }
      })
      pubsub.publish(NOTIFICATION, {
        notification: {
          __typename: "RequestCreatedNotification",
          action: "create_request",
          requestId: newRequest.id,
          arrival: newRequest.arrival,
          departure: newRequest.departure,
          airline: newRequest.airline
        }
      })

      pubsub.publish(REQUEST_CREATED, { requestCreated: newRequest })
      return newRequest
    },

    importBulkRequests: async (_, { file, input }, context) => {
      await airlineModerMiddleware(context)

      const result = await importBulkRequestsFromFile({ file, input, context })

      if (result.firstRequest) {
        pubsub.publish(REQUEST_CREATED, {
          requestCreated: result.firstRequest
        })
      }

      return {
        bulkGroupId: result.bulkGroupId || "",
        createdCount: result.createdCount,
        linkNumbers: result.linkNumbers,
        errors: result.errors,
        sourceFile: result.sourceFile
      }
    },

    // Обновление существующей заявки.
    // Производится сравнение новых дат с текущими, обновление связанных сущностей (например, hotelChess)
    // и пересчёт плана питания, если даты изменились.

    updateRequest: async (_, { id, input }, context) => {
      const { user } = context
      // await airlineModerMiddleware(context)
      await moderatorMiddleware(context)

      try {
        const currentTime = new Date()
        const adjustedTime = new Date(
          currentTime.getTime() + 3 * 60 * 60 * 1000
        )
        const formattedTime = adjustedTime.toISOString()

        const newStart = input.arrival
        const newEnd = input.departure
        const status = input.status
        const {
          roomId,
          place,
          airlineId,
          mealPlan: inputMealPlan,
          personId,
          hotelId: inputHotelId,
          ...requestInput
        } = input
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
        if (!request) throw new Error("Request not found")

        const oldHotelChess = request.hotelChess?.[0]
        const oldRoomId = oldHotelChess?.roomId
        const oldChessStart = oldHotelChess?.start
        const oldChessEnd = oldHotelChess?.end

        const now = new Date()
        const updatedStart = newStart ? newStart : request.arrival
        const updatedEnd = newEnd ? newEnd : request.departure

        if (updatedEnd < updatedStart) {
          throw new Error(
            "the end of an Request cannot be before its beginning"
          )
        }

        if (input.actualCheckInAt != null) {
          const actualCheckIn = new Date(input.actualCheckInAt)
          const checkOutEnd = oldHotelChess?.end
            ? new Date(oldHotelChess.end)
            : updatedEnd
          if (actualCheckIn > checkOutEnd) {
            throw new Error(
              "Фактическое заселение не может быть позже даты выезда"
            )
          }
        }

        const wantsPlacement = roomId != null
        const isHotelChange =
          inputHotelId != null && inputHotelId !== request.hotelId

        if (isHotelChange && request.arrival <= now) {
          throw new Error("Нельзя изменить отель после даты заселения")
        }

        const isAirlineChange =
          airlineId != null && airlineId !== request.airlineId

        if (isAirlineChange) {
          await prisma.request.update({
            where: { id: requestId },
            data: {
              person: { disconnect: true },
              airline: { connect: { id: airlineId } }
            }
          })
          if (request.hotelChess?.length > 0) {
            await prisma.hotelChess.update({
              where: { id: request.hotelChess[0].id },
              data: { client: { disconnect: true } }
            })
          }
        }

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

          if (request.hotelChess.length != 0) {
            await prisma.hotelChess.update({
              where: { id: request.hotelChess[0].id },
              data: { client: { connect: { id: input.personId } } }
            })
          }
        }

        if (user.airlineId && request.status != "created") {
          const extendRequest = {
            requestId,
            newStart,
            newEnd
          }

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

          const extendRequestSiteAllowed = shouldSendNotification({
            channel: "site",
            action: "extend_request",
            entityType: "request",
            entityId: extendRequest.requestId
          }).allowed

          if (extendRequestSiteAllowed) {
            await prisma.notification.create({
              data: {
                request: { connect: { id: extendRequest.requestId } },
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
          }

          const extendEmail = buildExtendRequestEmail({
            requestNumber: request.requestNumber,
            oldArrival: formatDate(request.arrival),
            oldDeparture: formatDate(request.departure),
            newArrival: formatDate(updatedStart),
            newDeparture: formatDate(updatedEnd),
            airlineName: request.airline.name,
            requestId: extendRequest.requestId
          })
          await sendRequestPartyEmail({
            actor: user,
            airlineId: request.airlineId,
            action: "extend_request",
            subject: extendEmail.subject,
            html: extendEmail.html,
            entityType: "request",
            entityId: extendRequest.requestId,
            dispatcherFallbackTo: "EMAIL_KARS"
          })

          if (extendRequestSiteAllowed) {
            pubsub.publish(NOTIFICATION, {
              notification: {
                __typename: "ExtendRequestNotification",
                action: "extend_request",
                requestId: extendRequest.requestId,
                newStart: extendRequest.newStart,
                newEnd: extendRequest.newEnd,
                airline: request.airline
              }
            })
          }
          pubsub.publish(MESSAGE_SENT, { messageSent: message })

          return request
        }

        const enabledMeals = {
          breakfast:
            inputMealPlan?.breakfastEnabled ??
            request.mealPlan?.breakfastEnabled ??
            true,
          lunch:
            inputMealPlan?.lunchEnabled ??
            request.mealPlan?.lunchEnabled ??
            true,
          dinner:
            inputMealPlan?.dinnerEnabled ??
            request.mealPlan?.dinnerEnabled ??
            true
        }

        let mealPlanData = request.mealPlan

        const datesChanged =
          new Date(updatedStart).getTime() !==
            new Date(request.arrival).getTime() ||
          new Date(updatedEnd).getTime() !==
            new Date(request.departure).getTime()

        let placementHotelId = request.hotelId
        let placementRoom = null
        let placementPlace = null
        let shouldRemoveHotelChess = false

        if (wantsPlacement) {
          placementRoom = await prisma.room.findUnique({
            where: { id: roomId },
            select: {
              id: true,
              hotelId: true,
              name: true,
              category: true,
              places: true
            }
          })
          if (!placementRoom) {
            throw new Error("Room not found")
          }

          if (inputHotelId && inputHotelId !== placementRoom.hotelId) {
            throw new Error("Номер не относится к указанному отелю")
          }

          if (
            request.arrival <= now &&
            placementRoom.hotelId !== request.hotelId
          ) {
            throw new Error("Нельзя изменить отель после даты заселения")
          }

          placementHotelId = placementRoom.hotelId
          placementPlace = await resolveAvailablePlace(
            placementRoom,
            updatedStart,
            updatedEnd,
            place,
            request.hotelChess?.[0]?.id
          )
        } else if (inputHotelId != null) {
          shouldRemoveHotelChess = true
          placementHotelId = inputHotelId
        }

        if (shouldRemoveHotelChess && request.hotelChess?.length) {
          await prisma.hotelChess.delete({
            where: { id: request.hotelChess[0].id }
          })
        }

        const mealIncludedChanged =
          inputMealPlan?.included !== undefined &&
          inputMealPlan.included !== request.mealPlan?.included
        const breakfastEnabledChanged =
          inputMealPlan?.breakfastEnabled !== undefined &&
          inputMealPlan.breakfastEnabled !== request.mealPlan?.breakfastEnabled
        const lunchEnabledChanged =
          inputMealPlan?.lunchEnabled !== undefined &&
          inputMealPlan.lunchEnabled !== request.mealPlan?.lunchEnabled
        const dinnerEnabledChanged =
          inputMealPlan?.dinnerEnabled !== undefined &&
          inputMealPlan.dinnerEnabled !== request.mealPlan?.dinnerEnabled

        const needRecalcMeal =
          datesChanged ||
          isHotelChange ||
          wantsPlacement ||
          mealIncludedChanged ||
          breakfastEnabledChanged ||
          lunchEnabledChanged ||
          dinnerEnabledChanged

        const hotelIdForMeal = wantsPlacement
          ? placementHotelId
          : (inputHotelId ?? request.hotelId)

        if (needRecalcMeal && hotelIdForMeal) {
          const hotel = await prisma.hotel.findUnique({
            where: { id: hotelIdForMeal },
            select: {
              breakfast: true,
              lunch: true,
              dinner: true
            }
          })
          if (hotel) {
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
              included:
                inputMealPlan?.included ?? request.mealPlan?.included ?? true,
              breakfast: calculatedMealPlan.totalBreakfast,
              breakfastEnabled: enabledMeals.breakfast,
              lunch: calculatedMealPlan.totalLunch,
              lunchEnabled: enabledMeals.lunch,
              dinner: calculatedMealPlan.totalDinner,
              dinnerEnabled: enabledMeals.dinner,
              dailyMeals: calculatedMealPlan.dailyMeals
            }
          }
        }

        if (
          request.hotelChess &&
          request.hotelChess.length !== 0 &&
          !wantsPlacement &&
          !isHotelChange
        ) {
          if (datesChanged) {
            await ensureNoOverlap(
              request.hotelChess[0].roomId,
              request.hotelChess[0].place,
              updatedStart,
              updatedEnd,
              request.hotelChess[0].id
            )
          }
          const updatedHotelChess = await prisma.hotelChess.update({
            where: { id: request.hotelChess[0].id },
            data: {
              start: updatedStart,
              end: updatedEnd,
              mealPlan: mealPlanData
            }
          })
          pubsub.publish(HOTEL_UPDATED, { hotelUpdated: updatedHotelChess })
        }

        if (wantsPlacement) {
          await ensureNoOverlap(
            placementRoom.id,
            placementPlace,
            updatedStart,
            updatedEnd,
            request.hotelChess?.[0]?.id
          )

          const existingHc =
            request.hotelChess?.[0] ||
            (await prisma.hotelChess.findFirst({ where: { requestId } }))

          if (existingHc) {
            const updatedHotelChess = await prisma.hotelChess.update({
              where: { id: existingHc.id },
              data: {
                hotel: { connect: { id: placementHotelId } },
                room: { connect: { id: placementRoom.id } },
                place: placementPlace,
                start: updatedStart,
                end: updatedEnd,
                mealPlan: mealPlanData
              }
            })
            pubsub.publish(HOTEL_UPDATED, {
              hotelUpdated: updatedHotelChess
            })
          } else {
            const newHotelChess = await prisma.hotelChess.create({
              data: {
                hotel: { connect: { id: placementHotelId } },
                room: { connect: { id: placementRoom.id } },
                place: placementPlace,
                start: updatedStart,
                end: updatedEnd,
                request: { connect: { id: requestId } },
                mealPlan: mealPlanData
              }
            })
            pubsub.publish(HOTEL_UPDATED, { hotelUpdated: newHotelChess })
          }
        }

        if (inputMealPlan && request.mealPlan) {
          mealPlanData = {
            ...mealPlanData,
            included: inputMealPlan.included,
            breakfastEnabled:
              inputMealPlan.breakfastEnabled ?? mealPlanData.breakfastEnabled,
            lunchEnabled:
              inputMealPlan.lunchEnabled ?? mealPlanData.lunchEnabled,
            dinnerEnabled:
              inputMealPlan.dinnerEnabled ?? mealPlanData.dinnerEnabled
          }
          if (!inputMealPlan.included) {
            mealPlanData.breakfast = 0
            mealPlanData.lunch = 0
            mealPlanData.dinner = 0
            mealPlanData.dailyMeals = []
          }
        }

        const updatedRequest = await prisma.request.update({
          where: { id: requestId },
          data: {
            arrival: updatedStart,
            departure: updatedEnd,
            mealPlan: mealPlanData,
            status: wantsPlacement ? "done" : status,
            ...requestInput,
            ...(wantsPlacement
              ? {
                  hotel: { connect: { id: placementHotelId } },
                  roomCategory: placementRoom?.category || null,
                  roomNumber: placementRoom?.name || null,
                  placementAt: formattedTime,
                  posted: { connect: { id: user.id } }
                }
              : {}),
            ...(isHotelChange && !wantsPlacement
              ? {
                  ...(placementHotelId
                    ? { hotel: { connect: { id: placementHotelId } } }
                    : {}),
                  roomCategory: null,
                  roomNumber: null,
                  placementAt: null,
                  posted: { disconnect: true }
                }
              : {})
          },
          include: {
            hotelChess: true,
            person: true
          }
        })

        const updateEmail = buildUpdateRequestEmail({
          requestNumber: updatedRequest.requestNumber,
          oldArrival: formatDate(request.arrival),
          oldDeparture: formatDate(request.departure),
          newArrival: formatDate(updatedStart),
          newDeparture: formatDate(updatedEnd)
        })
        await sendRequestPartyEmail({
          actor: user,
          airlineId: request.airlineId ?? updatedRequest.airlineId,
          action: "update_request",
          subject: updateEmail.subject,
          html: updateEmail.html,
          entityType: "request",
          entityId: updatedRequest.id,
          dispatcherFallbackTo: "EMAIL_RECEIVER"
        })

        try {
          await logAction({
            context,
            action: "update_request",
            description: "Данные заявки обновлены",
            fulldescription: `Даты заявки обновлены с ${formatDate(request.arrival)} - ${formatDate(request.departure)} до ${formatDate(updatedStart)} - ${formatDate(updatedEnd)}`,
            oldData: request,
            newData: updatedRequest,
            requestId: updatedRequest.id
          })
        } catch (error) {
          console.error("Ошибка при логировании изменения заявки:", error)
        }

        const newHc = updatedRequest.hotelChess?.[0]
        const newRoomId =
          newHc?.roomId || (wantsPlacement ? placementRoom?.id : null)

        if (newRoomId || oldRoomId) {
          await recalculateRequestPricing(requestId)

          if (wantsPlacement || isHotelChange) {
            await recalculateAffectedByRoomChange(
              oldRoomId,
              oldChessStart,
              oldChessEnd,
              newRoomId,
              updatedStart,
              updatedEnd,
              requestId
            )
          } else if (datesChanged && oldRoomId) {
            await recalculateOverlappingRequests(
              oldRoomId,
              oldChessStart,
              oldChessEnd,
              requestId
            )
            await recalculateOverlappingRequests(
              oldRoomId,
              updatedStart,
              updatedEnd,
              requestId
            )
          }
        }

        await publishRequestUpdated(updatedRequest.id)
        return updatedRequest
      } catch (error) {
        logger.error("Ошибка при обновлении заявки. ", error)
        throw new Error(error)
      }
    },

    // Изменение ежедневного плана питания заявки.
    // Вызывает функцию updateDailyMeals для обновления плана питания и логирует действие.
    modifyDailyMeals: async (_, { input }, context) => {
      await moderatorMiddleware(context)
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
      await recalculateRequestPricing(requestId)
      try {
        await logAction({
          context,
          action: "update_request",
          description: "Питание заявки обновлено",
          fulldescription: `Пользователь ${user.name} изменил питание для заявки № ${request.requestNumber}`,
          oldData: request,
          newData: updatedMealPlan,
          requestId: request.id
        })
      } catch (error) {
        console.error("Ошибка при логировании изменения питания заявки:", error)
      }
      await publishRequestUpdated(request.id)
      return updatedMealPlan
    },

    // Архивация заявки.
    // Если дата отбытия меньше текущей и статус заявки не "archived", меняем статус на "archived".
    archivingRequest: async (_, input, context) => {
      const { user } = context
      await dispatcherModerMiddleware(context)
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
          data: { status: "archived", archive: true, archivingAt: new Date() }
        })
        await logAction({
          context,
          action: "archive_request",
          description: "Заявка архивирована",
          fulldescription: `Пользователь ${user.name} отправил заявку № ${archiveRequest.requestNumber} в архив`,
          oldData: request,
          newData: { status: "archived" },
          hotelId: request.hotelId,
          requestId: request.id
        })
        await publishRequestUpdated(requestId)
        return archiveRequest
      } else {
        throw new Error("Request is not expired or already archived")
      }
    },

    // Отмена заявки.
    // Обновляем статус заявки на "canceled", удаляем связанные hotelChess и логируем действие.
    cancelRequest: async (_, input, context) => {
      const { user } = context
      await airlineModerMiddleware(context)
      const requestId = input.id
      const request = await prisma.request.findUnique({
        where: { id: requestId },
        include: { hotelChess: true }
      })

      // Запрос на отмену (чат, site, email) — только если заявка уже не в статусе created.
      // При created авиакомпания отменяет заявку самостоятельно, без запроса диспетчеру.
      if (
        user.airlineId &&
        !user.dispatcher &&
        request.status !== "created"
      ) {
        const currentTime = new Date()
        const adjustedTime = new Date(
          currentTime.getTime() + 3 * 60 * 60 * 1000
        )
        const formattedTime = adjustedTime.toISOString()

        let chat = await prisma.chat.findFirst({
          where: { requestId: requestId, separator: "airline" }
        })
        if (!chat) {
          chat = await prisma.chat.create({
            data: {
              request: { connect: { id: requestId } },
              separator: "airline",
              ...(request.airlineId
                ? { airline: { connect: { id: request.airlineId } } }
                : {})
            }
          })
          await prisma.chatUser.create({
            data: {
              chat: { connect: { id: chat.id } },
              user: { connect: { id: user.id } }
            }
          })
        }
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
        const cancelRequestSiteAllowed = shouldSendNotification({
          channel: "site",
          action: "cancel_request",
          entityType: "request",
          entityId: request.id
        }).allowed

        if (cancelRequestSiteAllowed) {
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
        }

        const cancelRequestEmail = buildCancelRequestRequestEmail({
          requestNumber: request.requestNumber,
          requestId: request.id
        })
        await sendRequestPartyEmail({
          actor: user,
          airlineId: request.airlineId,
          action: "cancel_request",
          subject: cancelRequestEmail.subject,
          html: cancelRequestEmail.html,
          entityType: "request",
          entityId: request.id,
          dispatcherFallbackTo: "EMAIL_KARS"
        })

        if (cancelRequestSiteAllowed) {
          pubsub.publish(NOTIFICATION, {
            notification: {
              __typename: "RequestUpdatedNotification",
              action: "cancel_request",
              requestId: request.id,
              arrival: request.arrival,
              departure: request.departure,
              airline: request.airline
            }
          })
        }
        pubsub.publish(MESSAGE_SENT, { messageSent: message })
      }

      // Если заявка размещена через TravelLine — сначала отменяем бронь в TL.
      // Если TL вернул ошибку — пробрасываем её, Request не меняется (предотвращаем рассинхрон).
      if (
        request.externalSource === "travelline" &&
        request.externalBookingNumber
      ) {
        try {
          await travellineService.cancelReservation(
            request.externalBookingNumber
          )
        } catch (err) {
          logger.warn(
            `cancelRequest: TravelLine cancel failed for booking ${request.externalBookingNumber}: ${err?.message}`
          )
          throw new Error(
            `Не удалось отменить бронь в TravelLine: ${err?.message ?? err}. Заявка не отменена.`
          )
        }
      }

      const canceledRequest = await prisma.request.update({
        where: { id: requestId },
        data: { status: "canceled" }
      })
      const canceledHc = request.hotelChess?.[0]
      if (request.hotelChess) {
        await prisma.hotelChess.deleteMany({
          where: { requestId: requestId }
        })
        if (canceledHc?.roomId && canceledHc?.start && canceledHc?.end) {
          await recalculateOverlappingRequests(
            canceledHc.roomId,
            canceledHc.start,
            canceledHc.end
          )
        }
      }

      const cancelDoneEmail = buildCancelRequestDoneEmail({
        requestNumber: canceledRequest.requestNumber
      })
      await sendRequestPartyEmail({
        actor: user,
        airlineId: request.airlineId,
        action: "cancel_request",
        subject: cancelDoneEmail.subject,
        html: cancelDoneEmail.html,
        entityType: "request",
        entityId: canceledRequest.id,
        dispatcherFallbackTo: "EMAIL_RECEIVER"
      })

      await logAction({
        context,
        action: "cancel_request",
        description: "Заявка отменена",
        fulldescription: `Пользователь ${user.name} отменил заявку № ${canceledRequest.requestNumber}`,
        oldData: request,
        newData: { status: "canceled" },
        hotelId: request.hotelId,
        requestId: request.id
      })
      await publishRequestUpdated(request.id)
      return canceledRequest
    }
  },

  Subscription: {
    // Подписка на событие создания заявки

    requestCreated: {
      subscribe: withFilter(
        () => pubsub.asyncIterator(REQUEST_CREATED),
        async (payload, variables, context) => {
          if (
            !(await subscriptionAuthMiddleware(
              allMiddleware,
              context,
              "request.Subscription"
            ))
          ) {
            return false
          }
          const { subject, subjectType } = context

          if (!subject || subjectType !== "USER") return false

          const request = payload.requestCreated

          // SUPERADMIN и диспетчеры видят все
          if (subject.role === "SUPERADMIN" || subject.dispatcher === true) {
            return true
          }

          // Проверяем права по airlineId
          if (subject.airlineId && request.airlineId === subject.airlineId) {
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
        async (payload, variables, context) => {
          if (
            !(await subscriptionAuthMiddleware(
              allMiddleware,
              context,
              "request.Subscription"
            ))
          ) {
            return false
          }
          const { subject, subjectType } = context

          if (!subject || subjectType !== "USER") return false

          const request = payload.requestUpdated

          // SUPERADMIN и диспетчеры видят все
          if (subject.role === "SUPERADMIN" || subject.dispatcher === true) {
            return true
          }

          // Проверяем права по airlineId
          if (subject.airlineId && request.airlineId === subject.airlineId) {
            return true
          }

          // Проверяем права по hotelId
          if (subject.hotelId && request.hotelId === subject.hotelId) {
            return true
          }

          return false
        }
      )
    }
    // notification — подписка с фильтром NotificationMenu в dispatcher.resolver.js
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
        where: { id: parent.airlineId },
        include: { prices: true }
      })
    },
    // Получение отеля, связанного с заявкой (если задан).
    hotel: async (parent) => {
      if (!parent.hotelId) return null
      return await prisma.hotel.findUnique({
        where: { id: parent.hotelId }
      })
    },
    requestHotelPrice: async (parent) => {
      if (!parent.requestHotelPrice) return null
      if (!parent.hotelId) {
        return { ...parent.requestHotelPrice, breakfastIncluded: false }
      }
      const hotel =
        parent.hotel?.breakfastIncluded !== undefined
          ? parent.hotel
          : await prisma.hotel.findUnique({
              where: { id: parent.hotelId },
              select: { breakfastIncluded: true }
            })
      return {
        ...parent.requestHotelPrice,
        breakfastIncluded: Boolean(hotel?.breakfastIncluded)
      }
    },
    requestAirlinePrice: async (parent) => {
      if (!parent.requestAirlinePrice) return null
      if (!parent.hotelId) {
        return { ...parent.requestAirlinePrice, breakfastIncluded: false }
      }
      const hotel =
        parent.hotel?.breakfastIncluded !== undefined
          ? parent.hotel
          : await prisma.hotel.findUnique({
              where: { id: parent.hotelId },
              select: { breakfastIncluded: true }
            })
      return {
        ...parent.requestAirlinePrice,
        breakfastIncluded: Boolean(hotel?.breakfastIncluded)
      }
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
          where: { id: parent.personId },
          include: { position: true }
        })
      } else {
        return null
      }
    },
    // Получение логов по заявке с информацией о пользователе, выполнившем действие.
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

// Каркас заявки: создание, обновление, файлы, статусы, экипаж, распознавание документа.

import { prisma } from "../../prisma.js"
import { GraphQLError } from "graphql"
import {
  resolveUserId,
  updateTimes
} from "../../services/passengerRequest/utils.js"
import { normalizeDriversForWrite } from "../../services/passengerRequest/baggageDelivery.js"
import { normalizeCrewMember } from "../../services/passengerRequest/normalizers.js"
import {
  finishPassengerRequestMutation,
  getSubjectName,
  loadRequestOrThrow,
  withPassengerRequest
} from "../../services/passengerRequest/envelope.js"
import {
  findPassengerService,
  PASSENGER_SERVICE_FIELDS,
  PASSENGER_SERVICE_TABLE
} from "../../services/passengerRequest/serviceTable.js"
import { recognizePassengerDocument as recognizeDocumentService } from "../../services/docRecognition/recognizePassengerDocument.js"
import { recognitionRateLimiter } from "../../services/docRecognition/recognitionRateLimit.js"
import { logger } from "../../services/infra/logger.js"
import { recomputeServiceStatus } from "../../services/passengerRequest/serviceStatus.js"
import {
  deleteAllPassengerRequestFilesFromDisk,
  deletePassengerRequestFileFromDisk,
  findPassengerRequestFileIndex,
  uploadPassengerRequestFiles
} from "../../services/passengerRequest/files.js"
import {
  pubsub,
  PASSENGER_REQUEST_CREATED
} from "../../services/infra/pubsub.js"
import { formatDate } from "../../services/format/dateTimeFormater.js"
import { logPassengerRequestAction } from "../../services/passengerRequest/logging.js"
import {
  notifyPassengerRequestSite,
  passengerRequestFlightDateChanged
} from "../../services/passengerRequest/notify.js"
import { generateRepresentativeLinksForRequest } from "../../services/passengerRequest/externalLinks.js"

export default {
  Mutation: {
    // создание
    createPassengerRequest: async (_, { input, files }, context) => {
      const {
        airlineId,
        airportId,
        crewMembers,
        status,
        createdById: inputCreatorId,
        ...rest
      } = input

      const createdById = resolveUserId(context, inputCreatorId)
      if (!createdById) {
        throw new GraphQLError("createdById is required")
      }
      if (!airlineId || !airportId) {
        throw new GraphQLError("airlineId and airportId are required")
      }

      // Услуги в остатке входа тоже лежат, но уходить в документ как есть не
      // должны: у каждой свой дефолт, он собирается ниже по таблице.
      const data = {}
      for (const [key, value] of Object.entries(rest)) {
        if (!PASSENGER_SERVICE_FIELDS.has(key)) data[key] = value
      }
      data.airline = { connect: { id: airlineId } }
      data.createdBy = { connect: { id: createdById } }

      data.airport = { connect: { id: airportId } }
      if (status) data.status = status

      if (Array.isArray(crewMembers)) {
        data.crewMembers = crewMembers.map(normalizeCrewMember)
      }

      // Услуга заводится, только если пришла во входе. Из входа берётся один
      // план, остальное — дефолт услуги: статус и отметки времени услуги
      // рождаются пустыми независимо от того, что прислал клиент.
      for (const entry of PASSENGER_SERVICE_TABLE) {
        const service = input[entry.field]
        if (service) {
          data[entry.field] = { ...entry.empty(), plan: service.plan || null }
        }
      }
      // Формирование уникального requestNumber: {seq4}{airportCode}{MM}{YY}f
      const now = new Date()
      const month = String(now.getMonth() + 1).padStart(2, "0")
      const year = String(now.getFullYear()).slice(-2)
      const lastRequest = await prisma.passengerRequest.findFirst({
        where: { requestNumber: { not: null } },
        orderBy: { createdAt: "desc" },
        select: { requestNumber: true }
      })
      let sequenceNumber = "0001"
      if (lastRequest?.requestNumber) {
        const lastNumber = parseInt(lastRequest.requestNumber.slice(0, 4), 10)
        if (Number.isFinite(lastNumber)) {
          sequenceNumber = String(lastNumber + 1).padStart(4, "0")
        }
      }
      const airportForNumber = await prisma.airport.findUnique({
        where: { id: airportId },
        select: { code: true }
      })
      const airportCode = airportForNumber?.code || "XXX"
      data.requestNumber = `${sequenceNumber}${airportCode}${month}${year}f`

      let passengerRequest = await prisma.passengerRequest.create({ data })
      const adminId =
        context.subjectType === "USER" ? context.subject?.id : null
      const representativeLinks = await generateRepresentativeLinksForRequest({
        requestId: passengerRequest.id,
        airlineId: passengerRequest.airlineId,
        airportId: passengerRequest.airportId,
        adminId
      })
      passengerRequest = await prisma.passengerRequest.update({
        where: { id: passengerRequest.id },
        data: { representativeLinks }
      })

      if (files?.length > 0) {
        const uploadedPaths = await uploadPassengerRequestFiles(
          passengerRequest.id,
          files
        )
        if (uploadedPaths.length > 0) {
          passengerRequest = await prisma.passengerRequest.update({
            where: { id: passengerRequest.id },
            data: { files: uploadedPaths }
          })
        }
      }

      // Хвост конверта здесь неприменим: он публикует гидрированную заявку в
      // топик обновления, а создание уходит СЫРЫМ в собственный топик.
      await logPassengerRequestAction({
        context,
        action: "create_passenger_request",
        description: "ФАП создан",
        fulldescription: `Пользователь ${getSubjectName(context)} создал ФАП ${passengerRequest.requestNumber || passengerRequest.flightNumber}`,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
      })

      pubsub.publish(PASSENGER_REQUEST_CREATED, {
        passengerRequestCreated: passengerRequest
      })

      const airport = passengerRequest.airportId
        ? await prisma.airport.findUnique({
            where: { id: passengerRequest.airportId },
            select: { name: true }
          })
        : null
      const routeParts = [
        passengerRequest.routeFrom,
        passengerRequest.routeTo
      ].filter(Boolean)
      const routePart = routeParts.length
        ? `, маршрут <span style='color:#545873'>${routeParts.join(" → ")}</span>`
        : ""
      const airportPart = airport?.name
        ? `, аэропорт <span style='color:#545873'>${airport.name}</span>`
        : ""
      await notifyPassengerRequestSite({
        action: "create_passenger_request",
        passengerRequestId: passengerRequest.id,
        airlineId: passengerRequest.airlineId,
        descriptionHtml: `Создан ФАП <span style='color:#545873'>${passengerRequest.flightNumber}</span>${routePart}${airportPart}`,
        __typename: "PassengerRequestCreatedNotification"
      })

      return passengerRequest
    },

    // обновление шапки + планов
    updatePassengerRequest: async (_, { id, input }, context) =>
      withPassengerRequest({
        requestId: id,
        context,
        apply: async (existing) => {
          const { airlineId, airportId, crewMembers, ...rest } = input

          const data = {}

          Object.entries(rest).forEach(([key, value]) => {
            if (value === undefined) return
            // Услуги разбираются ниже поштучно; попав сюда, сервисный объект
            // уехал бы в документ как есть — без пересчёта статуса и без
            // нормализации водителей.
            if (PASSENGER_SERVICE_FIELDS.has(key)) return
            data[key] = value
          })

          if (Array.isArray(crewMembers)) {
            data.crewMembers = crewMembers.map(normalizeCrewMember)
          }

          if (airlineId) {
            data.airline = { connect: { id: airlineId } }
          }

          if (airportId !== undefined) {
            if (airportId === null) data.airport = { disconnect: true }
            else data.airport = { connect: { id: airportId } }
          }

          // Правка плана меняет статус, не меняя факта: число людей до и после
          // одно и то же, поэтому пересчёт зовётся с одинаковыми счётчиками —
          // сработать может только правило «факт >= плана» и обратное ему.
          // Чем именно меряется факт у каждой услуги — в serviceTable.js.
          for (const entry of PASSENGER_SERVICE_TABLE) {
            const service = input[entry.field]
            if (!service) continue

            const prev = existing[entry.field] || {}
            const mergedPlan =
              service.plan !== undefined ? service.plan : prev.plan
            const current = entry.factCount(prev)
            const recalc = recomputeServiceStatus(
              { ...prev, plan: mergedPlan },
              current,
              current
            )
            data[entry.field] = {
              ...prev,
              ...(service.plan !== undefined && { plan: service.plan }),
              // Пассажиров чинят только водительские услуги; вода, питание и
              // проживание уносят своих людей из prev как есть.
              ...(entry.hasDrivers && {
                drivers: normalizeDriversForWrite(prev.drivers)
              }),
              status: recalc.status,
              times: recalc.times
            }
          }

          const isDateChange = passengerRequestFlightDateChanged(
            existing.flightDate,
            rest.flightDate
          )
          const emailAction = isDateChange
            ? "passenger_request_dates_change"
            : "update_passenger_request"

          return {
            data,
            // Единственная мутация модуля, способная сменить airlineId, поэтому
            // лог собирается по ЗАПИСАННОМУ документу, а не по прочитанному.
            // Билдер асинхронный: название авиакомпании для письма о переносе
            // даты читается ПОСЛЕ записи заявки, как было до конверта.
            log: async (passengerRequest) => {
              let emailExtras = {}
              if (isDateChange) {
                const airline = passengerRequest.airlineId
                  ? await prisma.airline.findUnique({
                      where: { id: passengerRequest.airlineId },
                      select: { name: true }
                    })
                  : null
                emailExtras = {
                  oldFlightDate: formatDate(existing.flightDate),
                  newFlightDate: formatDate(passengerRequest.flightDate),
                  airlineName: airline?.name
                }
              }
              return {
                action: "update_passenger_request",
                description: "ФАП обновлен",
                fulldescription: `Пользователь ${getSubjectName(context)} обновил ФАП ${passengerRequest.flightNumber}`,
                airlineId: passengerRequest.airlineId,
                passengerRequestId: passengerRequest.id,
                emailAction,
                emailExtras
              }
            },
            // Условие «есть что писать» стоит только на уведомлении: пустой
            // патч всё равно доходит до записи и до истории.
            notify:
              Object.keys(data).length > 0
                ? (passengerRequest) => ({
                    action: emailAction,
                    passengerRequestId: passengerRequest.id,
                    airlineId: passengerRequest.airlineId,
                    descriptionHtml: `Обновлён ФАП <span style='color:#545873'>${passengerRequest.flightNumber}</span>`,
                    __typename: "PassengerRequestUpdatedNotification"
                  })
                : null,
            // Здесь уведомление уходит ПЕРЕД публикацией — в отличие от
            // соседнего cancelPassengerRequest. Расхождение наблюдаемо.
            notifyBeforePublish: true
          }
        }
      }),

    addPassengerRequestFiles: async (_, { requestId, files }, context) =>
      withPassengerRequest({
        requestId,
        context,
        apply: async (existing) => {
          // Проверка стоит уже ПОСЛЕ чтения заявки: пустой список отбивается,
          // сходив в базу. Асимметрия с пакетными мутациями закреплена тестом.
          if (!files?.length) {
            throw new GraphQLError("At least one file is required")
          }

          // Файлы кладутся на диск ДО записи документа и без транзакции:
          // упавшая загрузка роняет мутацию, не оставив ни записи, ни истории.
          const uploadedPaths = await uploadPassengerRequestFiles(
            requestId,
            files
          )

          return {
            data: { files: [...(existing.files || []), ...uploadedPaths] },
            log: (passengerRequest) => ({
              action: "add_passenger_request_files",
              description: "Файлы добавлены в ФАП",
              fulldescription: `Пользователь ${getSubjectName(context)} добавил ${uploadedPaths.length} файл(ов) в ФАП ${passengerRequest.flightNumber}`,
              airlineId: passengerRequest.airlineId,
              passengerRequestId: passengerRequest.id
            })
          }
        }
      }),

    removePassengerRequestFile: async (_, { requestId, filePath }, context) =>
      withPassengerRequest({
        requestId,
        context,
        apply: async (existing) => {
          const fileIndex = findPassengerRequestFileIndex(
            existing.files,
            filePath
          )
          if (fileIndex < 0) {
            throw new GraphQLError("File not found on this passenger request")
          }

          // С диска файл стирается ДО записи документа — порядок закреплён
          // тестом, менять его нельзя.
          const removedPath = existing.files[fileIndex]
          await deletePassengerRequestFileFromDisk(removedPath)

          return {
            data: {
              files: (existing.files || []).filter(
                (_, index) => index !== fileIndex
              )
            },
            log: (passengerRequest) => ({
              action: "remove_passenger_request_file",
              description: "Файл удалён из ФАП",
              fulldescription: `Пользователь ${getSubjectName(context)} удалил файл из ФАП ${passengerRequest.flightNumber}`,
              airlineId: passengerRequest.airlineId,
              passengerRequestId: passengerRequest.id
            })
          }
        }
      }),

    deletePassengerRequest: async (_, { id }, context) => {
      const existing = await loadRequestOrThrow(id)

      await deleteAllPassengerRequestFilesFromDisk(existing.files)

      // Полный конверт неприменим: документ не обновляется, а удаляется.
      // Остаётся хвост — история и публикация.
      const passengerRequest = await prisma.passengerRequest.delete({
        where: { id }
      })

      await finishPassengerRequestMutation({
        context,
        oldData: passengerRequest,
        // newData у удаления нет вовсе, а в подписку тем не менее уезжает
        // удалённый документ: топика PASSENGER_REQUEST_DELETED не существует.
        newData: undefined,
        publishData: passengerRequest,
        log: {
          action: "delete_passenger_request",
          description: "ФАП удален",
          fulldescription: `Пользователь ${getSubjectName(context)} удалил ФАП ${passengerRequest.flightNumber}`,
          airlineId: passengerRequest.airlineId,
          passengerRequestId: passengerRequest.id
        }
      })

      return true
    },

    // общий статус заявки
    setPassengerRequestStatus: async (_, { id, status }, context) =>
      withPassengerRequest({
        requestId: id,
        context,
        apply: (existing) => ({
          data: {
            status,
            statusTimes: updateTimes(existing.statusTimes, status)
          },
          log: (passengerRequest) => ({
            action: "update_passenger_request_status",
            description: "Статус ФАП обновлен",
            fulldescription: `Пользователь ${getSubjectName(context)} сменил статус ФАП ${passengerRequest.flightNumber} на ${status}`,
            airlineId: passengerRequest.airlineId,
            passengerRequestId: passengerRequest.id
          })
        })
      }),

    // ростер экипажа заявки
    updatePassengerRequestCrew: async (
      _,
      { requestId, crewMembers },
      context
    ) =>
      withPassengerRequest({
        requestId,
        context,
        apply: () => {
          // Не массив стирает ростер: пустой список — это тоже результат.
          const normalizedCrew = Array.isArray(crewMembers)
            ? crewMembers.map(normalizeCrewMember)
            : []

          return {
            data: { crewMembers: normalizedCrew },
            log: (passengerRequest) => ({
              action: "update_passenger_request_crew",
              description: "Обновлён ростер экипажа ФАП",
              fulldescription: `Пользователь ${getSubjectName(context)} обновил ростер экипажа ФАП ${passengerRequest.flightNumber} (${normalizedCrew.length} чел.)`,
              airlineId: passengerRequest.airlineId,
              passengerRequestId: passengerRequest.id
            })
          }
        }
      }),

    // общий статус заявки
    cancelPassengerRequest: async (_, { id, cancelReason }, context) =>
      withPassengerRequest({
        requestId: id,
        context,
        apply: (existing) => {
          const status = "CANCELLED"

          return {
            data: {
              status,
              statusTimes: updateTimes(existing.statusTimes, status),
              cancelReason
            },
            // Слаг лога тот же, что у обычной смены статуса: отмену видно
            // только по description и reason.
            log: (passengerRequest) => ({
              action: "update_passenger_request_status",
              description: "Заявка по ФАП отменена",
              fulldescription: `Пользователь ${getSubjectName(context)} отменил ФАП ${passengerRequest.flightNumber}`,
              reason: cancelReason,
              cancelReason,
              airlineId: passengerRequest.airlineId,
              passengerRequestId: passengerRequest.id,
              emailAction: "cancel_passenger_request"
            }),
            notify: (passengerRequest) => ({
              action: "cancel_passenger_request",
              passengerRequestId: passengerRequest.id,
              airlineId: passengerRequest.airlineId,
              descriptionHtml: `Отменён ФАП <span style='color:#545873'>${passengerRequest.flightNumber}</span>`,
              __typename: "PassengerRequestUpdatedNotification"
            })
          }
        }
      }),

    // статус конкретного сервиса
    setPassengerRequestServiceStatus: async (
      _,
      { id, service, status },
      context
    ) =>
      withPassengerRequest({
        requestId: id,
        context,
        apply: (existing) => {
          const entry = findPassengerService(service)

          // Валидации имени услуги нет: неизвестная услуга даёт пустой апдейт,
          // но лог и публикация всё равно случаются.
          const data = {}
          if (entry) {
            const prev = existing[entry.field] || entry.statusFallback()
            data[entry.field] = {
              ...prev,
              ...(entry.hasDrivers && {
                drivers: normalizeDriversForWrite(prev.drivers)
              }),
              ...(entry.statusExtra && entry.statusExtra(prev)),
              status,
              times: updateTimes(prev.times, status)
            }
          }

          return {
            data,
            log: (passengerRequest) => ({
              action: "update_passenger_request_service_status",
              description: `Статус сервиса обновлен: ${service}`,
              // Единственная в модуле подстановка context?.user?.name вместо
              // getSubjectName: у внешнего пользователя (PWA гостиницы) user
              // отсутствует, и в истории остаётся безымянный «Пользователь».
              fulldescription: `Пользователь ${context?.user?.name ?? "Пользователь"} сменил статус сервиса ${service} в ФАП ${passengerRequest.flightNumber} на ${status}`,
              airlineId: passengerRequest.airlineId,
              passengerRequestId: passengerRequest.id
            })
          }
        }
      }),

    recognizePassengerDocument: async (_, { image }, context) => {
      // Каждый вызов стоит двух платных обращений в Yandex Cloud, поэтому
      // считаем по субъекту. Анонимных вызовов здесь уже не бывает — их
      // отбивает withFapAuthGuard на экспорте модуля.
      //
      // http-статус намеренно НЕ ставим: Apollo Client на любом статусе ≥300
      // бросает ServerError с пустым graphQLErrors, и текст сообщения до
      // клиента не доходит вовсе. Обычная GraphQL-ошибка с кодом читается.
      if (!recognitionRateLimiter.check(context?.subject?.id)) {
        logger.warn(
          `[FAP] Распознавание документа отклонено лимитом, субъект ${context?.subject?.id}`
        )
        throw new GraphQLError("Слишком много запросов на распознавание", {
          extensions: { code: "TOO_MANY_REQUESTS" }
        })
      }
      return await recognizeDocumentService(image)
    }
  }
}

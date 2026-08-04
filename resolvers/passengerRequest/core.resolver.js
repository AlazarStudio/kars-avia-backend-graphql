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
  getSubjectName,
  loadRequestOrThrow,
  publishPassengerRequestUpdated
} from "../../services/passengerRequest/envelope.js"
import { recognizePassengerDocument as recognizeDocumentService } from "../../services/docRecognition/recognizePassengerDocument.js"
import { recognitionRateLimiter } from "../../services/docRecognition/recognitionRateLimit.js"
import { logger } from "../../services/infra/logger.js"
import {
  recomputeServiceStatus,
  transferFactCount
} from "../../services/passengerRequest/serviceStatus.js"
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
        waterService,
        mealService,
        livingService,
        transferService,
        departureTransferService,
        intercityTransferService,
        baggageDeliveryService,
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

      const data = {
        ...rest,
        airline: { connect: { id: airlineId } },
        createdBy: { connect: { id: createdById } }
      }

      data.airport = { connect: { id: airportId } }
      if (status) data.status = status

      if (Array.isArray(crewMembers)) {
        data.crewMembers = crewMembers.map(normalizeCrewMember)
      }

      if (waterService) {
        data.waterService = {
          plan: waterService.plan || null,
          status: "NEW",
          times: null,
          earlyCompletionReason: null,
          earlyCompletedAt: null,
          people: []
        }
      }

      if (mealService) {
        data.mealService = {
          plan: mealService.plan || null,
          status: "NEW",
          times: null,
          earlyCompletionReason: null,
          earlyCompletedAt: null,
          people: []
        }
      }

      if (livingService) {
        data.livingService = {
          plan: livingService.plan || null,
          status: "NEW",
          times: null,
          hotels: [],
          evictions: []
        }
      }

      if (transferService) {
        data.transferService = {
          plan: transferService.plan || null,
          status: "NEW",
          times: null,
          drivers: []
        }
      }

      if (departureTransferService) {
        data.departureTransferService = {
          plan: departureTransferService.plan || null,
          status: "NEW",
          times: null,
          drivers: []
        }
      }

      if (intercityTransferService) {
        data.intercityTransferService = {
          plan: intercityTransferService.plan || null,
          status: "NEW",
          times: null,
          drivers: []
        }
      }

      if (baggageDeliveryService) {
        data.baggageDeliveryService = {
          plan: baggageDeliveryService.plan || null,
          status: "NEW",
          times: null,
          drivers: []
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
    updatePassengerRequest: async (_, { id, input }, context) => {
      const existing = await loadRequestOrThrow(id)

      const {
        airlineId,
        airportId,
        waterService,
        mealService,
        livingService,
        transferService,
        departureTransferService,
        intercityTransferService,
        baggageDeliveryService,
        crewMembers,
        ...rest
      } = input

      const data = {}

      Object.entries(rest).forEach(([key, value]) => {
        if (value !== undefined) data[key] = value
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

      // Факт услуги: список либо «перевезено N» на поездке (max), см. serviceStatus.js.
      // Для багажа transportedCount пуст — поведение прежнее.
      const totalDriverPeople = (drivers) => transferFactCount(drivers)
      const totalHotelPeople = (hotels) =>
        (hotels || []).reduce((sum, h) => sum + (h?.people?.length || 0), 0)

      if (waterService) {
        const prev = existing.waterService || {}
        const mergedPlan =
          waterService.plan !== undefined ? waterService.plan : prev.plan
        const current = (prev.people || []).length
        const recalc = recomputeServiceStatus(
          { ...prev, plan: mergedPlan },
          current,
          current
        )
        data.waterService = {
          ...prev,
          ...(waterService.plan !== undefined && { plan: waterService.plan }),
          status: recalc.status,
          times: recalc.times
        }
      }

      if (mealService) {
        const prev = existing.mealService || {}
        const mergedPlan =
          mealService.plan !== undefined ? mealService.plan : prev.plan
        const current = (prev.people || []).length
        const recalc = recomputeServiceStatus(
          { ...prev, plan: mergedPlan },
          current,
          current
        )
        data.mealService = {
          ...prev,
          ...(mealService.plan !== undefined && { plan: mealService.plan }),
          status: recalc.status,
          times: recalc.times
        }
      }

      if (livingService) {
        const prev = existing.livingService || {}
        const mergedPlan =
          livingService.plan !== undefined ? livingService.plan : prev.plan
        const current = totalHotelPeople(prev.hotels)
        const recalc = recomputeServiceStatus(
          { ...prev, plan: mergedPlan },
          current,
          current
        )
        data.livingService = {
          ...prev,
          ...(livingService.plan !== undefined && { plan: livingService.plan }),
          status: recalc.status,
          times: recalc.times
        }
      }

      if (transferService) {
        const prev = existing.transferService || {}
        const mergedPlan =
          transferService.plan !== undefined ? transferService.plan : prev.plan
        const current = totalDriverPeople(prev.drivers)
        const recalc = recomputeServiceStatus(
          { ...prev, plan: mergedPlan },
          current,
          current
        )
        data.transferService = {
          ...prev,
          ...(transferService.plan !== undefined && {
            plan: transferService.plan
          }),
          drivers: normalizeDriversForWrite(prev.drivers),
          status: recalc.status,
          times: recalc.times
        }
      }

      if (departureTransferService) {
        const prev = existing.departureTransferService || {}
        const mergedPlan =
          departureTransferService.plan !== undefined
            ? departureTransferService.plan
            : prev.plan
        const current = totalDriverPeople(prev.drivers)
        const recalc = recomputeServiceStatus(
          { ...prev, plan: mergedPlan },
          current,
          current
        )
        data.departureTransferService = {
          ...prev,
          ...(departureTransferService.plan !== undefined && {
            plan: departureTransferService.plan
          }),
          drivers: normalizeDriversForWrite(prev.drivers),
          status: recalc.status,
          times: recalc.times
        }
      }

      if (intercityTransferService) {
        const prev = existing.intercityTransferService || {}
        const mergedPlan =
          intercityTransferService.plan !== undefined
            ? intercityTransferService.plan
            : prev.plan
        const current = totalDriverPeople(prev.drivers)
        const recalc = recomputeServiceStatus(
          { ...prev, plan: mergedPlan },
          current,
          current
        )
        data.intercityTransferService = {
          ...prev,
          ...(intercityTransferService.plan !== undefined && {
            plan: intercityTransferService.plan
          }),
          drivers: normalizeDriversForWrite(prev.drivers),
          status: recalc.status,
          times: recalc.times
        }
      }

      if (baggageDeliveryService) {
        const prev = existing.baggageDeliveryService || {}
        const mergedPlan =
          baggageDeliveryService.plan !== undefined
            ? baggageDeliveryService.plan
            : prev.plan
        const current = totalDriverPeople(prev.drivers)
        const recalc = recomputeServiceStatus(
          { ...prev, plan: mergedPlan },
          current,
          current
        )
        data.baggageDeliveryService = {
          ...prev,
          ...(baggageDeliveryService.plan !== undefined && {
            plan: baggageDeliveryService.plan
          }),
          drivers: normalizeDriversForWrite(prev.drivers),
          status: recalc.status,
          times: recalc.times
        }
      }
      const passengerRequest = await prisma.passengerRequest.update({
        where: { id },
        data
      })

      const isDateChange = passengerRequestFlightDateChanged(
        existing.flightDate,
        rest.flightDate
      )
      let emailExtras = {}
      let emailAction = "update_passenger_request"
      if (isDateChange) {
        emailAction = "passenger_request_dates_change"
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

      await logPassengerRequestAction({
        context,
        action: "update_passenger_request",
        description: "ФАП обновлен",
        fulldescription: `Пользователь ${getSubjectName(context)} обновил ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id,
        emailAction,
        emailExtras
      })

      if (Object.keys(data).length > 0) {
        await notifyPassengerRequestSite({
          action: isDateChange
            ? "passenger_request_dates_change"
            : "update_passenger_request",
          passengerRequestId: passengerRequest.id,
          airlineId: passengerRequest.airlineId,
          descriptionHtml: `Обновлён ФАП <span style='color:#545873'>${passengerRequest.flightNumber}</span>`,
          __typename: "PassengerRequestUpdatedNotification"
        })
      }

      publishPassengerRequestUpdated(passengerRequest)

      return passengerRequest
    },

    addPassengerRequestFiles: async (_, { requestId, files }, context) => {
      const existing = await loadRequestOrThrow(requestId)
      if (!files?.length) {
        throw new GraphQLError("At least one file is required")
      }

      const uploadedPaths = await uploadPassengerRequestFiles(requestId, files)
      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: {
          files: [...(existing.files || []), ...uploadedPaths]
        }
      })

      await logPassengerRequestAction({
        context,
        action: "add_passenger_request_files",
        description: "Файлы добавлены в ФАП",
        fulldescription: `Пользователь ${getSubjectName(context)} добавил ${uploadedPaths.length} файл(ов) в ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
      })

      publishPassengerRequestUpdated(passengerRequest)

      return passengerRequest
    },

    removePassengerRequestFile: async (
      _,
      { requestId, filePath },
      context
    ) => {
      const existing = await loadRequestOrThrow(requestId)

      const fileIndex = findPassengerRequestFileIndex(
        existing.files,
        filePath
      )
      if (fileIndex < 0) {
        throw new GraphQLError("File not found on this passenger request")
      }

      const removedPath = existing.files[fileIndex]
      await deletePassengerRequestFileFromDisk(removedPath)

      const nextFiles = (existing.files || []).filter(
        (_, index) => index !== fileIndex
      )

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: { files: nextFiles }
      })

      await logPassengerRequestAction({
        context,
        action: "remove_passenger_request_file",
        description: "Файл удалён из ФАП",
        fulldescription: `Пользователь ${getSubjectName(context)} удалил файл из ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
      })

      publishPassengerRequestUpdated(passengerRequest)

      return passengerRequest
    },

    deletePassengerRequest: async (_, { id }, context) => {
      const existing = await loadRequestOrThrow(id)

      await deleteAllPassengerRequestFilesFromDisk(existing.files)

      const passengerRequest = await prisma.passengerRequest.delete({
        where: { id }
      })
      await logPassengerRequestAction({
        context,
        action: "delete_passenger_request",
        description: "ФАП удален",
        fulldescription: `Пользователь ${getSubjectName(context)} удалил ФАП ${passengerRequest.flightNumber}`,
        oldData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
      })

      publishPassengerRequestUpdated(passengerRequest)

      return true
    },

    // общий статус заявки
    setPassengerRequestStatus: async (_, { id, status }, context) => {
      const existing = await loadRequestOrThrow(id)

      const statusTimes = updateTimes(existing.statusTimes, status)

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id },
        data: {
          status,
          statusTimes
        }
      })

      await logPassengerRequestAction({
        context,
        action: "update_passenger_request_status",
        description: "Статус ФАП обновлен",
        fulldescription: `Пользователь ${getSubjectName(context)} сменил статус ФАП ${passengerRequest.flightNumber} на ${status}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
      })

      publishPassengerRequestUpdated(passengerRequest)

      return passengerRequest
    },

    // ростер экипажа заявки
    updatePassengerRequestCrew: async (
      _,
      { requestId, crewMembers },
      context
    ) => {
      const existing = await loadRequestOrThrow(requestId)

      const normalizedCrew = Array.isArray(crewMembers)
        ? crewMembers.map(normalizeCrewMember)
        : []

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: { crewMembers: normalizedCrew }
      })

      await logPassengerRequestAction({
        context,
        action: "update_passenger_request_crew",
        description: "Обновлён ростер экипажа ФАП",
        fulldescription: `Пользователь ${getSubjectName(context)} обновил ростер экипажа ФАП ${passengerRequest.flightNumber} (${normalizedCrew.length} чел.)`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
      })

      publishPassengerRequestUpdated(passengerRequest)

      return passengerRequest
    },

    // общий статус заявки
    cancelPassengerRequest: async (_, { id, cancelReason }, context) => {
      const existing = await loadRequestOrThrow(id)
      const status = "CANCELLED"
      const statusTimes = updateTimes(existing.statusTimes, status)

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id },
        data: {
          status,
          statusTimes,
          cancelReason
        }
      })

      await logPassengerRequestAction({
        context,
        action: "update_passenger_request_status",
        description: "Заявка по ФАП отменена",
        fulldescription: `Пользователь ${getSubjectName(context)} отменил ФАП ${passengerRequest.flightNumber}`,
        reason: cancelReason,
        cancelReason,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id,
        emailAction: "cancel_passenger_request"
      })

      publishPassengerRequestUpdated(passengerRequest)

      await notifyPassengerRequestSite({
        action: "cancel_passenger_request",
        passengerRequestId: passengerRequest.id,
        airlineId: passengerRequest.airlineId,
        descriptionHtml: `Отменён ФАП <span style='color:#545873'>${passengerRequest.flightNumber}</span>`,
        __typename: "PassengerRequestUpdatedNotification"
      })

      return passengerRequest
    },

    // статус конкретного сервиса
    setPassengerRequestServiceStatus: async (
      _,
      { id, service, status },
      context
    ) => {
      const existing = await loadRequestOrThrow(id)

      const data = {}

      if (service === "WATER") {
        const prev = existing.waterService || { people: [] }
        data.waterService = {
          ...prev,
          status,
          times: updateTimes(prev.times, status)
        }
      } else if (service === "MEAL") {
        const prev = existing.mealService || { people: [] }
        data.mealService = {
          ...prev,
          status,
          times: updateTimes(prev.times, status)
        }
      } else if (service === "LIVING") {
        const prev = existing.livingService || { hotels: [], evictions: [] }
        data.livingService = {
          ...prev,
          evictions: prev.evictions || [],
          status,
          times: updateTimes(prev.times, status)
        }
      } else if (service === "TRANSFER") {
        const prev = existing.transferService || { drivers: [] }
        data.transferService = {
          ...prev,
          drivers: normalizeDriversForWrite(prev.drivers),
          status,
          times: updateTimes(prev.times, status)
        }
      } else if (service === "DEPARTURE_TRANSFER") {
        const prev = existing.departureTransferService || { drivers: [] }
        data.departureTransferService = {
          ...prev,
          drivers: normalizeDriversForWrite(prev.drivers),
          status,
          times: updateTimes(prev.times, status)
        }
      } else if (service === "INTERCITY_TRANSFER") {
        const prev = existing.intercityTransferService || { drivers: [] }
        data.intercityTransferService = {
          ...prev,
          drivers: normalizeDriversForWrite(prev.drivers),
          status,
          times: updateTimes(prev.times, status)
        }
      } else if (service === "BAGGAGE_DELIVERY") {
        const prev = existing.baggageDeliveryService || { drivers: [] }
        data.baggageDeliveryService = {
          ...prev,
          drivers: normalizeDriversForWrite(prev.drivers),
          status,
          times: updateTimes(prev.times, status)
        }
      }

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id },
        data
      })
      await logPassengerRequestAction({
        context,
        action: "update_passenger_request_service_status",
        description: `Статус сервиса обновлен: ${service}`,
        fulldescription: `Пользователь ${context?.user?.name ?? "Пользователь"} сменил статус сервиса ${service} в ФАП ${passengerRequest.flightNumber} на ${status}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
      })

      publishPassengerRequestUpdated(passengerRequest)

      return passengerRequest
    },

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

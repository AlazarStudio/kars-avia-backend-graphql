// Досрочное завершение услуг и заявки целиком.

import { prisma } from "../../prisma.js"
import { updateTimes } from "../../services/passengerRequest/utils.js"
import { normalizeDriversForWrite } from "../../services/passengerRequest/baggageDelivery.js"
import { getTransferField } from "../../services/passengerRequest/normalizers.js"
import {
  assertReason,
  emptyDriversService,
  emptyLivingService,
  emptyPeopleService,
  getSubjectName,
  loadRequestOrThrow,
  publishPassengerRequestUpdated
} from "../../services/passengerRequest/envelope.js"
import { logPassengerRequestAction } from "../../services/passengerRequest/logging.js"

export default {
  Mutation: {
    completePassengerRequestWaterEarly: async (
      _,
      { requestId, reason },
      context
    ) => {
      const existing = await loadRequestOrThrow(requestId)
      const cleanReason = assertReason(reason)

      const prev = existing.waterService || emptyPeopleService()

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: {
          waterService: {
            ...prev,
            status: "COMPLETED",
            times: updateTimes(prev.times, "COMPLETED"),
            earlyCompletionReason: cleanReason,
            earlyCompletedAt: new Date()
          }
        }
      })
      await logPassengerRequestAction({
        context,
        action: "complete_passenger_request_water_early",
        reason: cleanReason,
        description: "Досрочно завершен сервис воды ФАП",
        fulldescription: `Пользователь ${getSubjectName(context)} досрочно завершил сервис воды ФАП ${passengerRequest.flightNumber}`,
        passengerRequestId: passengerRequest.id,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId
      })

      publishPassengerRequestUpdated(passengerRequest)

      return passengerRequest
    },

    completePassengerRequestMealEarly: async (
      _,
      { requestId, reason },
      context
    ) => {
      const existing = await loadRequestOrThrow(requestId)
      const cleanReason = assertReason(reason)

      const prev = existing.mealService || emptyPeopleService()

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: {
          mealService: {
            ...prev,
            status: "COMPLETED",
            times: updateTimes(prev.times, "COMPLETED"),
            earlyCompletionReason: cleanReason,
            earlyCompletedAt: new Date()
          }
        }
      })
      await logPassengerRequestAction({
        context,
        action: "complete_passenger_request_meal_early",
        reason: cleanReason,
        description: "Досрочно завершен сервис питания ФАП",
        fulldescription: `Пользователь ${getSubjectName(context)} досрочно завершил сервис питания ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
      })

      publishPassengerRequestUpdated(passengerRequest)

      return passengerRequest
    },

    completePassengerRequestBaggageEarly: async (
      _,
      { requestId, reason },
      context
    ) => {
      const existing = await loadRequestOrThrow(requestId)
      const cleanReason = assertReason(reason)

      const prev = existing.baggageDeliveryService || emptyDriversService()

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: {
          baggageDeliveryService: {
            ...prev,
            drivers: normalizeDriversForWrite(prev.drivers),
            status: "COMPLETED",
            times: updateTimes(prev.times, "COMPLETED")
          }
        }
      })

      await logPassengerRequestAction({
        context,
        action: "complete_passenger_request_baggage_early",
        reason: cleanReason,
        description: "Досрочно завершена услуга «Доставка багажа» ФАП",
        fulldescription: `Пользователь ${getSubjectName(context)} досрочно завершил услугу «Доставка багажа» ФАП ${passengerRequest.flightNumber}. Причина: ${cleanReason}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
      })

      publishPassengerRequestUpdated(passengerRequest)

      return passengerRequest
    },

    completePassengerRequestTransferEarly: async (
      _,
      { requestId, reason, direction = "ARRIVAL" },
      context
    ) => {
      const existing = await loadRequestOrThrow(requestId)
      const cleanReason = assertReason(reason)

      const transferField = getTransferField(direction)
      const prev = existing[transferField] || emptyDriversService()

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: {
          [transferField]: {
            ...prev,
            drivers: normalizeDriversForWrite(prev.drivers),
            status: "COMPLETED",
            times: updateTimes(prev.times, "COMPLETED"),
            earlyCompletionReason: cleanReason,
            earlyCompletedAt: new Date()
          }
        }
      })
      await logPassengerRequestAction({
        context,
        action: "complete_passenger_request_transfer_early",
        reason: cleanReason,
        description: "Досрочно завершена услуга «Трансфер» ФАП",
        fulldescription: `Пользователь ${getSubjectName(context)} досрочно завершил услугу «Трансфер» ФАП ${passengerRequest.flightNumber}. Причина: ${cleanReason}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
      })

      publishPassengerRequestUpdated(passengerRequest)

      return passengerRequest
    },

    completePassengerRequestLivingEarly: async (
      _,
      { requestId, reason },
      context
    ) => {
      const existing = await loadRequestOrThrow(requestId)
      const cleanReason = assertReason(reason)

      const prev = existing.livingService || emptyLivingService()

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: {
          livingService: {
            ...prev,
            status: "COMPLETED",
            times: updateTimes(prev.times, "COMPLETED"),
            earlyCompletionReason: cleanReason,
            earlyCompletedAt: new Date()
          }
        }
      })
      await logPassengerRequestAction({
        context,
        action: "complete_passenger_request_living_early",
        reason: cleanReason,
        description: "Досрочно завершена услуга «Проживание» ФАП",
        fulldescription: `Пользователь ${getSubjectName(context)} досрочно завершил услугу «Проживание» ФАП ${passengerRequest.flightNumber}. Причина: ${cleanReason}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
      })

      publishPassengerRequestUpdated(passengerRequest)

      return passengerRequest
    },

    completePassengerRequestEarly: async (_, { id, reason }, context) => {
      const existing = await loadRequestOrThrow(id)
      const cleanReason = assertReason(reason)

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id },
        data: {
          status: "COMPLETED",
          statusTimes: updateTimes(existing.statusTimes, "COMPLETED"),
          earlyCompletionReason: cleanReason,
          earlyCompletedAt: new Date()
        }
      })
      await logPassengerRequestAction({
        context,
        action: "complete_passenger_request_early",
        reason: cleanReason,
        description: "ФАП завершен досрочно",
        fulldescription: `Пользователь ${getSubjectName(context)} досрочно завершил ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
      })

      publishPassengerRequestUpdated(passengerRequest)

      return passengerRequest
    }
  }
}

// Досрочное завершение услуг и заявки целиком.

import { updateTimes } from "../../services/passengerRequest/utils.js"
import { normalizeDriversForWrite } from "../../services/passengerRequest/baggageDelivery.js"
import { getTransferField } from "../../services/passengerRequest/normalizers.js"
import {
  assertReason,
  emptyDriversService,
  emptyLivingService,
  emptyPeopleService,
  getSubjectName,
  withPassengerRequest
} from "../../services/passengerRequest/envelope.js"

export default {
  Mutation: {
    completePassengerRequestWaterEarly: async (
      _,
      { requestId, reason },
      context
    ) =>
      withPassengerRequest({
        requestId,
        context,
        apply: (existing) => {
          const cleanReason = assertReason(reason)

          const prev = existing.waterService || emptyPeopleService()

          return {
            data: {
              waterService: {
                ...prev,
                status: "COMPLETED",
                times: updateTimes(prev.times, "COMPLETED"),
                earlyCompletionReason: cleanReason,
                earlyCompletedAt: new Date()
              }
            },
            log: {
              action: "complete_passenger_request_water_early",
              reason: cleanReason,
              description: "Досрочно завершен сервис воды ФАП",
              fulldescription: `Пользователь ${getSubjectName(context)} досрочно завершил сервис воды ФАП ${existing.flightNumber}`,
              passengerRequestId: existing.id,
              airlineId: existing.airlineId
            }
          }
        }
      }),

    completePassengerRequestMealEarly: async (
      _,
      { requestId, reason },
      context
    ) =>
      withPassengerRequest({
        requestId,
        context,
        apply: (existing) => {
          const cleanReason = assertReason(reason)

          const prev = existing.mealService || emptyPeopleService()

          return {
            data: {
              mealService: {
                ...prev,
                status: "COMPLETED",
                times: updateTimes(prev.times, "COMPLETED"),
                earlyCompletionReason: cleanReason,
                earlyCompletedAt: new Date()
              }
            },
            log: {
              action: "complete_passenger_request_meal_early",
              reason: cleanReason,
              description: "Досрочно завершен сервис питания ФАП",
              fulldescription: `Пользователь ${getSubjectName(context)} досрочно завершил сервис питания ФАП ${existing.flightNumber}`,
              airlineId: existing.airlineId,
              passengerRequestId: existing.id
            }
          }
        }
      }),

    completePassengerRequestBaggageEarly: async (
      _,
      { requestId, reason },
      context
    ) =>
      withPassengerRequest({
        requestId,
        context,
        apply: (existing) => {
          const cleanReason = assertReason(reason)

          const prev = existing.baggageDeliveryService || emptyDriversService()

          // Причина и дата досрочного завершения в документ НЕ пишутся —
          // дефект №1 реестра, закреплён характеризационным тестом.
          return {
            data: {
              baggageDeliveryService: {
                ...prev,
                drivers: normalizeDriversForWrite(prev.drivers),
                status: "COMPLETED",
                times: updateTimes(prev.times, "COMPLETED")
              }
            },
            log: {
              action: "complete_passenger_request_baggage_early",
              reason: cleanReason,
              description: "Досрочно завершена услуга «Доставка багажа» ФАП",
              fulldescription: `Пользователь ${getSubjectName(context)} досрочно завершил услугу «Доставка багажа» ФАП ${existing.flightNumber}. Причина: ${cleanReason}`,
              airlineId: existing.airlineId,
              passengerRequestId: existing.id
            }
          }
        }
      }),

    completePassengerRequestTransferEarly: async (
      _,
      { requestId, reason, direction = "ARRIVAL" },
      context
    ) =>
      withPassengerRequest({
        requestId,
        context,
        apply: (existing) => {
          const cleanReason = assertReason(reason)

          const transferField = getTransferField(direction)
          const prev = existing[transferField] || emptyDriversService()

          return {
            data: {
              [transferField]: {
                ...prev,
                drivers: normalizeDriversForWrite(prev.drivers),
                status: "COMPLETED",
                times: updateTimes(prev.times, "COMPLETED"),
                earlyCompletionReason: cleanReason,
                earlyCompletedAt: new Date()
              }
            },
            log: {
              action: "complete_passenger_request_transfer_early",
              reason: cleanReason,
              description: "Досрочно завершена услуга «Трансфер» ФАП",
              fulldescription: `Пользователь ${getSubjectName(context)} досрочно завершил услугу «Трансфер» ФАП ${existing.flightNumber}. Причина: ${cleanReason}`,
              airlineId: existing.airlineId,
              passengerRequestId: existing.id
            }
          }
        }
      }),

    completePassengerRequestLivingEarly: async (
      _,
      { requestId, reason },
      context
    ) =>
      withPassengerRequest({
        requestId,
        context,
        apply: (existing) => {
          const cleanReason = assertReason(reason)

          const prev = existing.livingService || emptyLivingService()

          return {
            data: {
              livingService: {
                ...prev,
                status: "COMPLETED",
                times: updateTimes(prev.times, "COMPLETED"),
                earlyCompletionReason: cleanReason,
                earlyCompletedAt: new Date()
              }
            },
            log: {
              action: "complete_passenger_request_living_early",
              reason: cleanReason,
              description: "Досрочно завершена услуга «Проживание» ФАП",
              fulldescription: `Пользователь ${getSubjectName(context)} досрочно завершил услугу «Проживание» ФАП ${existing.flightNumber}. Причина: ${cleanReason}`,
              airlineId: existing.airlineId,
              passengerRequestId: existing.id
            }
          }
        }
      }),

    completePassengerRequestEarly: async (_, { id, reason }, context) =>
      withPassengerRequest({
        requestId: id,
        context,
        apply: (existing) => {
          const cleanReason = assertReason(reason)

          return {
            data: {
              status: "COMPLETED",
              statusTimes: updateTimes(existing.statusTimes, "COMPLETED"),
              earlyCompletionReason: cleanReason,
              earlyCompletedAt: new Date()
            },
            log: {
              action: "complete_passenger_request_early",
              reason: cleanReason,
              description: "ФАП завершен досрочно",
              fulldescription: `Пользователь ${getSubjectName(context)} досрочно завершил ФАП ${existing.flightNumber}`,
              airlineId: existing.airlineId,
              passengerRequestId: existing.id
            }
          }
        }
      })
  }
}

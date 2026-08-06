// Досрочное завершение услуг и заявки целиком, а также обратное действие —
// переоткрытие завершённой услуги.
//
// Переоткрытие живёт здесь, а не рядом с setPassengerRequestServiceStatus:
// оно обязано снять ровно то, что ставит досрочное завершение, и держать эти
// два места вместе дешевле, чем сверять их через файл.

import { GraphQLError } from "graphql"
import { updateTimes } from "../../services/passengerRequest/utils.js"
import { normalizeDriversForWrite } from "../../services/passengerRequest/baggageDelivery.js"
import { getTransferField } from "../../services/passengerRequest/normalizers.js"
import { findPassengerService } from "../../services/passengerRequest/serviceTable.js"
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

          return {
            data: {
              baggageDeliveryService: {
                ...prev,
                drivers: normalizeDriversForWrite(prev.drivers),
                status: "COMPLETED",
                times: updateTimes(prev.times, "COMPLETED"),
                earlyCompletionReason: cleanReason,
                earlyCompletedAt: new Date()
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
      }),

    // Обратное действие к досрочному завершению: услугу, закрытую по ошибке,
    // надо уметь вернуть в работу. Отдельная мутация, а не
    // setPassengerRequestServiceStatus, по двум причинам: та не снимает
    // finishedAt (updateTimes только ДОБАВЛЯЕТ отметки) и не гасит признаки
    // досрочного завершения, поэтому карточка осталась бы с датой и причиной
    // закрытия при статусе «в работе».
    reopenPassengerRequestService: async (
      _,
      { requestId, service, reason },
      context
    ) =>
      withPassengerRequest({
        requestId,
        context,
        apply: (existing) => {
          const cleanReason = assertReason(reason)

          const entry = findPassengerService(service)
          // В отличие от setPassengerRequestServiceStatus, неизвестная услуга
          // здесь отбивается: у новой мутации нет обратной совместимости,
          // которую надо беречь, а пустой апдейт с записью в историю — худший
          // из возможных ответов.
          if (!entry) {
            throw new GraphQLError(`Unknown service: ${service}`, {
              extensions: { code: "BAD_USER_INPUT" }
            })
          }

          const prev = existing[entry.field]
          // Переоткрывать можно только завершённое. Отменённая услуга — не тот
          // случай: её возвращают в работу другим решением, и молча путать эти
          // два перехода нельзя.
          if (prev?.status !== "COMPLETED") {
            throw new GraphQLError("Service is not completed", {
              extensions: { code: "BAD_USER_INPUT" }
            })
          }

          return {
            data: {
              [entry.field]: {
                ...prev,
                ...(entry.hasDrivers && {
                  drivers: normalizeDriversForWrite(prev.drivers)
                }),
                ...(entry.statusExtra && entry.statusExtra(prev)),
                status: "IN_PROGRESS",
                // finishedAt снимаем явно — ровно так же, как это делает сам
                // движок на своём переоткрытии (serviceStatus.js).
                times: { ...updateTimes(prev.times, "IN_PROGRESS"), finishedAt: null },
                earlyCompletionReason: null,
                earlyCompletedAt: null
              }
            },
            log: {
              action: "reopen_passenger_request_service",
              reason: cleanReason,
              description: `Услуга ФАП возвращена в работу: ${service}`,
              fulldescription: `Пользователь ${getSubjectName(context)} вернул в работу завершённую услугу ${service} в ФАП ${existing.flightNumber}. Причина: ${cleanReason}`,
              airlineId: existing.airlineId,
              passengerRequestId: existing.id
            }
          }
        }
      })
  }
}

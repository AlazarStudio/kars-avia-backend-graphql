// Получатели воды и питания.

import { GraphQLError } from "graphql"
import {
  ensurePersonId,
  snapshotFromServicePerson,
  upsertSavedPassenger,
  patchSavedPersonIdentity
} from "../../services/passengerRequest/savedPassengers.js"
import {
  normalizeBulkIndexes,
  spliceAtIndexes
} from "../../services/passengerRequest/bulkHotelPeople.js"
import { normalizePersonCategory } from "../../services/passengerRequest/normalizers.js"
import {
  assertIndex,
  emptyPeopleService,
  getSubjectName,
  withPassengerRequest
} from "../../services/passengerRequest/envelope.js"
import { recomputeServiceStatus } from "../../services/passengerRequest/serviceStatus.js"

// Вход service — строка энума; embedded-полей у неё ровно два. Проверка и
// выбор поля идут вместе: разъехавшись, они дают запись в чужую услугу вместо
// отказа.
const assertWaterMealField = (service) => {
  if (service !== "WATER" && service !== "MEAL") {
    throw new GraphQLError("PassengerWaterFoodKind must be WATER or MEAL")
  }
  return service === "WATER" ? "waterService" : "mealService"
}

export default {
  Mutation: {
    // добавить ФИО из скана / вручную
    addPassengerRequestPerson: async (
      _,
      { requestId, service, person },
      context
    ) =>
      withPassengerRequest({
        requestId,
        context,
        apply: (existing) => {
          const personWithId = {
            ...ensurePersonId(person),
            personCategory: normalizePersonCategory(person?.personCategory)
          }
          const serviceField = assertWaterMealField(service)

          const prev = existing[serviceField] || emptyPeopleService()
          const people = [...(prev.people || []), personWithId]
          const recalc = recomputeServiceStatus(
            prev,
            (prev.people || []).length,
            people.length
          )

          return {
            data: {
              [serviceField]: {
                ...prev,
                people,
                status: recalc.status,
                times: recalc.times
              },
              savedPassengers: upsertSavedPassenger(
                existing?.savedPassengers,
                snapshotFromServicePerson(personWithId)
              )
            },
            log: {
              action: "add_passenger_request_person",
              description: `Пассажир добавлен в сервис: ${service}`,
              fulldescription: `Пользователь ${getSubjectName(context)} добавил пассажира в сервис ${service} ФАП ${existing.flightNumber}`,
              airlineId: existing.airlineId,
              passengerRequestId: existing.id
            }
          }
        }
      }),

    addPassengerRequestPeople: async (
      _,
      { requestId, service, people },
      context
    ) => {
      // Проверки входа стоят ДО конверта намеренно: пакетная версия отбивает
      // пустой список и чужую услугу, вообще не сходив в базу, тогда как
      // одиночная сначала грузит заявку. Асимметрия закреплена
      // характеризационным тестом.
      if (!Array.isArray(people) || people.length === 0) {
        throw new GraphQLError("people must be a non-empty array")
      }
      const serviceField = assertWaterMealField(service)

      return withPassengerRequest({
        requestId,
        context,
        apply: (existing) => {
          const peopleWithId = people.map((p) => ({
            ...ensurePersonId(p),
            personCategory: normalizePersonCategory(p?.personCategory)
          }))

          const prev = existing[serviceField] || emptyPeopleService()
          const nextPeople = [...(prev.people || []), ...peopleWithId]
          const recalc = recomputeServiceStatus(
            prev,
            (prev.people || []).length,
            nextPeople.length
          )

          let savedPassengers = existing.savedPassengers
          for (const p of peopleWithId) {
            savedPassengers = upsertSavedPassenger(
              savedPassengers,
              snapshotFromServicePerson(p)
            )
          }

          return {
            data: {
              [serviceField]: {
                ...prev,
                people: nextPeople,
                status: recalc.status,
                times: recalc.times
              },
              savedPassengers
            },
            log: {
              action: "add_passenger_request_people",
              description: `Пакетно добавлены пассажиры в сервис ${service} (${people.length})`,
              fulldescription: `Пользователь ${getSubjectName(context)} добавил ${people.length} пассажиров в сервис ${service} ФАП ${existing.flightNumber}`,
              airlineId: existing.airlineId,
              passengerRequestId: existing.id
            }
          }
        }
      })
    },

    // обновление получателя воды/питания
    updatePassengerRequestPerson: async (
      _,
      { requestId, service, personIndex, person },
      context
    ) =>
      withPassengerRequest({
        requestId,
        context,
        apply: (existing) => {
          const serviceField = assertWaterMealField(service)

          const prev = existing[serviceField] || emptyPeopleService()
          const people = [...(prev.people || [])]
          assertIndex(personIndex, people.length, "personIndex")
          // keep existing issuedAt unless explicitly provided
          people[personIndex] = {
            ...people[personIndex],
            ...person,
            personCategory: normalizePersonCategory(
              person?.personCategory ?? people[personIndex]?.personCategory
            ),
            issuedAt: person?.issuedAt ?? people[personIndex]?.issuedAt ?? null
          }

          return {
            data: {
              [serviceField]: { ...prev, people },
              savedPassengers: patchSavedPersonIdentity(
                existing.savedPassengers,
                people[personIndex]
              )
            },
            log: {
              action: "update_passenger_request_person",
              description: `Получатель обновлён в сервисе: ${service}`,
              fulldescription: `Пользователь ${getSubjectName(context)} обновил получателя #${personIndex} в сервисе ${service} ФАП ${existing.flightNumber}`,
              airlineId: existing.airlineId,
              passengerRequestId: existing.id
            }
          }
        }
      }),

    // удаление получателя воды/питания
    removePassengerRequestPerson: async (
      _,
      { requestId, service, personIndex },
      context
    ) =>
      withPassengerRequest({
        requestId,
        context,
        apply: (existing) => {
          const serviceField = assertWaterMealField(service)

          const prev = existing[serviceField] || emptyPeopleService()
          const people = [...(prev.people || [])]
          assertIndex(personIndex, people.length, "personIndex")
          people.splice(personIndex, 1)

          const recalc = recomputeServiceStatus(
            prev,
            (prev.people || []).length,
            people.length
          )

          return {
            data: {
              [serviceField]: {
                ...prev,
                people,
                status: recalc.status,
                times: recalc.times
              }
            },
            log: {
              action: "remove_passenger_request_person",
              description: `Получатель удалён из сервиса: ${service}`,
              fulldescription: `Пользователь ${getSubjectName(context)} удалил получателя #${personIndex} в сервисе ${service} ФАП ${existing.flightNumber}`,
              airlineId: existing.airlineId,
              passengerRequestId: existing.id
            }
          }
        }
      }),

    // массовое удаление получателей воды/питания
    removePassengerRequestPeople: async (
      _,
      { requestId, service, personIndexes },
      context
    ) =>
      withPassengerRequest({
        requestId,
        context,
        apply: (existing) => {
          const serviceField = assertWaterMealField(service)

          const prev = existing[serviceField] || emptyPeopleService()
          const prevPeople = prev.people || []

          // Валидация ДО изменений: пачка применяется целиком либо не применяется вовсе.
          const indexes = normalizeBulkIndexes(personIndexes)
          if (indexes.length === 0) {
            throw new GraphQLError("Не выбран ни один получатель")
          }
          for (const idx of indexes) {
            assertIndex(idx, prevPeople.length, "personIndex")
          }

          const { next: people } = spliceAtIndexes(prevPeople, indexes)

          // Статус услуги пересчитываем ОДИН раз по итогу всей пачки.
          const recalc = recomputeServiceStatus(
            prev,
            prevPeople.length,
            people.length
          )

          return {
            data: {
              [serviceField]: {
                ...prev,
                people,
                status: recalc.status,
                times: recalc.times
              }
            },
            log: {
              action: "remove_passenger_request_people",
              description: `Получатели удалены из сервиса: ${service}`,
              fulldescription: `Пользователь ${getSubjectName(context)} удалил получателей (${indexes.length}) в сервисе ${service} ФАП ${existing.flightNumber}`,
              airlineId: existing.airlineId,
              passengerRequestId: existing.id
            }
          }
        }
      })
  }
}

// Получатели воды и питания.

import { prisma } from "../../prisma.js"
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
  loadRequestOrThrow,
  publishPassengerRequestUpdated
} from "../../services/passengerRequest/envelope.js"
import { recomputeServiceStatus } from "../../services/passengerRequest/serviceStatus.js"
import { logPassengerRequestAction } from "../../services/passengerRequest/logging.js"

export default {
  Mutation: {
    // добавить ФИО из скана / вручную
    addPassengerRequestPerson: async (
      _,
      { requestId, service, person },
      context
    ) => {
      const existing = await loadRequestOrThrow(requestId)
      const personWithId = {
        ...ensurePersonId(person),
        personCategory: normalizePersonCategory(person?.personCategory),
      }

      const data = {}

      if (service === "WATER") {
        const prev = existing.waterService || emptyPeopleService()
        const people = [...(prev.people || []), personWithId]
        const recalc = recomputeServiceStatus(
          prev,
          (prev.people || []).length,
          people.length
        )
        data.waterService = {
          ...prev,
          people,
          status: recalc.status,
          times: recalc.times
        }
      } else if (service === "MEAL") {
        const prev = existing.mealService || emptyPeopleService()
        const people = [...(prev.people || []), personWithId]
        const recalc = recomputeServiceStatus(
          prev,
          (prev.people || []).length,
          people.length
        )
        data.mealService = {
          ...prev,
          people,
          status: recalc.status,
          times: recalc.times
        }
      } else {
        throw new GraphQLError("PassengerWaterFoodKind must be WATER or MEAL")
      }

      data.savedPassengers = upsertSavedPassenger(
        existing?.savedPassengers,
        snapshotFromServicePerson(personWithId)
      )

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data
      })
      await logPassengerRequestAction({
        context,
        action: "add_passenger_request_person",
        description: `Пассажир добавлен в сервис: ${service}`,
        fulldescription: `Пользователь ${getSubjectName(context)} добавил пассажира в сервис ${service} ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
      })

      publishPassengerRequestUpdated(passengerRequest)

      return passengerRequest
    },

    addPassengerRequestPeople: async (
      _,
      { requestId, service, people },
      context
    ) => {
      if (!Array.isArray(people) || people.length === 0) {
        throw new GraphQLError("people must be a non-empty array")
      }
      if (service !== "WATER" && service !== "MEAL") {
        throw new GraphQLError("PassengerWaterFoodKind must be WATER or MEAL")
      }
      const existing = await loadRequestOrThrow(requestId)
      const peopleWithId = people.map((p) => ({
        ...ensurePersonId(p),
        personCategory: normalizePersonCategory(p?.personCategory),
      }))

      const serviceField = service === "WATER" ? "waterService" : "mealService"
      const prev = existing[serviceField] || emptyPeopleService()
      const nextPeople = [...(prev.people || []), ...peopleWithId]

      const recalc = recomputeServiceStatus(
        prev,
        (prev.people || []).length,
        nextPeople.length
      )
      const nextStatus = recalc.status
      const nextTimes = recalc.times

      let savedPassengers = existing.savedPassengers
      for (const p of peopleWithId) {
        savedPassengers = upsertSavedPassenger(
          savedPassengers,
          snapshotFromServicePerson(p)
        )
      }

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: {
          [serviceField]: {
            ...prev,
            people: nextPeople,
            status: nextStatus,
            times: nextTimes
          },
          savedPassengers
        }
      })
      await logPassengerRequestAction({
        context,
        action: "add_passenger_request_people",
        description: `Пакетно добавлены пассажиры в сервис ${service} (${people.length})`,
        fulldescription: `Пользователь ${getSubjectName(context)} добавил ${people.length} пассажиров в сервис ${service} ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
      })

      publishPassengerRequestUpdated(passengerRequest)

      return passengerRequest
    },

    // обновление получателя воды/питания
    updatePassengerRequestPerson: async (
      _,
      { requestId, service, personIndex, person },
      context
    ) => {
      const existing = await loadRequestOrThrow(requestId)

      const data = {}
      const serviceField = service === "WATER" ? "waterService" : "mealService"
      if (service !== "WATER" && service !== "MEAL") {
        throw new GraphQLError("PassengerWaterFoodKind must be WATER or MEAL")
      }

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
      data[serviceField] = { ...prev, people }
      data.savedPassengers = patchSavedPersonIdentity(
        existing.savedPassengers,
        people[personIndex]
      )

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data
      })
      await logPassengerRequestAction({
        context,
        action: "update_passenger_request_person",
        description: `Получатель обновлён в сервисе: ${service}`,
        fulldescription: `Пользователь ${getSubjectName(context)} обновил получателя #${personIndex} в сервисе ${service} ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
      })

      publishPassengerRequestUpdated(passengerRequest)

      return passengerRequest
    },

    // удаление получателя воды/питания
    removePassengerRequestPerson: async (
      _,
      { requestId, service, personIndex },
      context
    ) => {
      const existing = await loadRequestOrThrow(requestId)

      const data = {}
      const serviceField = service === "WATER" ? "waterService" : "mealService"
      if (service !== "WATER" && service !== "MEAL") {
        throw new GraphQLError("PassengerWaterFoodKind must be WATER or MEAL")
      }

      const prev = existing[serviceField] || emptyPeopleService()
      const people = [...(prev.people || [])]
      assertIndex(personIndex, people.length, "personIndex")
      people.splice(personIndex, 1)

      const recalc = recomputeServiceStatus(
        prev,
        (prev.people || []).length,
        people.length
      )
      data[serviceField] = {
        ...prev,
        people,
        status: recalc.status,
        times: recalc.times
      }

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data
      })
      await logPassengerRequestAction({
        context,
        action: "remove_passenger_request_person",
        description: `Получатель удалён из сервиса: ${service}`,
        fulldescription: `Пользователь ${getSubjectName(context)} удалил получателя #${personIndex} в сервисе ${service} ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
      })

      publishPassengerRequestUpdated(passengerRequest)

      return passengerRequest
    },

    // массовое удаление получателей воды/питания
    removePassengerRequestPeople: async (
      _,
      { requestId, service, personIndexes },
      context
    ) => {
      const existing = await loadRequestOrThrow(requestId)

      if (service !== "WATER" && service !== "MEAL") {
        throw new GraphQLError("PassengerWaterFoodKind must be WATER or MEAL")
      }
      const serviceField = service === "WATER" ? "waterService" : "mealService"

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

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: {
          [serviceField]: {
            ...prev,
            people,
            status: recalc.status,
            times: recalc.times
          }
        }
      })

      await logPassengerRequestAction({
        context,
        action: "remove_passenger_request_people",
        description: `Получатели удалены из сервиса: ${service}`,
        fulldescription: `Пользователь ${getSubjectName(context)} удалил получателей (${indexes.length}) в сервисе ${service} ФАП ${passengerRequest.flightNumber}`,
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

// Реестр пассажиров заявки и группы.

import { prisma } from "../../prisma.js"
import { GraphQLError } from "graphql"
import {
  mergeManifestPeopleIntoRoster,
  removeSavedPersonFromRoster,
  updateSavedPersonInRoster,
  upsertSavedPassenger
} from "../../services/passengerRequest/savedPassengers.js"
import {
  upsertGroup,
  removeGroup,
  stripPersonFromGroups
} from "../../services/passengerRequest/passengerGroups.js"
import {
  getSubjectName,
  loadRequestOrThrow,
  publishPassengerRequestUpdated
} from "../../services/passengerRequest/envelope.js"
import { logPassengerRequestAction } from "../../services/passengerRequest/logging.js"

export default {
  Mutation: {
    addPassengerRequestSavedPerson: async (_, { requestId, person }, context) => {
      const existing = await loadRequestOrThrow(requestId)

      let savedPassengers
      try {
        savedPassengers = upsertSavedPassenger(
          existing.savedPassengers,
          person
        )
      } catch (e) {
        throw new GraphQLError(e.message || "Invalid saved passenger")
      }

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: { savedPassengers }
      })

      await logPassengerRequestAction({
        context,
        action: "add_passenger_request_saved_person",
        description: "Пассажир добавлен в реестр ФАП",
        fulldescription: `Пользователь ${getSubjectName(context)} добавил пассажира в реестр ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
      })

      publishPassengerRequestUpdated(passengerRequest)

      return passengerRequest
    },

    updatePassengerRequestSavedPerson: async (
      _,
      { requestId, personId, person },
      context
    ) => {
      const existing = await loadRequestOrThrow(requestId)

      let savedPassengers
      try {
        savedPassengers = updateSavedPersonInRoster(
          existing.savedPassengers,
          personId,
          person
        )
      } catch (e) {
        throw new GraphQLError(e.message || "Invalid saved passenger")
      }

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: { savedPassengers }
      })

      await logPassengerRequestAction({
        context,
        action: "update_passenger_request_saved_person",
        description: "Пассажир обновлён в реестре ФАП",
        fulldescription: `Пользователь ${getSubjectName(context)} обновил пассажира в реестре ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
      })

      publishPassengerRequestUpdated(passengerRequest)

      return passengerRequest
    },

    removePassengerRequestSavedPerson: async (
      _,
      { requestId, personId },
      context
    ) => {
      const existing = await loadRequestOrThrow(requestId)

      let savedPassengers
      try {
        savedPassengers = removeSavedPersonFromRoster(
          existing.savedPassengers,
          personId
        )
      } catch (e) {
        throw new GraphQLError(e.message || "Saved passenger not found")
      }

      // удалённый человек уходит и из групп; опустевшие группы удаляются
      const passengerGroups = stripPersonFromGroups(
        existing.passengerGroups,
        personId
      )

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: { savedPassengers, passengerGroups }
      })

      await logPassengerRequestAction({
        context,
        action: "remove_passenger_request_saved_person",
        description: "Пассажир удалён из реестра ФАП",
        fulldescription: `Пользователь ${getSubjectName(context)} удалил пассажира из реестра ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
      })

      publishPassengerRequestUpdated(passengerRequest)

      return passengerRequest
    },

    setPassengerRequestGroup: async (_, { requestId, group }, context) => {
      const existing = await loadRequestOrThrow(requestId)

      const passengerGroups = upsertGroup(
        existing.passengerGroups,
        group,
        existing.savedPassengers
      )

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: { passengerGroups }
      })

      await logPassengerRequestAction({
        context,
        action: "set_passenger_request_group",
        description: "Группа пассажиров сохранена",
        fulldescription: `Пользователь ${getSubjectName(context)} сохранил группу пассажиров в ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
      })

      publishPassengerRequestUpdated(passengerRequest)

      return passengerRequest
    },

    removePassengerRequestGroup: async (_, { requestId, groupId }, context) => {
      const existing = await loadRequestOrThrow(requestId)

      const passengerGroups = removeGroup(existing.passengerGroups, groupId)

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: { passengerGroups }
      })

      await logPassengerRequestAction({
        context,
        action: "remove_passenger_request_group",
        description: "Группа пассажиров расформирована",
        fulldescription: `Пользователь ${getSubjectName(context)} расформировал группу пассажиров в ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
      })

      publishPassengerRequestUpdated(passengerRequest)

      return passengerRequest
    },

    // Пакетное добавление в реестр (импорт манифеста); дедуп по ФИО в хелпере
    addPassengerRequestSavedPeople: async (
      _,
      { requestId, people },
      context
    ) => {
      const existing = await loadRequestOrThrow(requestId)

      let merged
      try {
        merged = mergeManifestPeopleIntoRoster(
          existing.savedPassengers,
          people
        )
      } catch (e) {
        throw new GraphQLError(e.message || "Invalid saved passengers")
      }

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: { savedPassengers: merged.roster }
      })

      await logPassengerRequestAction({
        context,
        action: "add_passenger_request_saved_people",
        description: `Импорт манифеста в реестр ФАП: добавлено ${merged.addedCount}, пропущено ${merged.matchedCount}`,
        fulldescription: `Пользователь ${getSubjectName(context)} импортировал манифест в реестр ФАП ${passengerRequest.flightNumber}: добавлено ${merged.addedCount}, пропущено ${merged.matchedCount} (уже в реестре)`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id,
        skipEmail: true
      })

      publishPassengerRequestUpdated(passengerRequest)

      return passengerRequest
    }
  }
}

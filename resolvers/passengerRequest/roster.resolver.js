// Реестр пассажиров заявки и группы.

import { GraphQLError } from "graphql"
import {
  mergeManifestPeopleIntoRoster,
  removeSavedPersonFromRoster,
  updateSavedPersonInRoster
} from "../../services/passengerRequest/savedPassengers.js"
import { mergeSavedPeopleInRequest, rebindReportRows } from "../../services/passengerRequest/mergeSavedPeople.js"
import { prisma } from "../../prisma.js"
import {
  upsertGroup,
  removeGroup,
  stripPersonFromGroups
} from "../../services/passengerRequest/passengerGroups.js"
import {
  getSubjectName,
  withPassengerRequest
} from "../../services/passengerRequest/envelope.js"

export default {
  Mutation: {
    addPassengerRequestSavedPerson: async (_, { requestId, person }, context) =>
      withPassengerRequest({
        requestId,
        context,
        apply: (existing) => {
          if (!String(person?.fullName ?? "").trim()) {
            throw new GraphQLError("fullName is required")
          }
          let savedPassengers
          try {
            savedPassengers = mergeManifestPeopleIntoRoster(
              existing.savedPassengers,
              [person]
            ).roster
          } catch (e) {
            throw new GraphQLError(e.message || "Invalid saved passenger")
          }

          return {
            data: { savedPassengers },
            log: {
              action: "add_passenger_request_saved_person",
              description: "Пассажир добавлен в реестр ФАП",
              fulldescription: `Пользователь ${getSubjectName(context)} добавил пассажира в реестр ФАП ${existing.flightNumber}`,
              airlineId: existing.airlineId,
              passengerRequestId: existing.id
            }
          }
        }
      }),

    updatePassengerRequestSavedPerson: async (
      _,
      { requestId, personId, person },
      context
    ) =>
      withPassengerRequest({
        requestId,
        context,
        apply: (existing) => {
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

          return {
            data: { savedPassengers },
            log: {
              action: "update_passenger_request_saved_person",
              description: "Пассажир обновлён в реестре ФАП",
              fulldescription: `Пользователь ${getSubjectName(context)} обновил пассажира в реестре ФАП ${existing.flightNumber}`,
              airlineId: existing.airlineId,
              passengerRequestId: existing.id
            }
          }
        }
      }),

    removePassengerRequestSavedPerson: async (
      _,
      { requestId, personId },
      context
    ) =>
      withPassengerRequest({
        requestId,
        context,
        apply: (existing) => {
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

          return {
            data: { savedPassengers, passengerGroups },
            log: {
              action: "remove_passenger_request_saved_person",
              description: "Пассажир удалён из реестра ФАП",
              fulldescription: `Пользователь ${getSubjectName(context)} удалил пассажира из реестра ФАП ${existing.flightNumber}`,
              airlineId: existing.airlineId,
              passengerRequestId: existing.id
            }
          }
        }
      }),

    setPassengerRequestGroup: async (_, { requestId, group }, context) =>
      withPassengerRequest({
        requestId,
        context,
        apply: (existing) => ({
          data: {
            passengerGroups: upsertGroup(
              existing.passengerGroups,
              group,
              existing.savedPassengers
            )
          },
          log: {
            action: "set_passenger_request_group",
            description: "Группа пассажиров сохранена",
            fulldescription: `Пользователь ${getSubjectName(context)} сохранил группу пассажиров в ФАП ${existing.flightNumber}`,
            airlineId: existing.airlineId,
            passengerRequestId: existing.id
          }
        })
      }),

    removePassengerRequestGroup: async (_, { requestId, groupId }, context) =>
      withPassengerRequest({
        requestId,
        context,
        apply: (existing) => ({
          data: {
            passengerGroups: removeGroup(existing.passengerGroups, groupId)
          },
          log: {
            action: "remove_passenger_request_group",
            description: "Группа пассажиров расформирована",
            fulldescription: `Пользователь ${getSubjectName(context)} расформировал группу пассажиров в ФАП ${existing.flightNumber}`,
            airlineId: existing.airlineId,
            passengerRequestId: existing.id
          }
        })
      }),

    // Пакетное добавление в реестр (импорт манифеста); дедуп по ФИО в хелпере
    addPassengerRequestSavedPeople: async (
      _,
      { requestId, people },
      context
    ) =>
      withPassengerRequest({
        requestId,
        context,
        apply: (existing) => {
          let merged
          try {
            merged = mergeManifestPeopleIntoRoster(
              existing.savedPassengers,
              people
            )
          } catch (e) {
            throw new GraphQLError(e.message || "Invalid saved passengers")
          }

          return {
            data: { savedPassengers: merged.roster },
            log: {
              action: "add_passenger_request_saved_people",
              description: `Импорт манифеста в реестр ФАП: добавлено ${merged.addedCount}, пропущено ${merged.matchedCount}`,
              fulldescription: `Пользователь ${getSubjectName(context)} импортировал манифест в реестр ФАП ${existing.flightNumber}: добавлено ${merged.addedCount}, пропущено ${merged.matchedCount} (уже в реестре)`,
              airlineId: existing.airlineId,
              passengerRequestId: existing.id,
              skipEmail: true
            }
          }
        }
      }),

    mergePassengerRequestSavedPeople: async (
      _,
      { requestId, keepPersonId, mergePersonIds },
      context
    ) => {
      let dropIds = new Set()
      const result = await withPassengerRequest({
        requestId,
        context,
        apply: (existing) => {
          const merged = mergeSavedPeopleInRequest(
            existing,
            keepPersonId,
            mergePersonIds
          )
          dropIds = merged.dropIds
          return {
            data: merged.data,
            unsubmitReports: merged.unsubmitReports,
            log: {
              action: "merge_passenger_request_saved_people",
              description: "Дубли пассажиров ФАП слиты",
              fulldescription: `Пользователь ${getSubjectName(context)} слил дубли пассажиров в реестре ФАП ${existing.flightNumber}`,
              airlineId: existing.airlineId,
              passengerRequestId: existing.id
            }
          }
        }
      })

      if (dropIds.size) {
        const reports = await prisma.passengerRequestHotelReport.findMany({
          where: { passengerRequestId: requestId }
        })
        for (const report of reports) {
          const nextRows = rebindReportRows(
            report.reportRows,
            dropIds,
            keepPersonId
          )
          if (JSON.stringify(nextRows) === JSON.stringify(report.reportRows ?? [])) {
            continue
          }
          await prisma.passengerRequestHotelReport.update({
            where: { id: report.id },
            data: { reportRows: nextRows }
          })
        }
      }

      return result
    }
  }
}

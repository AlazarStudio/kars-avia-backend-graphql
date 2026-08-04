// Трансфер: водители и их пассажиры.

import { prisma } from "../../prisma.js"
import { GraphQLError } from "graphql"
import { updateTimes } from "../../services/passengerRequest/utils.js"
import {
  ensurePersonId,
  snapshotFromDriverPerson,
  upsertSavedPassenger,
  patchSavedPersonIdentity
} from "../../services/passengerRequest/savedPassengers.js"
import { normalizeDriversForWrite } from "../../services/passengerRequest/baggageDelivery.js"
import {
  ensureDriverIds,
  newDriverId
} from "../../services/passengerRequest/serviceDrivers.js"
import {
  normalizeBulkIndexes,
  spliceAtIndexes
} from "../../services/passengerRequest/bulkHotelPeople.js"
import {
  ensureDriverPerson,
  getTransferField,
  getTransferServiceKind,
  normalizeOptionalString,
  normalizePassengerServiceDriver
} from "../../services/passengerRequest/normalizers.js"
import {
  assertIndex,
  emptyDriversService,
  getSubjectName,
  loadRequestOrThrow,
  publishPassengerRequestUpdated
} from "../../services/passengerRequest/envelope.js"
import {
  recomputeServiceStatus,
  resolveDriverCountStatus,
  transferFactCount
} from "../../services/passengerRequest/serviceStatus.js"
import {
  buildDriverPatchDescription,
  logPassengerRequestAction
} from "../../services/passengerRequest/logging.js"
import {
  generateDriverLink,
  reissueShiftedDriverLinks
} from "../../services/passengerRequest/externalLinks.js"

export default {
  Mutation: {
    // добавить водителя (для варианта проживание+трансфер)
    addPassengerRequestDriver: async (
      _,
      { requestId, driver, direction = "ARRIVAL" },
      context
    ) => {
      const existing = await loadRequestOrThrow(requestId)
      if (!driver?.fullName?.trim()) {
        throw new GraphQLError("Driver fullName is required")
      }

      // Привязка к гостинице — только к той, что есть в проживании этой заявки
      const hotelItemId = normalizeOptionalString(driver?.hotelItemId)
      const linkedHotel = hotelItemId
        ? (existing.livingService?.hotels || []).find(
            (h) => h?.itemId && h.itemId === hotelItemId
          )
        : null
      if (hotelItemId && !linkedHotel) {
        throw new GraphQLError(
          "Unknown hotelItemId: no such hotel in livingService"
        )
      }

      const transferField = getTransferField(direction)
      const prev = existing[transferField] || emptyDriversService()

      const normalizedDriver = normalizePassengerServiceDriver(driver)
      normalizedDriver.id = newDriverId()
      const driverIndex = (prev.drivers || []).length
      const adminId =
        context.subjectType === "USER" ? context.subject?.id : null
      try {
        const linkPWA = await generateDriverLink({
          driverName: normalizedDriver.fullName,
          requestId,
          driverIndex,
          driverId: normalizedDriver.id,
          adminId,
          serviceKind: getTransferServiceKind(direction)
        })
        normalizedDriver.linkPWA = linkPWA
      } catch (e) {
        normalizedDriver.linkPWA = null
      }

      const drivers = [
        ...normalizeDriversForWrite(prev.drivers),
        normalizedDriver
      ]
      const isFirstDriver = driverIndex === 0
      const nextStatus = isFirstDriver ? "ACCEPTED" : prev.status
      const nextTimes = isFirstDriver
        ? updateTimes(prev.times, "ACCEPTED")
        : prev.times

      const data = {
        [transferField]: {
          ...prev,
          drivers,
          status: nextStatus,
          times: nextTimes
        }
      }

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data
      })
      await logPassengerRequestAction({
        context,
        action: "add_passenger_request_driver",
        description: "Водитель добавлен в трансфер ФАП",
        fulldescription: `Пользователь ${getSubjectName(context)} добавил водителя в трансфер ФАП ${passengerRequest.flightNumber}${linkedHotel ? ` (гостиница «${linkedHotel.name}»)` : ""}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
      })

      publishPassengerRequestUpdated(passengerRequest)

      return passengerRequest
    },

    updatePassengerRequestDriver: async (
      _,
      { requestId, driverIndex, patch, direction },
      context
    ) => {
      const req = await loadRequestOrThrow(requestId)

      const field = getTransferField(direction)
      const service = req[field]
      if (!service?.plan?.enabled) throw new GraphQLError("Service is not enabled")
      // Патч разрешён и после COMPLETED: сумму/тип ТС/«перевезено» вводят по факту
      // поездки, а статусом управляет пересчёт (снижение факта ниже плана реоткроет
      // услугу). Запрет остаётся только для CANCELLED.
      if (service.status === "CANCELLED") {
        throw new GraphQLError("Service is cancelled, no updates allowed")
      }

      const drivers = normalizeDriversForWrite(service.drivers)
      assertIndex(driverIndex, drivers.length, "driverIndex")
      const before = drivers[driverIndex]

      const applied = {}
      if (Object.prototype.hasOwnProperty.call(patch, "pickupAt")) {
        applied.pickupAt = patch.pickupAt
      }
      if (Object.prototype.hasOwnProperty.call(patch, "vehicleType")) {
        applied.vehicleType = patch.vehicleType
      }
      if (Object.prototype.hasOwnProperty.call(patch, "reportCost")) {
        applied.reportCost = patch.reportCost
      }
      if (Object.prototype.hasOwnProperty.call(patch, "transportedCount")) {
        const value = patch.transportedCount
        if (value != null && (!Number.isInteger(value) || value < 0)) {
          throw new GraphQLError("transportedCount must be a non-negative integer")
        }
        applied.transportedCount = value
      }
      if (Object.keys(applied).length === 0) return req

      const factBefore = transferFactCount(drivers)
      drivers[driverIndex] = { ...before, ...applied }

      let nextService = { ...service, drivers }
      if ("transportedCount" in applied) {
        const recalc = resolveDriverCountStatus(
          service,
          factBefore,
          transferFactCount(drivers)
        )
        if (recalc) {
          nextService = { ...nextService, status: recalc.status, times: recalc.times }
        }
      }

      const updated = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: { [field]: nextService },
      })

      const log = buildDriverPatchDescription(before, applied, driverIndex, direction)
      await logPassengerRequestAction({
        context,
        action: "update_passenger_request_driver",
        description: log.short,
        fulldescription: log.full,
        oldData: req,
        newData: updated,
        airlineId: updated.airlineId,
        passengerRequestId: requestId,
        skipEmail: true
      })

      publishPassengerRequestUpdated(updated)

      return updated
    },

    removePassengerRequestDriver: async (
      _,
      { requestId, driverIndex, direction = "ARRIVAL" },
      context
    ) => {
      const existing = await loadRequestOrThrow(requestId)

      const transferField = getTransferField(direction)
      const prev = existing[transferField] || emptyDriversService()
      const drivers = prev.drivers || []
      assertIndex(driverIndex, drivers.length, "driverIndex")

      const removedDriver = normalizePassengerServiceDriver(
        drivers[driverIndex]
      )
      const nextDrivers = ensureDriverIds(
        drivers
          .filter((_, index) => index !== driverIndex)
          .map(normalizePassengerServiceDriver)
      )
      await reissueShiftedDriverLinks({
        requestId,
        serviceKind: getTransferServiceKind(direction),
        drivers: nextDrivers,
        removedIndex: driverIndex,
        adminId: context.subjectType === "USER" ? context.subject?.id : null
      })
      const totalPeopleBefore = transferFactCount(drivers)
      const totalPeopleAfter = transferFactCount(nextDrivers)
      const recalc =
        nextDrivers.length === 0
          ? { status: "NEW", times: prev.times || {} }
          : recomputeServiceStatus(prev, totalPeopleBefore, totalPeopleAfter)

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: {
          [transferField]: {
            ...prev,
            status: recalc.status,
            times: recalc.times,
            drivers: nextDrivers
          }
        }
      })
      await logPassengerRequestAction({
        context,
        action: "remove_passenger_request_driver",
        description: "Водитель удален из трансфера ФАП",
        fulldescription: `Пользователь ${getSubjectName(context)} удалил водителя ${removedDriver?.fullName || `#${driverIndex}`} из трансфера ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
      })

      publishPassengerRequestUpdated(passengerRequest)

      return passengerRequest
    },

    addPassengerRequestDriverPerson: async (
      _,
      { requestId, driverIndex, person, direction = "ARRIVAL" },
      context
    ) => {
      const existing = await loadRequestOrThrow(requestId)
      const personWithId = ensurePersonId(person)

      const transferField = getTransferField(direction)
      const prev = existing[transferField] || emptyDriversService()
      const drivers = prev.drivers || []
      assertIndex(driverIndex, drivers.length, "driverIndex")

      const driversClone = drivers.map((d, i) => {
        const normalized = normalizePassengerServiceDriver(d)
        if (i !== driverIndex) return normalized
        return {
          ...normalized,
          people: [...(normalized.people || []), ensureDriverPerson(personWithId)]
        }
      })

      const totalPeopleBefore = transferFactCount(drivers)
      const totalPeopleAfter = transferFactCount(driversClone)
      const recalc = recomputeServiceStatus(
        prev,
        totalPeopleBefore,
        totalPeopleAfter
      )
      const nextStatus = recalc.status
      const nextTimes = recalc.times

      const normalizedDriverPerson = ensureDriverPerson(personWithId)
      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: {
          [transferField]: {
            ...prev,
            drivers: driversClone,
            status: nextStatus,
            times: nextTimes
          },
          savedPassengers: upsertSavedPassenger(
            existing?.savedPassengers,
            snapshotFromDriverPerson(normalizedDriverPerson)
          )
        }
      })
      await logPassengerRequestAction({
        context,
        action: "add_passenger_request_driver_person",
        description: "Пассажир добавлен к водителю трансфера ФАП",
        fulldescription: `Пользователь ${getSubjectName(context)} добавил пассажира к водителю #${driverIndex} в ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
      })

      publishPassengerRequestUpdated(passengerRequest)

      return passengerRequest
    },

    addPassengerRequestDriverPeople: async (
      _,
      { requestId, driverIndex, people, direction = "ARRIVAL" },
      context
    ) => {
      if (!Array.isArray(people) || people.length === 0) {
        throw new GraphQLError("people must be a non-empty array")
      }
      const existing = await loadRequestOrThrow(requestId)
      const peopleWithId = people.map(ensurePersonId)

      const transferField = getTransferField(direction)
      const prev = existing[transferField] || emptyDriversService()
      const drivers = prev.drivers || []
      assertIndex(driverIndex, drivers.length, "driverIndex")

      const driversClone = drivers.map((d, i) => {
        const normalized = normalizePassengerServiceDriver(d)
        if (i !== driverIndex) return normalized
        const added = peopleWithId.map((p) => ensureDriverPerson(p))
        return {
          ...normalized,
          people: [...(normalized.people || []), ...added]
        }
      })

      const totalPeopleBefore = transferFactCount(drivers)
      const totalPeopleAfter = transferFactCount(driversClone)
      const recalc = recomputeServiceStatus(
        prev,
        totalPeopleBefore,
        totalPeopleAfter
      )
      const nextStatus = recalc.status
      const nextTimes = recalc.times

      let savedPassengers = existing.savedPassengers
      for (const p of peopleWithId) {
        savedPassengers = upsertSavedPassenger(
          savedPassengers,
          snapshotFromDriverPerson(ensureDriverPerson(p))
        )
      }

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: {
          [transferField]: {
            ...prev,
            drivers: driversClone,
            status: nextStatus,
            times: nextTimes
          },
          savedPassengers
        }
      })
      await logPassengerRequestAction({
        context,
        action: "add_passenger_request_driver_people",
        description: `Пакетно добавлены пассажиры к водителю трансфера ФАП (${people.length})`,
        fulldescription: `Пользователь ${getSubjectName(context)} добавил ${people.length} пассажиров к водителю #${driverIndex} в ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
      })

      publishPassengerRequestUpdated(passengerRequest)

      return passengerRequest
    },

    updatePassengerRequestDriverPerson: async (
      _,
      { requestId, driverIndex, personIndex, person, direction = "ARRIVAL" },
      context
    ) => {
      const existing = await loadRequestOrThrow(requestId)

      const transferField = getTransferField(direction)
      const prev = existing[transferField] || emptyDriversService()
      const drivers = prev.drivers || []
      assertIndex(driverIndex, drivers.length, "driverIndex")
      const people = drivers[driverIndex].people || []
      assertIndex(personIndex, people.length, "personIndex")

      const driversClone = drivers.map((d, i) => {
        const normalized = normalizePassengerServiceDriver(d)
        if (i !== driverIndex) return normalized
        const newPeople = [...(normalized.people || [])]
        const prevPerson = newPeople[personIndex]
        newPeople[personIndex] = ensureDriverPerson({
          ...person,
          personId: person?.personId ?? prevPerson?.personId ?? null
        })
        return { ...normalized, people: newPeople }
      })

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: {
          [transferField]: { ...prev, drivers: driversClone },
          savedPassengers: patchSavedPersonIdentity(
            existing.savedPassengers,
            driversClone[driverIndex].people[personIndex]
          )
        }
      })
      await logPassengerRequestAction({
        context,
        action: "update_passenger_request_driver_person",
        description: "Данные пассажира у водителя трансфера ФАП обновлены",
        fulldescription: `Пользователь ${getSubjectName(context)} обновил данные пассажира #${personIndex} у водителя #${driverIndex} в ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
      })

      publishPassengerRequestUpdated(passengerRequest)

      return passengerRequest
    },

    removePassengerRequestDriverPerson: async (
      _,
      { requestId, driverIndex, personIndex, direction = "ARRIVAL" },
      context
    ) => {
      const existing = await loadRequestOrThrow(requestId)

      const transferField = getTransferField(direction)
      const prev = existing[transferField] || emptyDriversService()
      const drivers = prev.drivers || []
      assertIndex(driverIndex, drivers.length, "driverIndex")
      const people = drivers[driverIndex].people || []
      assertIndex(personIndex, people.length, "personIndex")

      const driversClone = drivers.map((d, i) => {
        const normalized = normalizePassengerServiceDriver(d)
        if (i !== driverIndex) return normalized
        const newPeople = [...(normalized.people || [])]
        newPeople.splice(personIndex, 1)
        return { ...normalized, people: newPeople }
      })

      const totalPeopleBefore = transferFactCount(drivers)
      const totalPeopleAfter = transferFactCount(driversClone)
      const recalc = recomputeServiceStatus(
        prev,
        totalPeopleBefore,
        totalPeopleAfter
      )

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: {
          [transferField]: {
            ...prev,
            drivers: driversClone,
            status: recalc.status,
            times: recalc.times
          }
        }
      })
      await logPassengerRequestAction({
        context,
        action: "remove_passenger_request_driver_person",
        description: "Пассажир удален у водителя трансфера ФАП",
        fulldescription: `Пользователь ${getSubjectName(context)} удалил пассажира #${personIndex} у водителя #${driverIndex} в ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
      })

      publishPassengerRequestUpdated(passengerRequest)

      return passengerRequest
    },

    removePassengerRequestDriverPeople: async (
      _,
      { requestId, driverIndex, personIndexes, direction = "ARRIVAL" },
      context
    ) => {
      const existing = await loadRequestOrThrow(requestId)

      const transferField = getTransferField(direction)
      const prev = existing[transferField] || emptyDriversService()
      const drivers = prev.drivers || []
      assertIndex(driverIndex, drivers.length, "driverIndex")
      const people = drivers[driverIndex].people || []

      const indexes = normalizeBulkIndexes(personIndexes)
      if (indexes.length === 0) {
        throw new GraphQLError("Не выбран ни один пассажир")
      }
      for (const idx of indexes) {
        assertIndex(idx, people.length, "personIndex")
      }

      const driversClone = drivers.map((d, i) => {
        const normalized = normalizePassengerServiceDriver(d)
        if (i !== driverIndex) return normalized
        const { next } = spliceAtIndexes(normalized.people || [], indexes)
        return { ...normalized, people: next }
      })

      // Факт поездки = max(список, transportedCount), поэтому итог считаем
      // через transferFactCount, а не по длине people. Пересчёт один на пачку.
      const totalPeopleBefore = transferFactCount(drivers)
      const totalPeopleAfter = transferFactCount(driversClone)
      const recalc = recomputeServiceStatus(
        prev,
        totalPeopleBefore,
        totalPeopleAfter
      )

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: {
          [transferField]: {
            ...prev,
            drivers: driversClone,
            status: recalc.status,
            times: recalc.times
          }
        }
      })

      await logPassengerRequestAction({
        context,
        action: "remove_passenger_request_driver_people",
        description: "Пассажиры удалены у водителя трансфера ФАП",
        fulldescription: `Пользователь ${getSubjectName(context)} удалил пассажиров (${indexes.length}) у водителя #${driverIndex} в ФАП ${passengerRequest.flightNumber}`,
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

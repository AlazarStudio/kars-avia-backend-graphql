// Трансфер: водители и их пассажиры.

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
  withPassengerRequest
} from "../../services/passengerRequest/envelope.js"
import {
  driversServicePatch,
  mapDriverAt
} from "../../services/passengerRequest/driverHelpers.js"
import {
  recomputeServiceStatus,
  resolveDriverCountStatus,
  transferFactCount
} from "../../services/passengerRequest/serviceStatus.js"
import { buildDriverPatchDescription } from "../../services/passengerRequest/logging.js"
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
    ) =>
      withPassengerRequest({
        requestId,
        context,
        apply: async (existing) => {
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
          // Первый водитель поднимает услугу до ACCEPTED только ИЗ NEW. Раньше
          // гварда по статусу не было, и заведение поездки в пустой список
          // возвращало в ACCEPTED услугу любого статуса — дефект №11 реестра.
          // Больнее всего это било по досрочно завершённой: документ получал
          // status ACCEPTED при непустом earlyCompletedAt, а такого состояния
          // ни один законный переход не даёт. Гвард дословно тот же, что у
          // багажного близнеца, — две копии одного правила снова сходятся.
          const isFirstDriver = driverIndex === 0
          const accept = isFirstDriver && prev.status === "NEW"
          const nextStatus = accept ? "ACCEPTED" : prev.status
          const nextTimes = accept
            ? updateTimes(prev.times, "ACCEPTED")
            : prev.times

          return {
            data: {
              [transferField]: {
                ...prev,
                drivers,
                status: nextStatus,
                times: nextTimes
              }
            },
            log: {
              action: "add_passenger_request_driver",
              description: "Водитель добавлен в трансфер ФАП",
              fulldescription: `Пользователь ${getSubjectName(context)} добавил водителя в трансфер ФАП ${existing.flightNumber}${linkedHotel ? ` (гостиница «${linkedHotel.name}»)` : ""}`,
              airlineId: existing.airlineId,
              passengerRequestId: existing.id
            }
          }
        }
      }),

    updatePassengerRequestDriver: async (
      _,
      { requestId, driverIndex, patch, direction },
      context
    ) =>
      withPassengerRequest({
        requestId,
        context,
        apply: (existing) => {
          const field = getTransferField(direction)
          const service = existing[field]
          if (!service?.plan?.enabled) {
            throw new GraphQLError("Service is not enabled")
          }
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
          if (Object.prototype.hasOwnProperty.call(patch, "vehicleNumber")) {
            const value = typeof patch.vehicleNumber === "string" ? patch.vehicleNumber.trim() : ""
            applied.vehicleNumber = value || null
          }
          if (Object.prototype.hasOwnProperty.call(patch, "reportCost")) {
            applied.reportCost = patch.reportCost
          }
          if (Object.prototype.hasOwnProperty.call(patch, "transportedCount")) {
            const value = patch.transportedCount
            if (value != null && (!Number.isInteger(value) || value < 0)) {
              throw new GraphQLError(
                "transportedCount must be a non-negative integer"
              )
            }
            applied.transportedCount = value
          }
          // Ни одного ключа из белого списка — заявка возвращается как есть:
          // ни записи, ни истории, ни публикации. Единственная мутация группы,
          // которая так умеет; у остальных пустой вход доходит до записи.
          if (Object.keys(applied).length === 0) return null

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
              nextService = {
                ...nextService,
                status: recalc.status,
                times: recalc.times
              }
            }
          }

          const patchLog = buildDriverPatchDescription(
            before,
            applied,
            driverIndex,
            direction
          )

          return {
            data: { [field]: nextService },
            log: {
              action: "update_passenger_request_driver",
              description: patchLog.short,
              fulldescription: patchLog.full,
              airlineId: existing.airlineId,
              passengerRequestId: requestId,
              skipEmail: true
            }
          }
        }
      }),

    removePassengerRequestDriver: async (
      _,
      { requestId, driverIndex, direction = "ARRIVAL" },
      context
    ) =>
      withPassengerRequest({
        requestId,
        context,
        apply: async (existing) => {
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
          // Опустевший список пересчёт не зовёт вовсе — из-за этой ветки общий
          // driversServicePatch здесь неприменим: статус падает в NEW, а времена
          // прошлой жизни услуги остаются в документе как есть.
          const recalc =
            nextDrivers.length === 0
              ? { status: "NEW", times: prev.times || {} }
              : recomputeServiceStatus(prev, totalPeopleBefore, totalPeopleAfter)

          return {
            data: {
              [transferField]: {
                ...prev,
                status: recalc.status,
                times: recalc.times,
                drivers: nextDrivers
              }
            },
            log: {
              action: "remove_passenger_request_driver",
              description: "Водитель удален из трансфера ФАП",
              fulldescription: `Пользователь ${getSubjectName(context)} удалил водителя ${removedDriver?.fullName || `#${driverIndex}`} из трансфера ФАП ${existing.flightNumber}`,
              airlineId: existing.airlineId,
              passengerRequestId: existing.id
            }
          }
        }
      }),

    addPassengerRequestDriverPerson: async (
      _,
      { requestId, driverIndex, person, direction = "ARRIVAL" },
      context
    ) =>
      withPassengerRequest({
        requestId,
        context,
        apply: (existing) => {
          const personWithId = ensurePersonId(person)

          const transferField = getTransferField(direction)
          const prev = existing[transferField] || emptyDriversService()
          const drivers = prev.drivers || []
          assertIndex(driverIndex, drivers.length, "driverIndex")

          const driversClone = mapDriverAt(drivers, driverIndex, (driver) => ({
            ...driver,
            people: [...(driver.people || []), ensureDriverPerson(personWithId)]
          }))

          const normalizedDriverPerson = ensureDriverPerson(personWithId)

          return {
            data: {
              [transferField]: driversServicePatch(prev, driversClone),
              savedPassengers: upsertSavedPassenger(
                existing?.savedPassengers,
                snapshotFromDriverPerson(normalizedDriverPerson)
              )
            },
            log: {
              action: "add_passenger_request_driver_person",
              description: "Пассажир добавлен к водителю трансфера ФАП",
              fulldescription: `Пользователь ${getSubjectName(context)} добавил пассажира к водителю #${driverIndex} в ФАП ${existing.flightNumber}`,
              airlineId: existing.airlineId,
              passengerRequestId: existing.id
            }
          }
        }
      }),

    addPassengerRequestDriverPeople: async (
      _,
      { requestId, driverIndex, people, direction = "ARRIVAL" },
      context
    ) => {
      // Проверка стоит ДО конверта намеренно: пакетная версия отбивает пустой
      // список, вообще не сходив в базу, тогда как одиночная сначала грузит
      // заявку. Асимметрия закреплена характеризационным тестом.
      if (!Array.isArray(people) || people.length === 0) {
        throw new GraphQLError("people must be a non-empty array")
      }

      return withPassengerRequest({
        requestId,
        context,
        apply: (existing) => {
          const peopleWithId = people.map(ensurePersonId)

          const transferField = getTransferField(direction)
          const prev = existing[transferField] || emptyDriversService()
          const drivers = prev.drivers || []
          assertIndex(driverIndex, drivers.length, "driverIndex")

          const driversClone = mapDriverAt(drivers, driverIndex, (driver) => ({
            ...driver,
            people: [
              ...(driver.people || []),
              ...peopleWithId.map((p) => ensureDriverPerson(p))
            ]
          }))

          let savedPassengers = existing.savedPassengers
          for (const p of peopleWithId) {
            savedPassengers = upsertSavedPassenger(
              savedPassengers,
              snapshotFromDriverPerson(ensureDriverPerson(p))
            )
          }

          return {
            data: {
              [transferField]: driversServicePatch(prev, driversClone),
              savedPassengers
            },
            log: {
              action: "add_passenger_request_driver_people",
              description: `Пакетно добавлены пассажиры к водителю трансфера ФАП (${people.length})`,
              fulldescription: `Пользователь ${getSubjectName(context)} добавил ${people.length} пассажиров к водителю #${driverIndex} в ФАП ${existing.flightNumber}`,
              airlineId: existing.airlineId,
              passengerRequestId: existing.id
            }
          }
        }
      })
    },

    updatePassengerRequestDriverPerson: async (
      _,
      { requestId, driverIndex, personIndex, person, direction = "ARRIVAL" },
      context
    ) =>
      withPassengerRequest({
        requestId,
        context,
        apply: (existing) => {
          const transferField = getTransferField(direction)
          const prev = existing[transferField] || emptyDriversService()
          const drivers = prev.drivers || []
          assertIndex(driverIndex, drivers.length, "driverIndex")
          const people = drivers[driverIndex].people || []
          assertIndex(personIndex, people.length, "personIndex")

          const driversClone = mapDriverAt(drivers, driverIndex, (driver) => {
            const newPeople = [...(driver.people || [])]
            const prevPerson = newPeople[personIndex]
            newPeople[personIndex] = ensureDriverPerson({
              ...person,
              personId: person?.personId ?? prevPerson?.personId ?? null
            })
            return { ...driver, people: newPeople }
          })

          return {
            data: {
              // Единственная мутация группы без пересчёта статуса: замена
              // пассажира состав не меняет, поэтому driversServicePatch здесь
              // неприменим — статус и времена уносятся из prev как есть.
              [transferField]: { ...prev, drivers: driversClone },
              savedPassengers: patchSavedPersonIdentity(
                existing.savedPassengers,
                driversClone[driverIndex].people[personIndex]
              )
            },
            log: {
              action: "update_passenger_request_driver_person",
              description: "Данные пассажира у водителя трансфера ФАП обновлены",
              fulldescription: `Пользователь ${getSubjectName(context)} обновил данные пассажира #${personIndex} у водителя #${driverIndex} в ФАП ${existing.flightNumber}`,
              airlineId: existing.airlineId,
              passengerRequestId: existing.id
            }
          }
        }
      }),

    removePassengerRequestDriverPerson: async (
      _,
      { requestId, driverIndex, personIndex, direction = "ARRIVAL" },
      context
    ) =>
      withPassengerRequest({
        requestId,
        context,
        apply: (existing) => {
          const transferField = getTransferField(direction)
          const prev = existing[transferField] || emptyDriversService()
          const drivers = prev.drivers || []
          assertIndex(driverIndex, drivers.length, "driverIndex")
          const people = drivers[driverIndex].people || []
          assertIndex(personIndex, people.length, "personIndex")

          const driversClone = mapDriverAt(drivers, driverIndex, (driver) => {
            const newPeople = [...(driver.people || [])]
            newPeople.splice(personIndex, 1)
            return { ...driver, people: newPeople }
          })

          return {
            data: {
              [transferField]: driversServicePatch(prev, driversClone)
            },
            log: {
              action: "remove_passenger_request_driver_person",
              description: "Пассажир удален у водителя трансфера ФАП",
              fulldescription: `Пользователь ${getSubjectName(context)} удалил пассажира #${personIndex} у водителя #${driverIndex} в ФАП ${existing.flightNumber}`,
              airlineId: existing.airlineId,
              passengerRequestId: existing.id
            }
          }
        }
      }),

    removePassengerRequestDriverPeople: async (
      _,
      { requestId, driverIndex, personIndexes, direction = "ARRIVAL" },
      context
    ) =>
      withPassengerRequest({
        requestId,
        context,
        apply: (existing) => {
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

          const driversClone = mapDriverAt(drivers, driverIndex, (driver) => {
            const { next } = spliceAtIndexes(driver.people || [], indexes)
            return { ...driver, people: next }
          })

          return {
            data: {
              // Факт поездки = max(список, transportedCount), поэтому итог
              // считаем через transferFactCount (он внутри driversServicePatch),
              // а не по длине people. Пересчёт один на пачку.
              [transferField]: driversServicePatch(prev, driversClone)
            },
            log: {
              action: "remove_passenger_request_driver_people",
              description: "Пассажиры удалены у водителя трансфера ФАП",
              fulldescription: `Пользователь ${getSubjectName(context)} удалил пассажиров (${indexes.length}) у водителя #${driverIndex} в ФАП ${existing.flightNumber}`,
              airlineId: existing.airlineId,
              passengerRequestId: existing.id
            }
          }
        }
      })
  }
}

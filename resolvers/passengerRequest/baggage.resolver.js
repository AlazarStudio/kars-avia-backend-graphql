// Доставка багажа: водители, приём заказа, отметка доставки.

import { prisma } from "../../prisma.js"
import { GraphQLError } from "graphql"
import {
  normalizeDriversForWrite,
  tripReportCost,
  collectBaggageDriverPatch
} from "../../services/passengerRequest/baggageDelivery.js"
import {
  ensureDriverIds,
  newDriverId
} from "../../services/passengerRequest/serviceDrivers.js"
import {
  ensureDriverPerson,
  normalizePassengerServiceDriver
} from "../../services/passengerRequest/normalizers.js"
import {
  assertIndex,
  emptyDriversService,
  getSubjectName,
  loadRequestOrThrow,
  publishPassengerRequestUpdated
} from "../../services/passengerRequest/envelope.js"
import { recomputeServiceStatus } from "../../services/passengerRequest/serviceStatus.js"
import {
  buildBaggageDriverPatchDescription,
  logPassengerRequestAction
} from "../../services/passengerRequest/logging.js"
import {
  generateDriverLink,
  reissueShiftedDriverLinks
} from "../../services/passengerRequest/externalLinks.js"

export default {
  Mutation: {
    addPassengerRequestBaggageDriver: async (
      _,
      { requestId, driver },
      context
    ) => {
      const existing = await loadRequestOrThrow(requestId)
      if (!driver?.fullName?.trim()) {
        throw new GraphQLError("Driver fullName is required")
      }

      const prev = existing.baggageDeliveryService || emptyDriversService()

      // Поездка заводится сразу со списком пассажиров: они хранятся в общем
      // people[], чтобы получить personId и гидрацию идентичности из ростера
      // заявки. Ключ people есть в composite-типе — снимать его не нужно,
      // normalizePassengerServiceDriver прогонит каждого через ensureDriverPerson.
      const normalizedDriver = normalizePassengerServiceDriver(driver)
      normalizedDriver.reportCost = tripReportCost(normalizedDriver.people)
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
          serviceKind: "baggage"
        })
        normalizedDriver.linkPWA = linkPWA
      } catch (e) {
        normalizedDriver.linkPWA = null
      }

      const drivers = [
        ...normalizeDriversForWrite(prev.drivers),
        normalizedDriver
      ]

      const now = new Date()
      const isFirstDriver = (prev.drivers || []).length === 0
      const acceptedStatus =
        isFirstDriver && prev.status === "NEW" ? "ACCEPTED" : prev.status
      const acceptedTimes =
        isFirstDriver && prev.status === "NEW"
          ? { ...(prev.times || {}), acceptedAt: now }
          : prev.times || {}

      // Правило «первый водитель → ACCEPTED» остаётся нижней границей, но поездка
      // заводится сразу со списком пассажиров — поэтому дальше пересчитываем статус
      // по фактическому числу людей во ВСЁМ массиве водителей, ровно как в патче.
      // Иначе услуга с тремя заведёнными пассажирами висела бы в ACCEPTED до
      // следующей случайной правки. Поездка без пассажиров ничего не пересчитывает:
      // там поведение прежнее.
      let updatedStatus = acceptedStatus
      let updatedTimes = acceptedTimes
      if (normalizedDriver.people.length > 0) {
        const totalPeopleBefore = (prev.drivers || []).reduce(
          (sum, d) => sum + (Array.isArray(d.people) ? d.people.length : 0),
          0
        )
        const totalPeopleAfter = drivers.reduce(
          (sum, d) => sum + (Array.isArray(d.people) ? d.people.length : 0),
          0
        )
        const recalc = recomputeServiceStatus(
          { ...prev, status: acceptedStatus, times: acceptedTimes },
          totalPeopleBefore,
          totalPeopleAfter
        )
        updatedStatus = recalc.status
        updatedTimes = recalc.times
      }

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: {
          baggageDeliveryService: {
            ...prev,
            status: updatedStatus,
            times: updatedTimes,
            drivers
          }
        }
      })
      await logPassengerRequestAction({
        context,
        action: "add_passenger_request_baggage_driver",
        description: "Водитель добавлен в доставку багажа ФАП",
        fulldescription: `Пользователь ${getSubjectName(context)} добавил водителя в доставку багажа ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
      })

      publishPassengerRequestUpdated(passengerRequest)

      return passengerRequest
    },

    removePassengerRequestBaggageDriver: async (
      _,
      { requestId, driverIndex },
      context
    ) => {
      const existing = await loadRequestOrThrow(requestId)

      const prev = existing.baggageDeliveryService || emptyDriversService()
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
        serviceKind: "baggage",
        drivers: nextDrivers,
        removedIndex: driverIndex,
        adminId: context.subjectType === "USER" ? context.subject?.id : null
      })
      const totalPeopleBefore = drivers.reduce(
        (sum, d) => sum + (Array.isArray(d.people) ? d.people.length : 0),
        0
      )
      const totalPeopleAfter = nextDrivers.reduce(
        (sum, d) => sum + (Array.isArray(d.people) ? d.people.length : 0),
        0
      )
      const recalc =
        nextDrivers.length === 0
          ? { status: "NEW", times: prev.times || {} }
          : recomputeServiceStatus(prev, totalPeopleBefore, totalPeopleAfter)

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: {
          baggageDeliveryService: {
            ...prev,
            status: recalc.status,
            times: recalc.times,
            drivers: nextDrivers
          }
        }
      })
      await logPassengerRequestAction({
        context,
        action: "remove_passenger_request_baggage_driver",
        description: "Водитель удален из доставки багажа ФАП",
        fulldescription: `Пользователь ${getSubjectName(context)} удалил водителя ${removedDriver?.fullName || `#${driverIndex}`} из доставки багажа ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
      })

      publishPassengerRequestUpdated(passengerRequest)

      return passengerRequest
    },

    updatePassengerRequestBaggageDriver: async (
      _,
      { requestId, driverIndex, patch },
      context
    ) => {
      const existing = await loadRequestOrThrow(requestId)

      const prev = existing.baggageDeliveryService
      if (!prev) throw new GraphQLError("BaggageDeliveryService not found")
      if (!prev.plan?.enabled) throw new GraphQLError("Service is not enabled")
      if (prev.status === "COMPLETED" || prev.status === "CANCELLED") {
        throw new GraphQLError("Service is completed, no updates allowed")
      }

      const drivers = normalizeDriversForWrite(prev.drivers)
      assertIndex(driverIndex, drivers.length, "driverIndex")
      const before = drivers[driverIndex]

      const applied = collectBaggageDriverPatch(patch)
      if (Object.keys(applied).length === 0) return existing

      const next = { ...before, ...applied }
      if ("people" in applied) {
        // Тот же белый список, что и при создании: правка и заведение поездки
        // кладут в composite-тип одинаковый набор ключей. Нормализация внутри
        // идемпотентна, повторный прогон безвреден.
        next.people = applied.people.map(ensureDriverPerson)
        // Патч говорит про пассажиров — сумму поездки пересчитываем всегда,
        // в том числе в null на пустом списке. Молчит про пассажиров —
        // ручную сумму легаси-поездки не трогаем.
        next.reportCost = tripReportCost(next.people)
      }
      drivers[driverIndex] = next

      const nextService = { ...prev, drivers }
      if ("people" in applied) {
        // Патч — единственный путь, которым пассажиры попадают в существующую
        // поездку, поэтому статус услуги пересчитываем здесь же (как в
        // addPassengerRequestDriverPeople у трансфера). Иначе услуга висела бы в
        // ACCEPTED при любом числе заведённых пассажиров, а удаление посторонней
        // поездки задним числом внезапно перебрасывало бы её в IN_PROGRESS.
        // Людей считаем по ВСЕМУ массиву водителей: услуга одна на все поездки.
        const totalPeopleBefore = (prev.drivers || []).reduce(
          (sum, d) => sum + (Array.isArray(d.people) ? d.people.length : 0),
          0
        )
        const totalPeopleAfter = drivers.reduce(
          (sum, d) => sum + (Array.isArray(d.people) ? d.people.length : 0),
          0
        )
        const recalc = recomputeServiceStatus(
          prev,
          totalPeopleBefore,
          totalPeopleAfter
        )
        nextService.status = recalc.status
        nextService.times = recalc.times
      }

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: { baggageDeliveryService: nextService }
      })

      const log = buildBaggageDriverPatchDescription(before, applied, driverIndex)
      await logPassengerRequestAction({
        context,
        action: "update_passenger_request_baggage_driver",
        description: log.short,
        fulldescription: log.full,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id,
        skipEmail: true
      })

      publishPassengerRequestUpdated(passengerRequest)

      return passengerRequest
    },

    acceptPassengerRequestBaggageOrder: async (
      _,
      { requestId, driverIndex },
      context
    ) => {
      const existing = await loadRequestOrThrow(requestId)

      const bds = existing.baggageDeliveryService
      if (!bds) throw new GraphQLError("BaggageDeliveryService not found")

      const drivers = bds.drivers ?? []
      if (driverIndex < 0 || driverIndex >= drivers.length) {
        throw new GraphQLError("Driver index out of range")
      }

      const now = new Date()
      const alreadyInProgress =
        bds.status === "IN_PROGRESS" ||
        bds.status === "COMPLETED" ||
        bds.status === "CANCELLED"
      const updatedStatus = alreadyInProgress ? bds.status : "IN_PROGRESS"
      const updatedTimes = alreadyInProgress
        ? bds.times || {}
        : { ...(bds.times || {}), inProgressAt: now }

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: {
          baggageDeliveryService: {
            ...bds,
            drivers: normalizeDriversForWrite(drivers),
            status: updatedStatus,
            times: updatedTimes
          }
        }
      })

      const driver = drivers[driverIndex]
      await logPassengerRequestAction({
        context,
        action: "accept_passenger_request_baggage_order",
        description: "Водитель принял заказ на доставку багажа ФАП",
        fulldescription: `Водитель ${driver?.fullName ?? driverIndex} принял заказ на доставку багажа (ФАП ${passengerRequest.flightNumber})`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
      })

      publishPassengerRequestUpdated(passengerRequest)

      return passengerRequest
    },

    completePassengerRequestBaggageDriverDelivery: async (
      _,
      { requestId, driverIndex },
      context
    ) => {
      const existing = await loadRequestOrThrow(requestId)

      const bds = existing.baggageDeliveryService
      const drivers = bds?.drivers ?? []
      if (driverIndex < 0 || driverIndex >= drivers.length) {
        throw new GraphQLError("Driver index out of range")
      }

      // Дата доставки, введённая диспетчером вручную, — источник истины для реестра.
      // Водитель из PWA, нажимая «доставлено», не должен её затирать.
      const now = new Date()
      const updatedDrivers = normalizeDriversForWrite(drivers).map((d, i) =>
        i === driverIndex
          ? { ...d, deliveryCompletedAt: d.deliveryCompletedAt ?? now }
          : d
      )

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: {
          baggageDeliveryService: {
            ...bds,
            drivers: updatedDrivers
          }
        }
      })

      const driver = drivers[driverIndex]
      await logPassengerRequestAction({
        context,
        action: "complete_passenger_request_baggage_driver_delivery",
        description: "Отмечена выполненная доставка багажа водителем ФАП",
        fulldescription: `Пользователь ${getSubjectName(context)} отметил доставку багажа выполненной для водителя ${driver?.fullName ?? driverIndex} (ФАП ${passengerRequest.flightNumber})`,
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

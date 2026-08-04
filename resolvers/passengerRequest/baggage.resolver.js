// Доставка багажа: водители, приём заказа, отметка доставки.

import { GraphQLError } from "graphql"
import {
  normalizeDriversForWrite,
  tripReportCost,
  collectBaggageDriverPatch,
  countTripPeople
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
  withPassengerRequest
} from "../../services/passengerRequest/envelope.js"
import { recomputeServiceStatus } from "../../services/passengerRequest/serviceStatus.js"
import { buildBaggageDriverPatchDescription } from "../../services/passengerRequest/logging.js"
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
    ) =>
      withPassengerRequest({
        requestId,
        context,
        apply: async (existing) => {
          // Проверка имени стоит ВНУТРИ конверта: заявку мутация успевает
          // прочитать до отказа, и это закреплено характеризационным тестом.
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
          // Дефект №12 реестра: acceptedAt перезаписывается безусловно, а
          // трансферный близнец зовёт updateTimes и старую отметку бережёт.
          // Расхождение закреплено тестом — выравнивать его здесь нельзя.
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
            const totalPeopleBefore = countTripPeople(prev.drivers)
            const totalPeopleAfter = countTripPeople(drivers)
            const recalc = recomputeServiceStatus(
              { ...prev, status: acceptedStatus, times: acceptedTimes },
              totalPeopleBefore,
              totalPeopleAfter
            )
            updatedStatus = recalc.status
            updatedTimes = recalc.times
          }

          return {
            data: {
              baggageDeliveryService: {
                ...prev,
                status: updatedStatus,
                times: updatedTimes,
                drivers
              }
            },
            log: {
              action: "add_passenger_request_baggage_driver",
              description: "Водитель добавлен в доставку багажа ФАП",
              fulldescription: `Пользователь ${getSubjectName(context)} добавил водителя в доставку багажа ФАП ${existing.flightNumber}`,
              airlineId: existing.airlineId,
              passengerRequestId: existing.id
            }
          }
        }
      }),

    removePassengerRequestBaggageDriver: async (
      _,
      { requestId, driverIndex },
      context
    ) =>
      withPassengerRequest({
        requestId,
        context,
        apply: async (existing) => {
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
          const totalPeopleBefore = countTripPeople(drivers)
          const totalPeopleAfter = countTripPeople(nextDrivers)
          const recalc =
            nextDrivers.length === 0
              ? { status: "NEW", times: prev.times || {} }
              : recomputeServiceStatus(prev, totalPeopleBefore, totalPeopleAfter)

          return {
            data: {
              baggageDeliveryService: {
                ...prev,
                status: recalc.status,
                times: recalc.times,
                drivers: nextDrivers
              }
            },
            log: {
              action: "remove_passenger_request_baggage_driver",
              description: "Водитель удален из доставки багажа ФАП",
              fulldescription: `Пользователь ${getSubjectName(context)} удалил водителя ${removedDriver?.fullName || `#${driverIndex}`} из доставки багажа ФАП ${existing.flightNumber}`,
              airlineId: existing.airlineId,
              passengerRequestId: existing.id
            }
          }
        }
      }),

    updatePassengerRequestBaggageDriver: async (
      _,
      { requestId, driverIndex, patch },
      context
    ) =>
      withPassengerRequest({
        requestId,
        context,
        apply: (existing) => {
          const prev = existing.baggageDeliveryService
          if (!prev) throw new GraphQLError("BaggageDeliveryService not found")
          if (!prev.plan?.enabled) {
            throw new GraphQLError("Service is not enabled")
          }
          if (prev.status === "COMPLETED" || prev.status === "CANCELLED") {
            throw new GraphQLError("Service is completed, no updates allowed")
          }

          const drivers = normalizeDriversForWrite(prev.drivers)
          assertIndex(driverIndex, drivers.length, "driverIndex")
          const before = drivers[driverIndex]

          const applied = collectBaggageDriverPatch(patch)
          // Ни одного ключа из белого списка — заявка возвращается как есть:
          // ни записи, ни истории, ни публикации.
          if (Object.keys(applied).length === 0) return null

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
            const totalPeopleBefore = countTripPeople(prev.drivers)
            const totalPeopleAfter = countTripPeople(drivers)
            const recalc = recomputeServiceStatus(
              prev,
              totalPeopleBefore,
              totalPeopleAfter
            )
            nextService.status = recalc.status
            nextService.times = recalc.times
          }

          const patchLog = buildBaggageDriverPatchDescription(
            before,
            applied,
            driverIndex
          )

          return {
            data: { baggageDeliveryService: nextService },
            log: {
              action: "update_passenger_request_baggage_driver",
              description: patchLog.short,
              fulldescription: patchLog.full,
              airlineId: existing.airlineId,
              passengerRequestId: existing.id,
              skipEmail: true
            }
          }
        }
      }),

    acceptPassengerRequestBaggageOrder: async (
      _,
      { requestId, driverIndex },
      context
    ) =>
      withPassengerRequest({
        requestId,
        context,
        apply: (existing) => {
          const bds = existing.baggageDeliveryService
          if (!bds) throw new GraphQLError("BaggageDeliveryService not found")

          const drivers = bds.drivers ?? []
          // Своя проверка индекса вместо общего assertIndex: текст ошибки
          // другой и закреплён тестом.
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

          const driver = drivers[driverIndex]

          return {
            data: {
              baggageDeliveryService: {
                ...bds,
                drivers: normalizeDriversForWrite(drivers),
                status: updatedStatus,
                times: updatedTimes
              }
            },
            log: {
              action: "accept_passenger_request_baggage_order",
              description: "Водитель принял заказ на доставку багажа ФАП",
              fulldescription: `Водитель ${driver?.fullName ?? driverIndex} принял заказ на доставку багажа (ФАП ${existing.flightNumber})`,
              airlineId: existing.airlineId,
              passengerRequestId: existing.id
            }
          }
        }
      }),

    completePassengerRequestBaggageDriverDelivery: async (
      _,
      { requestId, driverIndex },
      context
    ) =>
      withPassengerRequest({
        requestId,
        context,
        apply: (existing) => {
          const bds = existing.baggageDeliveryService
          const drivers = bds?.drivers ?? []
          // Услуги может не быть вовсе: жалоба уходит на индекс, не на услугу.
          if (driverIndex < 0 || driverIndex >= drivers.length) {
            throw new GraphQLError("Driver index out of range")
          }

          // Дата доставки, введённая диспетчером вручную, — источник истины для реестра.
          // Водитель из PWA, нажимая «доставлено», не должен её затирать.
          const now = new Date()
          // normalizeDriversForWrite прогоняется по ВСЕМУ массиву: побочная
          // починка легаси-пассажиров чужих поездок — часть поведения мутации.
          const updatedDrivers = normalizeDriversForWrite(drivers).map((d, i) =>
            i === driverIndex
              ? { ...d, deliveryCompletedAt: d.deliveryCompletedAt ?? now }
              : d
          )

          const driver = drivers[driverIndex]

          return {
            // Дефект №14 реестра: пересчёта статуса услуги здесь нет вовсе —
            // пишутся только drivers. Услуга этим путём никогда не становится
            // COMPLETED. Закреплено тестом, добавлять пересчёт нельзя.
            data: {
              baggageDeliveryService: {
                ...bds,
                drivers: updatedDrivers
              }
            },
            log: {
              action: "complete_passenger_request_baggage_driver_delivery",
              description: "Отмечена выполненная доставка багажа водителем ФАП",
              fulldescription: `Пользователь ${getSubjectName(context)} отметил доставку багажа выполненной для водителя ${driver?.fullName ?? driverIndex} (ФАП ${existing.flightNumber})`,
              airlineId: existing.airlineId,
              passengerRequestId: existing.id
            }
          }
        }
      })
  }
}

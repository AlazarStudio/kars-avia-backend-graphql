// Проживание: гостиницы заявки и заселение пассажиров.

import { prisma } from "../../prisma.js"
import { GraphQLError } from "graphql"
import { updateTimes } from "../../services/passengerRequest/utils.js"
import { ensurePassengerServiceHotelItemId } from "../../services/passengerRequest/hotelItem.js"
import {
  ensurePersonId,
  snapshotFromHotelPerson,
  upsertSavedPassenger,
  patchSavedPersonIdentity
} from "../../services/passengerRequest/savedPassengers.js"
import { normalizeDriversForWrite } from "../../services/passengerRequest/baggageDelivery.js"
import { normalizeBulkIndexes } from "../../services/passengerRequest/bulkHotelPeople.js"
import {
  ensureAccommodationChesses,
  ensureHotelPerson,
  makeRoomCategoryLabel,
  normalizeOptionalString,
  normalizePersonCategory,
  normalizePersonType
} from "../../services/passengerRequest/normalizers.js"
import {
  applyServiceRecalc,
  assertHotelScopeAccess,
  notifyHotelOverbookIfCrossed,
  withHotelPeople
} from "../../services/passengerRequest/livingHelpers.js"
import {
  assertIndex,
  emptyLivingService,
  finishPassengerRequestMutation,
  getSubjectName,
  loadRequestOrThrow,
  withPassengerRequest
} from "../../services/passengerRequest/envelope.js"
import { generateHotelLinks } from "../../services/passengerRequest/externalLinks.js"
import { assertCanAccessRequest } from "../../services/passengerRequest/fapScopeGuard.js"

export default {
  Mutation: {
    // добавить отель
    addPassengerRequestHotel: async (_, { requestId, hotel }, context) =>
      withPassengerRequest({
        requestId,
        context,
        apply: async (existing) => {
          const prev = existing.livingService || emptyLivingService()

          const hotelWithItemId = ensurePassengerServiceHotelItemId(hotel)

          const adminId =
            context.subjectType === "USER" ? context.subject?.id : null
          try {
            const links = await generateHotelLinks({
              hotel: hotelWithItemId,
              requestId,
              adminId
            })
            hotelWithItemId.linkCRM = links.linkCRM
            hotelWithItemId.linkPWA = links.linkPWA
          } catch (e) {
            hotelWithItemId.linkCRM = null
            hotelWithItemId.linkPWA = null
          }

          const hotels = [...(prev.hotels || []), hotelWithItemId]
          const isFirstHotel = (prev.hotels || []).length === 0
          const nextStatus = isFirstHotel ? "ACCEPTED" : prev.status
          const nextTimes = isFirstHotel
            ? updateTimes(prev.times, "ACCEPTED")
            : prev.times

          return {
            data: {
              livingService: {
                ...prev,
                hotels,
                status: nextStatus,
                times: nextTimes
              }
            },
            log: (passengerRequest) => ({
              action: "add_passenger_request_hotel",
              description: `Гостиница добавлена в ФАП: ${hotelWithItemId.name}`,
              fulldescription: `Пользователь ${getSubjectName(context)} добавил гостиницу ${hotelWithItemId.name} в ФАП ${passengerRequest.flightNumber}`,
              airlineId: passengerRequest.airlineId,
              passengerRequestId: passengerRequest.id,
              emailExtras: { hotelName: hotelWithItemId.name }
            }),
            notify: (passengerRequest) => ({
              action: "update_hotel_chess_passenger_request",
              passengerRequestId: passengerRequest.id,
              airlineId: passengerRequest.airlineId,
              hotelId: hotelWithItemId.hotelId || undefined,
              descriptionHtml: `В ФАП <span style='color:#545873'>${passengerRequest.flightNumber}</span> добавлена гостиница <span style='color:#545873'>${hotelWithItemId.name}</span>`,
              __typename: "PassengerRequestUpdatedNotification"
            })
          }
        }
      }),

    // Единственная мутация группы вне полного конверта: удаление гостиницы идёт
    // одной транзакцией с удалением и сдвигом записей отчёта, а конверт умеет
    // ровно один prisma.passengerRequest.update. На общий хвост переведена.
    removePassengerRequestHotel: async (
      _,
      { requestId, hotelIndex },
      context
    ) => {
      const existing = await loadRequestOrThrow(requestId)
      assertCanAccessRequest(context, existing)

      const living = existing.livingService || emptyLivingService()
      const hotels = living.hotels || []
      assertIndex(hotelIndex, hotels.length, "hotelIndex")

      const removedHotel = hotels[hotelIndex]
      const indexMap = new Map()
      let nextIndex = 0
      hotels.forEach((hotel, idx) => {
        if (idx === hotelIndex) return
        indexMap.set(idx, nextIndex)
        nextIndex += 1
      })

      const nextHotels = hotels
        .map((hotel, oldIndex) => ({ hotel, oldIndex }))
        .filter(({ oldIndex }) => oldIndex !== hotelIndex)
        .map(({ hotel, oldIndex }) => {
          const hotelName = hotel?.name ?? null
          const nextPeople = (hotel?.people || []).map((person) => {
            // ⚠️ Синтез недостающего интервала идёт по СТАРОМУ индексу гостиницы.
            // Раньше сюда передавался индекс в уже отфильтрованном массиве, то
            // есть НОВЫЙ, и синтезированная запись следом проходила через
            // indexMap, который переводит старые индексы в новые, — перевод
            // случался дважды. Легаси-гость получал либо чужую гостиницу с её
            // именем, либо пустое размещение, если новый индекс численно совпал
            // с удалённым.
            const normalizedPerson = ensureHotelPerson(
              person,
              oldIndex,
              hotelName
            )
            const nextChesses = (normalizedPerson.accommodationChesses || [])
              .filter((item) => item?.hotelIndex !== hotelIndex)
              .map((item) => {
                const mappedIndex = indexMap.get(item?.hotelIndex)
                if (mappedIndex == null) return item
                return {
                  ...item,
                  hotelIndex: mappedIndex,
                  hotelName:
                    hotels[item.hotelIndex]?.name ?? item.hotelName ?? null
                }
              })
            return {
              ...normalizedPerson,
              accommodationChesses: nextChesses
            }
          })
          return {
            ...hotel,
            people: nextPeople
          }
        })

      const nextEvictions = (living.evictions || [])
        .filter((item) => item?.hotelIndex !== hotelIndex)
        .map((item) => {
          const mappedIndex = indexMap.get(item?.hotelIndex)
          if (mappedIndex == null) return item
          return {
            ...item,
            hotelIndex: mappedIndex,
            hotelName: hotels[item.hotelIndex]?.name ?? item.hotelName ?? null
          }
        })

      // Сброс в NEW при опустевшем списке гостиниц идёт мимо движка статусов —
      // ветка остаётся инлайном, под общий пересчёт она не подводится.
      const recalc =
        nextHotels.length === 0
          ? { status: "NEW", times: living.times || {} }
          : applyServiceRecalc(living, hotels, nextHotels)
      const nextLivingService = {
        ...living,
        hotels: nextHotels,
        evictions: nextEvictions,
        status: recalc.status,
        times: recalc.times
      }

      // привязка поездок к удалённой гостинице снимается — как и остальные ссылки на отель
      // услуги без таких поездок не переписываем
      const detachedDriverServices = {}
      if (removedHotel?.itemId) {
        for (const serviceField of [
          "transferService",
          "departureTransferService",
          "intercityTransferService",
          "baggageDeliveryService"
        ]) {
          const prevService = existing[serviceField]
          const hasLinked = (prevService?.drivers || []).some(
            (d) => d?.hotelItemId === removedHotel.itemId
          )
          if (!hasLinked) continue
          detachedDriverServices[serviceField] = {
            ...prevService,
            drivers: normalizeDriversForWrite(prevService.drivers).map((d) =>
              d.hotelItemId === removedHotel.itemId
                ? { ...d, hotelItemId: null }
                : d
            )
          }
        }
      }

      const [, , passengerRequest] = await prisma.$transaction([
        prisma.passengerRequestHotelReport.deleteMany({
          where: {
            passengerRequestId: requestId,
            hotelIndex
          }
        }),
        prisma.passengerRequestHotelReport.updateMany({
          where: {
            passengerRequestId: requestId,
            hotelIndex: { gt: hotelIndex }
          },
          data: {
            hotelIndex: {
              decrement: 1
            }
          }
        }),
        prisma.passengerRequest.update({
          where: { id: requestId },
          data: {
            livingService: nextLivingService,
            ...detachedDriverServices
          }
        })
      ])

      await finishPassengerRequestMutation({
        context,
        oldData: existing,
        newData: passengerRequest,
        log: {
          action: "remove_passenger_request_hotel",
          description: `Гостиница удалена из ФАП: ${removedHotel?.name || "без названия"}`,
          fulldescription: `Пользователь ${getSubjectName(context)} удалил гостиницу ${removedHotel?.name || "без названия"} из ФАП ${passengerRequest.flightNumber}`,
          airlineId: passengerRequest.airlineId,
          passengerRequestId: passengerRequest.id,
          emailExtras: { hotelName: removedHotel?.name }
        },
        notify: {
          action: "update_hotel_chess_passenger_request",
          passengerRequestId: passengerRequest.id,
          airlineId: passengerRequest.airlineId,
          hotelId: removedHotel?.hotelId || undefined,
          descriptionHtml: `В ФАП <span style='color:#545873'>${passengerRequest.flightNumber}</span> удалена гостиница <span style='color:#545873'>${removedHotel?.name || "без названия"}</span>`,
          __typename: "PassengerRequestUpdatedNotification"
        }
      })

      return passengerRequest
    },

    // обновить редактируемые поля отеля (name / peopleCount / address / link / hotelId)
    // itemId, people, accommodationChesses, linkCRM/linkPWA не трогаем — сохраняем как есть
    updatePassengerRequestHotel: async (
      _,
      { requestId, hotelIndex, hotel },
      context
    ) =>
      withPassengerRequest({
        requestId,
        context,
        apply: (existing) => {
          const living = existing.livingService || emptyLivingService()
          const hotels = living.hotels || []
          assertIndex(hotelIndex, hotels.length, "hotelIndex")

          const prevHotel = hotels[hotelIndex] || {}
          const placedCount = (prevHotel.people || []).length

          // Валидация: новое количество мест не может быть меньше уже размещённых
          if (
            typeof hotel.peopleCount === "number" &&
            hotel.peopleCount < placedCount
          ) {
            throw new GraphQLError(
              `Нельзя задать меньше количества уже размещённых гостей (${placedCount})`
            )
          }

          const updatedHotel = {
            ...prevHotel,
            name: hotel.name ?? prevHotel.name,
            peopleCount:
              typeof hotel.peopleCount === "number"
                ? hotel.peopleCount
                : prevHotel.peopleCount,
            address: hotel.address ?? prevHotel.address ?? null,
            link: hotel.link ?? prevHotel.link ?? null,
            hotelId: hotel.hotelId ?? prevHotel.hotelId ?? null
          }

          const nextHotels = hotels.map((h, i) =>
            i === hotelIndex ? updatedHotel : h
          )

          return {
            data: {
              livingService: {
                ...living,
                hotels: nextHotels
              }
            },
            log: (passengerRequest) => ({
              action: "update_passenger_request_hotel",
              description: `Гостиница обновлена в ФАП: ${updatedHotel.name || "без названия"}`,
              fulldescription: `Пользователь ${getSubjectName(context)} обновил гостиницу ${updatedHotel.name || "без названия"} в ФАП ${passengerRequest.flightNumber} (мест: ${updatedHotel.peopleCount})`,
              airlineId: passengerRequest.airlineId,
              passengerRequestId: passengerRequest.id,
              emailExtras: { hotelName: updatedHotel.name }
            }),
            notify: (passengerRequest) => ({
              action: "update_hotel_chess_passenger_request",
              passengerRequestId: passengerRequest.id,
              airlineId: passengerRequest.airlineId,
              hotelId: updatedHotel.hotelId || undefined,
              descriptionHtml: `В ФАП <span style='color:#545873'>${passengerRequest.flightNumber}</span> обновлена гостиница <span style='color:#545873'>${updatedHotel.name || "без названия"}</span>`,
              __typename: "PassengerRequestUpdatedNotification"
            })
          }
        }
      }),

    addPassengerRequestHotelPerson: async (
      _,
      { requestId, hotelIndex, person },
      context
    ) => {
      // Уведомление о переборе живёт ВНЕ конверта: оно условное, обёрнуто в
      // try/catch и обязано идти после публикации, а конверт шлёт уведомление
      // безусловно и без глушения ошибок. Сведения о пороге собираются внутри
      // apply — только там доступна заявка до записи.
      let overbook = null

      const passengerRequest = await withPassengerRequest({
        requestId,
        context,
        apply: (existing) => {
          const personWithId = ensurePersonId(person)

          const living = existing.livingService || emptyLivingService()
          const hotels = living.hotels || []
          assertIndex(hotelIndex, hotels.length, "hotelIndex")
          // Порог перебора считаем по КОНКРЕТНОЙ гостинице: факт услуги ниже
          // считается по всем гостиницам сразу и для этого не годится.
          const overbookHotel = hotels[hotelIndex] || {}
          const placedBefore = (overbookHotel.people || []).length
          overbook = {
            hotel: overbookHotel,
            capacity: Number(overbookHotel.peopleCount) || 0,
            placedBefore,
            placedAfter: placedBefore + 1
          }
          assertHotelScopeAccess(context, hotels, hotelIndex)

          const hotelsClone = withHotelPeople(
            hotels,
            hotelIndex,
            (h, i, people) => [
              ...people,
              ensureHotelPerson(personWithId, i, h?.name ?? "")
            ]
          )

          const recalc = applyServiceRecalc(living, living.hotels, hotelsClone)

          const targetHotelForPerson = hotels[hotelIndex]
          const normalizedHotelPerson = ensureHotelPerson(
            personWithId,
            hotelIndex,
            targetHotelForPerson?.name ?? ""
          )

          return {
            data: {
              livingService: {
                ...living,
                hotels: hotelsClone,
                status: recalc.status,
                times: recalc.times
              },
              savedPassengers: upsertSavedPassenger(
                existing?.savedPassengers,
                snapshotFromHotelPerson(normalizedHotelPerson)
              )
            },
            log: (passengerRequest) => ({
              action: "add_passenger_request_hotel_person",
              description: "Пассажир добавлен в гостиницу ФАП",
              fulldescription: `Пользователь ${getSubjectName(context)} добавил пассажира в гостиницу ФАП ${passengerRequest.flightNumber}`,
              airlineId: passengerRequest.airlineId,
              passengerRequestId: passengerRequest.id,
              emailExtras: {
                hotelName: targetHotelForPerson?.name,
                personName: person?.fullName,
                roomName: makeRoomCategoryLabel(
                  person?.roomCategory,
                  person?.roomKind
                )
              }
            })
          }
        }
      })

      await notifyHotelOverbookIfCrossed({
        ...overbook,
        passengerRequest,
        requestId,
        hotelIndex
      })

      return passengerRequest
    },

    addPassengerRequestHotelPeople: async (
      _,
      { requestId, hotelIndex, people },
      context
    ) => {
      // Проверка стоит ДО конверта: пустая пачка отбивается, вообще не сходив
      // в базу. Асимметрия с одиночной версией закреплена тестом.
      if (!Array.isArray(people) || people.length === 0) {
        throw new GraphQLError("people must be a non-empty array")
      }

      let overbook = null

      const passengerRequest = await withPassengerRequest({
        requestId,
        context,
        apply: (existing) => {
          const peopleWithId = people.map(ensurePersonId)

          const living = existing.livingService || emptyLivingService()
          const hotels = living.hotels || []
          assertIndex(hotelIndex, hotels.length, "hotelIndex")
          const overbookHotel = hotels[hotelIndex] || {}
          const placedBefore = (overbookHotel.people || []).length
          overbook = {
            hotel: overbookHotel,
            capacity: Number(overbookHotel.peopleCount) || 0,
            placedBefore,
            placedAfter: placedBefore + peopleWithId.length
          }
          assertHotelScopeAccess(context, hotels, hotelIndex)

          const hotelsClone = withHotelPeople(
            hotels,
            hotelIndex,
            (h, i, existingPeople) => [
              ...existingPeople,
              ...peopleWithId.map((p) => ensureHotelPerson(p, i, h?.name ?? ""))
            ]
          )

          const recalc = applyServiceRecalc(living, living.hotels, hotelsClone)

          let savedPassengers = existing.savedPassengers
          for (const p of peopleWithId) {
            savedPassengers = upsertSavedPassenger(
              savedPassengers,
              snapshotFromHotelPerson(
                ensureHotelPerson(p, hotelIndex, hotels[hotelIndex]?.name ?? "")
              )
            )
          }

          return {
            data: {
              livingService: {
                ...living,
                hotels: hotelsClone,
                status: recalc.status,
                times: recalc.times
              },
              savedPassengers
            },
            log: (passengerRequest) => ({
              action: "add_passenger_request_hotel_people",
              description: `Пакетно добавлены пассажиры в гостиницу ФАП (${people.length})`,
              fulldescription: `Пользователь ${getSubjectName(context)} добавил ${people.length} пассажиров в гостиницу ФАП ${passengerRequest.flightNumber}`,
              airlineId: passengerRequest.airlineId,
              passengerRequestId: passengerRequest.id
            })
          }
        }
      })

      await notifyHotelOverbookIfCrossed({
        ...overbook,
        passengerRequest,
        requestId,
        hotelIndex
      })

      return passengerRequest
    },

    updatePassengerRequestHotelPerson: async (
      _,
      { requestId, hotelIndex, personIndex, person },
      context
    ) =>
      withPassengerRequest({
        requestId,
        context,
        apply: (existing) => {
          const living = existing.livingService || emptyLivingService()
          const hotels = living.hotels || []
          assertIndex(hotelIndex, hotels.length, "hotelIndex")
          const people = hotels[hotelIndex].people || []
          assertIndex(personIndex, people.length, "personIndex")

          // Людей своей гостиницы правка берёт СЫРЫМИ: нормализуется только сам
          // правленый гость, соседи по гостинице остаются как лежали.
          const hotelsClone = withHotelPeople(hotels, hotelIndex, (h, i) => {
            const newPeople = [...(h.people || [])]
            const previousPerson = newPeople[personIndex]
            newPeople[personIndex] = {
              // Прежний гость — база, инпут накладывается поверх. Клиенты шлют неполный
              // набор полей, и без базы всё, чего нет в инпуте (arrival, departure,
              // roomCategory, roomKind), пропадало бы из документа.
              ...ensureHotelPerson(previousPerson, i, h.name),
              ...person,
              personId: person?.personId ?? previousPerson?.personId ?? null,
              personType: normalizePersonType(
                person?.personType ?? previousPerson?.personType
              ),
              personCategory: normalizePersonCategory(
                person?.personCategory ?? previousPerson?.personCategory
              ),
              airlinePersonalId:
                normalizeOptionalString(person?.airlinePersonalId) ??
                previousPerson?.airlinePersonalId ??
                null,
              accommodationChesses: ensureAccommodationChesses(
                previousPerson,
                i,
                h.name
              )
            }
            return newPeople
          })

          return {
            data: {
              livingService: {
                ...living,
                hotels: hotelsClone
              },
              savedPassengers: patchSavedPersonIdentity(
                existing.savedPassengers,
                hotelsClone[hotelIndex].people[personIndex]
              )
            },
            log: (passengerRequest) => ({
              action: "update_passenger_request_hotel_person",
              description: "Данные пассажира в гостинице ФАП обновлены",
              fulldescription: `Пользователь ${getSubjectName(context)} обновил данные пассажира в гостинице ФАП ${passengerRequest.flightNumber}`,
              airlineId: passengerRequest.airlineId,
              passengerRequestId: passengerRequest.id
            })
          }
        }
      }),

    assignPassengerRequestHotelRoom: async (
      _,
      { requestId, hotelIndex, personIndexes, roomNumber },
      context
    ) =>
      withPassengerRequest({
        requestId,
        context,
        apply: (existing) => {
          const living = existing.livingService || emptyLivingService()
          const hotels = living.hotels || []
          assertIndex(hotelIndex, hotels.length, "hotelIndex")
          const people = hotels[hotelIndex].people || []

          // Индексы здесь не съезжают (это update, а не удаление), нормализация нужна
          // ради дедупа и предсказуемого порядка.
          const indexes = normalizeBulkIndexes(personIndexes)
          if (indexes.length === 0) {
            throw new GraphQLError("Не выбран ни один гость")
          }
          for (const idx of indexes) {
            assertIndex(idx, people.length, "personIndex")
          }

          const room = normalizeOptionalString(roomNumber)
          const target = new Set(indexes)

          const hotelsClone = withHotelPeople(
            hotels,
            hotelIndex,
            (h, i, normalizedPeople) =>
              // Меняем ОДНО поле у существующего объекта: остальные (arrival,
              // departure, roomCategory, roomKind…) остаются нетронутыми.
              normalizedPeople.map((normalized, personIndex) =>
                target.has(personIndex)
                  ? { ...normalized, roomNumber: room }
                  : normalized
              )
          )

          return {
            data: {
              livingService: {
                ...living,
                hotels: hotelsClone
              }
            },
            log: (passengerRequest) => ({
              action: "assign_passenger_request_hotel_room",
              description: "Присвоен номер комнаты в гостинице ФАП",
              fulldescription: `Пользователь ${getSubjectName(context)} присвоил номер «${room ?? "—"}» гостям (${indexes.length}) в гостинице ${hotels[hotelIndex]?.name || "без названия"} ФАП ${passengerRequest.flightNumber}`,
              airlineId: passengerRequest.airlineId,
              passengerRequestId: passengerRequest.id
            })
          }
        }
      }),

    removePassengerRequestHotelPerson: async (
      _,
      { requestId, hotelIndex, personIndex },
      context
    ) =>
      withPassengerRequest({
        requestId,
        context,
        apply: (existing) => {
          const living = existing.livingService || emptyLivingService()
          const hotels = living.hotels || []
          assertIndex(hotelIndex, hotels.length, "hotelIndex")
          const people = hotels[hotelIndex].people || []
          assertIndex(personIndex, people.length, "personIndex")

          const hotelsClone = withHotelPeople(
            hotels,
            hotelIndex,
            (h, i, normalizedPeople) => {
              const newPeople = [...normalizedPeople]
              newPeople.splice(personIndex, 1)
              return newPeople
            }
          )

          const recalc = applyServiceRecalc(living, hotels, hotelsClone)

          return {
            data: {
              livingService: {
                ...living,
                hotels: hotelsClone,
                status: recalc.status,
                times: recalc.times
              }
            },
            log: (passengerRequest) => ({
              action: "remove_passenger_request_hotel_person",
              description: "Пассажир удалён из гостиницы ФАП",
              fulldescription: `Пользователь ${getSubjectName(context)} удалил пассажира из гостиницы ФАП ${passengerRequest.flightNumber}`,
              airlineId: passengerRequest.airlineId,
              passengerRequestId: passengerRequest.id
            })
          }
        }
      })
  }
}

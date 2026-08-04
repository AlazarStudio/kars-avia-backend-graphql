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
  assertIndex,
  emptyLivingService,
  getSubjectName,
  loadRequestOrThrow,
  publishPassengerRequestUpdated
} from "../../services/passengerRequest/envelope.js"
import { recomputeServiceStatus } from "../../services/passengerRequest/serviceStatus.js"
import { logPassengerRequestAction } from "../../services/passengerRequest/logging.js"
import { notifyPassengerRequestSite } from "../../services/passengerRequest/notify.js"
import { generateHotelLinks } from "../../services/passengerRequest/externalLinks.js"

export default {
  Mutation: {
    // добавить отель
    addPassengerRequestHotel: async (_, { requestId, hotel }, context) => {
      const existing = await loadRequestOrThrow(requestId)

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

      const data = {
        livingService: {
          ...prev,
          hotels,
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
        action: "add_passenger_request_hotel",
        description: `Гостиница добавлена в ФАП: ${hotelWithItemId.name}`,
        fulldescription: `Пользователь ${getSubjectName(context)} добавил гостиницу ${hotelWithItemId.name} в ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id,
        emailExtras: { hotelName: hotelWithItemId.name }
      })

      publishPassengerRequestUpdated(passengerRequest)

      await notifyPassengerRequestSite({
        action: "update_hotel_chess_passenger_request",
        passengerRequestId: passengerRequest.id,
        airlineId: passengerRequest.airlineId,
        hotelId: hotelWithItemId.hotelId || undefined,
        descriptionHtml: `В ФАП <span style='color:#545873'>${passengerRequest.flightNumber}</span> добавлена гостиница <span style='color:#545873'>${hotelWithItemId.name}</span>`,
        __typename: "PassengerRequestUpdatedNotification"
      })

      return passengerRequest
    },

    removePassengerRequestHotel: async (
      _,
      { requestId, hotelIndex },
      context
    ) => {
      const existing = await loadRequestOrThrow(requestId)

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
        .filter((_, idx) => idx !== hotelIndex)
        .map((hotel, idx) => {
          const hotelName = hotel?.name ?? null
          const nextPeople = (hotel?.people || []).map((person) => {
            const normalizedPerson = ensureHotelPerson(person, idx, hotelName)
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

      const totalPeopleBefore = hotels.reduce(
        (sum, h) => sum + (Array.isArray(h.people) ? h.people.length : 0),
        0
      )
      const totalPeopleAfter = nextHotels.reduce(
        (sum, h) => sum + (Array.isArray(h.people) ? h.people.length : 0),
        0
      )
      const recalc =
        nextHotels.length === 0
          ? { status: "NEW", times: living.times || {} }
          : recomputeServiceStatus(living, totalPeopleBefore, totalPeopleAfter)
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

      await logPassengerRequestAction({
        context,
        action: "remove_passenger_request_hotel",
        description: `Гостиница удалена из ФАП: ${removedHotel?.name || "без названия"}`,
        fulldescription: `Пользователь ${getSubjectName(context)} удалил гостиницу ${removedHotel?.name || "без названия"} из ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id,
        emailExtras: { hotelName: removedHotel?.name }
      })

      publishPassengerRequestUpdated(passengerRequest)

      await notifyPassengerRequestSite({
        action: "update_hotel_chess_passenger_request",
        passengerRequestId: passengerRequest.id,
        airlineId: passengerRequest.airlineId,
        hotelId: removedHotel?.hotelId || undefined,
        descriptionHtml: `В ФАП <span style='color:#545873'>${passengerRequest.flightNumber}</span> удалена гостиница <span style='color:#545873'>${removedHotel?.name || "без названия"}</span>`,
        __typename: "PassengerRequestUpdatedNotification"
      })

      return passengerRequest
    },

    // обновить редактируемые поля отеля (name / peopleCount / address / link / hotelId)
    // itemId, people, accommodationChesses, linkCRM/linkPWA не трогаем — сохраняем как есть
    updatePassengerRequestHotel: async (
      _,
      { requestId, hotelIndex, hotel },
      context
    ) => {
      const existing = await loadRequestOrThrow(requestId)

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

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: {
          livingService: {
            ...living,
            hotels: nextHotels
          }
        }
      })

      await logPassengerRequestAction({
        context,
        action: "update_passenger_request_hotel",
        description: `Гостиница обновлена в ФАП: ${updatedHotel.name || "без названия"}`,
        fulldescription: `Пользователь ${getSubjectName(context)} обновил гостиницу ${updatedHotel.name || "без названия"} в ФАП ${passengerRequest.flightNumber} (мест: ${updatedHotel.peopleCount})`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id,
        emailExtras: { hotelName: updatedHotel.name }
      })

      publishPassengerRequestUpdated(passengerRequest)

      await notifyPassengerRequestSite({
        action: "update_hotel_chess_passenger_request",
        passengerRequestId: passengerRequest.id,
        airlineId: passengerRequest.airlineId,
        hotelId: updatedHotel.hotelId || undefined,
        descriptionHtml: `В ФАП <span style='color:#545873'>${passengerRequest.flightNumber}</span> обновлена гостиница <span style='color:#545873'>${updatedHotel.name || "без названия"}</span>`,
        __typename: "PassengerRequestUpdatedNotification"
      })

      return passengerRequest
    },

    addPassengerRequestHotelPerson: async (
      _,
      { requestId, hotelIndex, person },
      context
    ) => {
      const existing = await loadRequestOrThrow(requestId)
      const personWithId = ensurePersonId(person)

      const living = existing.livingService || emptyLivingService()
      const hotels = living.hotels || []
      assertIndex(hotelIndex, hotels.length, "hotelIndex")
      // Порог перебора считаем по КОНКРЕТНОЙ гостинице: totalPeopleBefore/After ниже
      // считаются по всей услуге и для этого не годятся.
      const overbookHotel = hotels[hotelIndex] || {}
      const overbookCapacity = Number(overbookHotel.peopleCount) || 0
      const overbookPlacedBefore = (overbookHotel.people || []).length
      const overbookPlacedAfter = overbookPlacedBefore + 1
      if (
        context.subjectType === "EXTERNAL_USER" &&
        context.subject?.scope === "HOTEL" &&
        context.subject?.hotelId
      ) {
        const targetHotel = hotels[hotelIndex]
        if (!targetHotel || targetHotel.hotelId !== context.subject.hotelId) {
          throw new GraphQLError(
            "Access forbidden: you can only add bookings to your hotel.",
            { extensions: { code: "FORBIDDEN" } }
          )
        }
      }

      const hotelsClone = hotels.map((h, i) => {
        const name = h?.name ?? ""
        return i === hotelIndex
          ? {
              ...h,
              people: [
                ...((h && h.people) || []).map((item) =>
                  ensureHotelPerson(item, i, name)
                ),
                ensureHotelPerson(personWithId, i, name)
              ]
            }
          : {
              ...h,
              people: ((h && h.people) || []).map((item) =>
                ensureHotelPerson(item, i, name)
              )
            }
      })

      const totalPeopleBefore = (living.hotels || []).reduce(
        (sum, h) => sum + (Array.isArray(h.people) ? h.people.length : 0),
        0
      )
      const totalPeopleAfter = (hotelsClone || []).reduce(
        (sum, h) => sum + (Array.isArray(h.people) ? h.people.length : 0),
        0
      )
      const recalc = recomputeServiceStatus(
        living,
        totalPeopleBefore,
        totalPeopleAfter
      )
      const nextStatus = recalc.status
      const nextTimes = recalc.times

      const targetHotelForPerson = hotels[hotelIndex]
      const normalizedHotelPerson = ensureHotelPerson(
        personWithId,
        hotelIndex,
        targetHotelForPerson?.name ?? ""
      )
      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: {
          livingService: {
            ...living,
            hotels: hotelsClone,
            status: nextStatus,
            times: nextTimes
          },
          savedPassengers: upsertSavedPassenger(
            existing?.savedPassengers,
            snapshotFromHotelPerson(normalizedHotelPerson)
          )
        }
      })
      await logPassengerRequestAction({
        context,
        action: "add_passenger_request_hotel_person",
        description: "Пассажир добавлен в гостиницу ФАП",
        fulldescription: `Пользователь ${getSubjectName(context)} добавил пассажира в гостиницу ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
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

      publishPassengerRequestUpdated(passengerRequest)

      // Уведомляем ТОЛЬКО при переходе через порог, иначе каждый следующий гость сверх
      // заявки плодит новую запись.
      if (
        overbookCapacity > 0 &&
        overbookPlacedBefore <= overbookCapacity &&
        overbookPlacedAfter > overbookCapacity
      ) {
        // Уведомление не должно ронять уже совершённое добавление: гость записан,
        // и ошибка на этом шаге заставила бы оператора отсканировать его повторно.
        try {
          await notifyPassengerRequestSite({
            action: "passenger_request_hotel_overbooked",
            passengerRequestId: passengerRequest.id,
            airlineId: passengerRequest.airlineId,
            hotelId: overbookHotel.hotelId || undefined,
            descriptionHtml: `В ФАП <span style='color:#545873'>${passengerRequest.flightNumber}</span> в гостинице <span style='color:#545873'>${overbookHotel.name || "без названия"}</span> заселено <span style='color:#545873'>${overbookPlacedAfter}</span> при <span style='color:#545873'>${overbookCapacity}</span> местах по заявке`,
            __typename: "PassengerRequestUpdatedNotification"
          })
        } catch (error) {
          console.error(`Ошибка уведомления об overbooked ФАП (requestId=${requestId}, hotelIndex=${hotelIndex}):`, error)
        }
      }

      return passengerRequest
    },

    addPassengerRequestHotelPeople: async (
      _,
      { requestId, hotelIndex, people },
      context
    ) => {
      if (!Array.isArray(people) || people.length === 0) {
        throw new GraphQLError("people must be a non-empty array")
      }
      const existing = await loadRequestOrThrow(requestId)
      const peopleWithId = people.map(ensurePersonId)

      const living = existing.livingService || emptyLivingService()
      const hotels = living.hotels || []
      assertIndex(hotelIndex, hotels.length, "hotelIndex")
      const overbookHotel = hotels[hotelIndex] || {}
      const overbookCapacity = Number(overbookHotel.peopleCount) || 0
      const overbookPlacedBefore = (overbookHotel.people || []).length
      const overbookPlacedAfter = overbookPlacedBefore + peopleWithId.length
      if (
        context.subjectType === "EXTERNAL_USER" &&
        context.subject?.scope === "HOTEL" &&
        context.subject?.hotelId
      ) {
        const targetHotel = hotels[hotelIndex]
        if (!targetHotel || targetHotel.hotelId !== context.subject.hotelId) {
          throw new GraphQLError(
            "Access forbidden: you can only add bookings to your hotel.",
            { extensions: { code: "FORBIDDEN" } }
          )
        }
      }

      const hotelsClone = hotels.map((h, i) => {
        const name = h?.name ?? ""
        const existingPeople = ((h && h.people) || []).map((item) =>
          ensureHotelPerson(item, i, name)
        )
        if (i !== hotelIndex) {
          return { ...h, people: existingPeople }
        }
        const added = peopleWithId.map((p) => ensureHotelPerson(p, i, name))
        return { ...h, people: [...existingPeople, ...added] }
      })

      const totalPeopleBefore = (living.hotels || []).reduce(
        (sum, h) => sum + (Array.isArray(h.people) ? h.people.length : 0),
        0
      )
      const totalPeopleAfter = hotelsClone.reduce(
        (sum, h) => sum + (Array.isArray(h.people) ? h.people.length : 0),
        0
      )
      const recalc = recomputeServiceStatus(
        living,
        totalPeopleBefore,
        totalPeopleAfter
      )
      const nextStatus = recalc.status
      const nextTimes = recalc.times

      let savedPassengers = existing.savedPassengers
      for (const p of peopleWithId) {
        savedPassengers = upsertSavedPassenger(
          savedPassengers,
          snapshotFromHotelPerson(
            ensureHotelPerson(p, hotelIndex, hotels[hotelIndex]?.name ?? "")
          )
        )
      }

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: {
          livingService: {
            ...living,
            hotels: hotelsClone,
            status: nextStatus,
            times: nextTimes
          },
          savedPassengers
        }
      })
      await logPassengerRequestAction({
        context,
        action: "add_passenger_request_hotel_people",
        description: `Пакетно добавлены пассажиры в гостиницу ФАП (${people.length})`,
        fulldescription: `Пользователь ${getSubjectName(context)} добавил ${people.length} пассажиров в гостиницу ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
      })

      publishPassengerRequestUpdated(passengerRequest)

      // Уведомляем ТОЛЬКО при переходе через порог, иначе каждый следующий гость сверх
      // заявки плодит новую запись.
      if (
        overbookCapacity > 0 &&
        overbookPlacedBefore <= overbookCapacity &&
        overbookPlacedAfter > overbookCapacity
      ) {
        // Уведомление не должно ронять уже совершённое добавление: гости записаны,
        // и ошибка на этом шаге заставила бы оператора отсканировать их повторно.
        try {
          await notifyPassengerRequestSite({
            action: "passenger_request_hotel_overbooked",
            passengerRequestId: passengerRequest.id,
            airlineId: passengerRequest.airlineId,
            hotelId: overbookHotel.hotelId || undefined,
            descriptionHtml: `В ФАП <span style='color:#545873'>${passengerRequest.flightNumber}</span> в гостинице <span style='color:#545873'>${overbookHotel.name || "без названия"}</span> заселено <span style='color:#545873'>${overbookPlacedAfter}</span> при <span style='color:#545873'>${overbookCapacity}</span> местах по заявке`,
            __typename: "PassengerRequestUpdatedNotification"
          })
        } catch (error) {
          console.error(`Ошибка уведомления об overbooked ФАП (requestId=${requestId}, hotelIndex=${hotelIndex}):`, error)
        }
      }

      return passengerRequest
    },

    updatePassengerRequestHotelPerson: async (
      _,
      { requestId, hotelIndex, personIndex, person },
      context
    ) => {
      const existing = await loadRequestOrThrow(requestId)

      const living = existing.livingService || emptyLivingService()
      const hotels = living.hotels || []
      assertIndex(hotelIndex, hotels.length, "hotelIndex")
      const people = hotels[hotelIndex].people || []
      assertIndex(personIndex, people.length, "personIndex")

      const hotelsClone = hotels.map((h, i) => {
        if (i !== hotelIndex) {
          return {
            ...h,
            people: (h.people || []).map((item) =>
              ensureHotelPerson(item, i, h.name)
            )
          }
        }
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
        return { ...h, people: newPeople }
      })

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: {
          livingService: {
            ...living,
            hotels: hotelsClone
          },
          savedPassengers: patchSavedPersonIdentity(
            existing.savedPassengers,
            hotelsClone[hotelIndex].people[personIndex]
          )
        }
      })
      await logPassengerRequestAction({
        context,
        action: "update_passenger_request_hotel_person",
        description: "Данные пассажира в гостинице ФАП обновлены",
        fulldescription: `Пользователь ${getSubjectName(context)} обновил данные пассажира в гостинице ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
      })

      publishPassengerRequestUpdated(passengerRequest)

      return passengerRequest
    },

    assignPassengerRequestHotelRoom: async (
      _,
      { requestId, hotelIndex, personIndexes, roomNumber },
      context
    ) => {
      const existing = await loadRequestOrThrow(requestId)

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

      const hotelsClone = hotels.map((h, i) => {
        if (i !== hotelIndex) {
          return {
            ...h,
            people: (h.people || []).map((item) =>
              ensureHotelPerson(item, i, h.name)
            )
          }
        }
        return {
          ...h,
          people: (h.people || []).map((item, personIndex) => {
            const normalized = ensureHotelPerson(item, i, h.name)
            // Меняем ОДНО поле у существующего объекта: остальные (arrival,
            // departure, roomCategory, roomKind…) остаются нетронутыми.
            return target.has(personIndex)
              ? { ...normalized, roomNumber: room }
              : normalized
          })
        }
      })

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: {
          livingService: {
            ...living,
            hotels: hotelsClone
          }
        }
      })

      await logPassengerRequestAction({
        context,
        action: "assign_passenger_request_hotel_room",
        description: "Присвоен номер комнаты в гостинице ФАП",
        fulldescription: `Пользователь ${getSubjectName(context)} присвоил номер «${room ?? "—"}» гостям (${indexes.length}) в гостинице ${hotels[hotelIndex]?.name || "без названия"} ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id
      })

      publishPassengerRequestUpdated(passengerRequest)

      return passengerRequest
    },

    removePassengerRequestHotelPerson: async (
      _,
      { requestId, hotelIndex, personIndex },
      context
    ) => {
      const existing = await loadRequestOrThrow(requestId)

      const living = existing.livingService || emptyLivingService()
      const hotels = living.hotels || []
      assertIndex(hotelIndex, hotels.length, "hotelIndex")
      const people = hotels[hotelIndex].people || []
      assertIndex(personIndex, people.length, "personIndex")

      const hotelsClone = hotels.map((h, i) => {
        if (i !== hotelIndex) {
          return {
            ...h,
            people: (h.people || []).map((item) =>
              ensureHotelPerson(item, i, h.name)
            )
          }
        }
        const newPeople = [...(h.people || [])]
        newPeople.splice(personIndex, 1)
        return {
          ...h,
          people: newPeople.map((item) => ensureHotelPerson(item, i, h.name))
        }
      })

      const totalPeopleBefore = (hotels || []).reduce(
        (sum, h) => sum + (Array.isArray(h.people) ? h.people.length : 0),
        0
      )
      const totalPeopleAfter = hotelsClone.reduce(
        (sum, h) => sum + (Array.isArray(h.people) ? h.people.length : 0),
        0
      )
      const recalc = recomputeServiceStatus(
        living,
        totalPeopleBefore,
        totalPeopleAfter
      )

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: {
          livingService: {
            ...living,
            hotels: hotelsClone,
            status: recalc.status,
            times: recalc.times
          }
        }
      })
      await logPassengerRequestAction({
        context,
        action: "remove_passenger_request_hotel_person",
        description: "Пассажир удалён из гостиницы ФАП",
        fulldescription: `Пользователь ${getSubjectName(context)} удалил пассажира из гостиницы ФАП ${passengerRequest.flightNumber}`,
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

// Переселение и выселение пассажиров: одиночные и пакетные операции.

import { prisma } from "../../prisma.js"
import { GraphQLError } from "graphql"
import {
  normalizeBulkIndexes,
  spliceAtIndexes
} from "../../services/passengerRequest/bulkHotelPeople.js"
import { ensureHotelPerson } from "../../services/passengerRequest/normalizers.js"
import {
  assertIndex,
  assertReason,
  emptyLivingService,
  getSubjectName,
  loadRequestOrThrow,
  publishPassengerRequestUpdated
} from "../../services/passengerRequest/envelope.js"
import { recomputeServiceStatus } from "../../services/passengerRequest/serviceStatus.js"
import { logPassengerRequestAction } from "../../services/passengerRequest/logging.js"
import { notifyPassengerRequestSite } from "../../services/passengerRequest/notify.js"

export default {
  Mutation: {
    relocatePassengerRequestHotelPerson: async (
      _,
      { requestId, fromHotelIndex, toHotelIndex, personIndex, reason, movedAt },
      context
    ) => {
      const existing = await loadRequestOrThrow(requestId)
      const cleanReason = assertReason(reason)

      const living = existing.livingService || emptyLivingService()
      const hotels = living.hotels || []
      assertIndex(fromHotelIndex, hotels.length, "fromHotelIndex")
      assertIndex(toHotelIndex, hotels.length, "toHotelIndex")
      if (fromHotelIndex === toHotelIndex) {
        throw new GraphQLError(
          "fromHotelIndex and toHotelIndex must be different"
        )
      }

      const sourcePeople = hotels[fromHotelIndex].people || []
      assertIndex(personIndex, sourcePeople.length, "personIndex")

      const relocationDate = movedAt ? new Date(movedAt) : new Date()
      const sourceHotel = hotels[fromHotelIndex]
      const targetHotel = hotels[toHotelIndex]

      // Лимит вместимости при переселении снят сознательно: фактическое заселение
      // может превышать заказ, и перебор надо иметь возможность перераспределить
      // между гостиницами, а не только выселять.
      const person = ensureHotelPerson(
        sourcePeople[personIndex],
        fromHotelIndex,
        sourceHotel?.name
      )

      const chesses = [...(person.accommodationChesses || [])]

      const openIndex = [...chesses].reverse().findIndex((item) => !item?.endAt)
      if (openIndex !== -1) {
        const idx = chesses.length - 1 - openIndex
        chesses[idx] = {
          ...chesses[idx],
          endAt: relocationDate
        }
      }
      chesses.push({
        hotelIndex: toHotelIndex,
        hotelName: targetHotel?.name || null,
        startAt: relocationDate,
        endAt: null,
        reason: cleanReason
      })

      const movedPerson = {
        ...person,
        accommodationChesses: chesses
      }

      const hotelsClone = hotels.map((hotel, index) => {
        const people = (hotel.people || []).map((item) =>
          ensureHotelPerson(item, index, hotel.name)
        )
        if (index === fromHotelIndex) {
          const next = [...people]
          next.splice(personIndex, 1)
          return { ...hotel, people: next }
        }
        if (index === toHotelIndex) {
          return { ...hotel, people: [...people, movedPerson] }
        }
        return { ...hotel, people }
      })

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: {
          livingService: {
            ...living,
            evictions: living.evictions || [],
            hotels: hotelsClone
          }
        }
      })
      await logPassengerRequestAction({
        context,
        action: "relocate_passenger_request_hotel_person",
        reason: cleanReason,
        description: "Пассажир переселён между гостиницами ФАП",
        fulldescription: `Пользователь ${getSubjectName(context)} переселил пассажира в ФАП ${passengerRequest.flightNumber} из гостиницы ${sourceHotel?.name || "без названия"} в ${targetHotel?.name || "без названия"}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id,
        emailExtras: {
          hotelName: targetHotel?.name,
          personName: person?.fullName
        }
      })

      publishPassengerRequestUpdated(passengerRequest)

      await notifyPassengerRequestSite({
        action: "update_hotel_chess_passenger_request",
        passengerRequestId: passengerRequest.id,
        airlineId: passengerRequest.airlineId,
        hotelId: targetHotel?.hotelId || undefined,
        descriptionHtml: `В ФАП <span style='color:#545873'>${passengerRequest.flightNumber}</span> пассажир переселён: <span style='color:#545873'>${sourceHotel?.name || "без названия"}</span> → <span style='color:#545873'>${targetHotel?.name || "без названия"}</span>`,
        __typename: "PassengerRequestUpdatedNotification"
      })

      return passengerRequest
    },

    relocatePassengerRequestHotelPeople: async (
      _,
      { requestId, fromHotelIndex, toHotelIndex, personIndexes, reason, movedAt },
      context
    ) => {
      const existing = await loadRequestOrThrow(requestId)
      const cleanReason = assertReason(reason)

      const living = existing.livingService || emptyLivingService()
      const hotels = living.hotels || []
      assertIndex(fromHotelIndex, hotels.length, "fromHotelIndex")
      assertIndex(toHotelIndex, hotels.length, "toHotelIndex")
      if (fromHotelIndex === toHotelIndex) {
        throw new GraphQLError(
          "fromHotelIndex and toHotelIndex must be different"
        )
      }

      const sourceHotel = hotels[fromHotelIndex]
      const targetHotel = hotels[toHotelIndex]
      const sourcePeople = sourceHotel.people || []

      const indexes = normalizeBulkIndexes(personIndexes)
      if (indexes.length === 0) {
        throw new GraphQLError("Не выбран ни один пассажир")
      }
      for (const idx of indexes) {
        assertIndex(idx, sourcePeople.length, "personIndex")
      }

      // Лимит вместимости при переселении снят сознательно: фактическое заселение
      // может превышать заказ, и перебор надо иметь возможность перераспределить
      // между гостиницами, а не только выселять.

      const relocationDate = movedAt ? new Date(movedAt) : new Date()
      const { next: nextSource, removed } = spliceAtIndexes(sourcePeople, indexes)

      const moved = removed.map((raw) => {
        const person = ensureHotelPerson(raw, fromHotelIndex, sourceHotel?.name)
        const chesses = [...(person.accommodationChesses || [])]
        const openIndex = [...chesses].reverse().findIndex((item) => !item?.endAt)
        if (openIndex !== -1) {
          const idx = chesses.length - 1 - openIndex
          chesses[idx] = { ...chesses[idx], endAt: relocationDate }
        }
        chesses.push({
          hotelIndex: toHotelIndex,
          hotelName: targetHotel?.name || null,
          startAt: relocationDate,
          endAt: null,
          reason: cleanReason
        })
        return { ...person, accommodationChesses: chesses }
      })

      const hotelsClone = hotels.map((hotel, index) => {
        const peopleMapped = (hotel.people || []).map((item) =>
          ensureHotelPerson(item, index, hotel.name)
        )
        if (index === fromHotelIndex) {
          return {
            ...hotel,
            people: nextSource.map((item) =>
              ensureHotelPerson(item, index, hotel.name)
            )
          }
        }
        if (index === toHotelIndex) {
          return { ...hotel, people: [...peopleMapped, ...moved] }
        }
        return { ...hotel, people: peopleMapped }
      })

      const passengerRequest = await prisma.passengerRequest.update({
        where: { id: requestId },
        data: {
          livingService: {
            ...living,
            evictions: living.evictions || [],
            hotels: hotelsClone
          }
        }
      })

      await logPassengerRequestAction({
        context,
        action: "relocate_passenger_request_hotel_people",
        reason: cleanReason,
        description: "Массовое переселение между гостиницами ФАП",
        fulldescription: `Пользователь ${getSubjectName(context)} переселил пассажиров (${moved.length}) в ФАП ${passengerRequest.flightNumber} из гостиницы ${sourceHotel?.name || "без названия"} в ${targetHotel?.name || "без названия"}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id,
        emailExtras: {
          hotelName: targetHotel?.name,
          personName: moved.map((p) => p?.fullName).join(", ")
        }
      })

      publishPassengerRequestUpdated(passengerRequest)

      await notifyPassengerRequestSite({
        action: "update_hotel_chess_passenger_request",
        passengerRequestId: passengerRequest.id,
        airlineId: passengerRequest.airlineId,
        hotelId: targetHotel?.hotelId || undefined,
        descriptionHtml: `В ФАП <span style='color:#545873'>${passengerRequest.flightNumber}</span> переселено пассажиров: <span style='color:#545873'>${moved.length}</span>. <span style='color:#545873'>${sourceHotel?.name || "без названия"}</span> → <span style='color:#545873'>${targetHotel?.name || "без названия"}</span>`,
        __typename: "PassengerRequestUpdatedNotification"
      })

      return passengerRequest
    },

    evictPassengerRequestHotelPerson: async (
      _,
      { requestId, hotelIndex, personIndex, reason, evictedAt },
      context
    ) => {
      const existing = await loadRequestOrThrow(requestId)
      const cleanReason = assertReason(reason)

      const living = existing.livingService || emptyLivingService()
      const hotels = living.hotels || []
      assertIndex(hotelIndex, hotels.length, "hotelIndex")
      const people = hotels[hotelIndex].people || []
      assertIndex(personIndex, people.length, "personIndex")

      const evictionDate = evictedAt ? new Date(evictedAt) : new Date()
      const hotel = hotels[hotelIndex]
      const person = ensureHotelPerson(
        people[personIndex],
        hotelIndex,
        hotel?.name
      )

      const chesses = [...(person.accommodationChesses || [])]
      const openIndex = [...chesses].reverse().findIndex((item) => !item?.endAt)
      if (openIndex !== -1) {
        const idx = chesses.length - 1 - openIndex
        chesses[idx] = {
          ...chesses[idx],
          endAt: evictionDate,
          reason: cleanReason
        }
      } else {
        chesses.push({
          hotelIndex,
          hotelName: hotel?.name || null,
          startAt: evictionDate,
          endAt: evictionDate,
          reason: cleanReason
        })
      }

      const hotelsClone = hotels.map((item, index) => {
        if (index !== hotelIndex) {
          return {
            ...item,
            people: (item.people || []).map((p) =>
              ensureHotelPerson(p, index, item.name)
            )
          }
        }
        const nextPeople = [...(item.people || [])]
        nextPeople.splice(personIndex, 1)
        return {
          ...item,
          people: nextPeople.map((p) => ensureHotelPerson(p, index, item.name))
        }
      })

      const evictions = [
        ...(living.evictions || []),
        {
          person: {
            ...person,
            accommodationChesses: chesses
          },
          hotelIndex,
          hotelName: hotel?.name || null,
          reason: cleanReason,
          evictedAt: evictionDate
        }
      ]

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
            evictions,
            status: recalc.status,
            times: recalc.times
          }
        }
      })
      await logPassengerRequestAction({
        context,
        action: "evict_passenger_request_hotel_person",
        reason: cleanReason,
        description: "Пассажир выселен из гостиницы ФАП",
        fulldescription: `Пользователь ${getSubjectName(context)} выселил пассажира из гостиницы ${hotel?.name || "без названия"} в ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id,
        emailExtras: {
          hotelName: hotel?.name,
          personName: person?.fullName
        }
      })

      publishPassengerRequestUpdated(passengerRequest)

      await notifyPassengerRequestSite({
        action: "update_hotel_chess_passenger_request",
        passengerRequestId: passengerRequest.id,
        airlineId: passengerRequest.airlineId,
        hotelId: hotel?.hotelId || undefined,
        descriptionHtml: `В ФАП <span style='color:#545873'>${passengerRequest.flightNumber}</span> пассажир выселен из гостиницы <span style='color:#545873'>${hotel?.name ?? "без названия"}</span>`,
        __typename: "PassengerRequestUpdatedNotification"
      })

      return passengerRequest
    },

    evictPassengerRequestHotelPeople: async (
      _,
      { requestId, hotelIndex, personIndexes, reason, evictedAt },
      context
    ) => {
      const existing = await loadRequestOrThrow(requestId)
      const cleanReason = assertReason(reason)

      const living = existing.livingService || emptyLivingService()
      const hotels = living.hotels || []
      assertIndex(hotelIndex, hotels.length, "hotelIndex")
      const hotel = hotels[hotelIndex]
      const people = hotel.people || []

      // Валидация ДО изменений: пачка применяется целиком либо не применяется вовсе.
      const indexes = normalizeBulkIndexes(personIndexes)
      if (indexes.length === 0) {
        throw new GraphQLError("Не выбран ни один пассажир")
      }
      for (const idx of indexes) {
        assertIndex(idx, people.length, "personIndex")
      }

      const evictionDate = evictedAt ? new Date(evictedAt) : new Date()
      const { next: nextPeople, removed } = spliceAtIndexes(people, indexes)

      const evicted = removed.map((raw) => {
        const person = ensureHotelPerson(raw, hotelIndex, hotel?.name)
        const chesses = [...(person.accommodationChesses || [])]
        const openIndex = [...chesses].reverse().findIndex((item) => !item?.endAt)
        if (openIndex !== -1) {
          const idx = chesses.length - 1 - openIndex
          chesses[idx] = {
            ...chesses[idx],
            endAt: evictionDate,
            reason: cleanReason
          }
        } else {
          chesses.push({
            hotelIndex,
            hotelName: hotel?.name || null,
            startAt: evictionDate,
            endAt: evictionDate,
            reason: cleanReason
          })
        }
        return {
          person: { ...person, accommodationChesses: chesses },
          hotelIndex,
          hotelName: hotel?.name || null,
          reason: cleanReason,
          evictedAt: evictionDate
        }
      })

      const hotelsClone = hotels.map((item, index) => {
        if (index !== hotelIndex) {
          return {
            ...item,
            people: (item.people || []).map((p) =>
              ensureHotelPerson(p, index, item.name)
            )
          }
        }
        return {
          ...item,
          people: nextPeople.map((p) => ensureHotelPerson(p, index, item.name))
        }
      })

      const evictions = [...(living.evictions || []), ...evicted]

      const totalPeopleBefore = hotels.reduce(
        (sum, h) => sum + (Array.isArray(h.people) ? h.people.length : 0),
        0
      )
      const totalPeopleAfter = hotelsClone.reduce(
        (sum, h) => sum + (Array.isArray(h.people) ? h.people.length : 0),
        0
      )
      // Статус услуги пересчитываем ОДИН раз по итогу всей пачки.
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
            evictions,
            status: recalc.status,
            times: recalc.times
          }
        }
      })

      await logPassengerRequestAction({
        context,
        action: "evict_passenger_request_hotel_people",
        reason: cleanReason,
        description: "Массовое выселение из гостиницы ФАП",
        fulldescription: `Пользователь ${getSubjectName(context)} выселил пассажиров (${evicted.length}) из гостиницы ${hotel?.name || "без названия"} в ФАП ${passengerRequest.flightNumber}`,
        oldData: existing,
        newData: passengerRequest,
        airlineId: passengerRequest.airlineId,
        passengerRequestId: passengerRequest.id,
        emailExtras: {
          hotelName: hotel?.name,
          personName: evicted.map((e) => e.person?.fullName).join(", ")
        }
      })

      publishPassengerRequestUpdated(passengerRequest)

      await notifyPassengerRequestSite({
        action: "update_hotel_chess_passenger_request",
        passengerRequestId: passengerRequest.id,
        airlineId: passengerRequest.airlineId,
        hotelId: hotel?.hotelId || undefined,
        descriptionHtml: `В ФАП <span style='color:#545873'>${passengerRequest.flightNumber}</span> выселено пассажиров: <span style='color:#545873'>${evicted.length}</span>. Гостиница <span style='color:#545873'>${hotel?.name ?? "без названия"}</span>`,
        __typename: "PassengerRequestUpdatedNotification"
      })

      return passengerRequest
    }
  }
}

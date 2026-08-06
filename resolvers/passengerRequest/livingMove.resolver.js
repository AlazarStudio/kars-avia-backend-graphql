// Переселение и выселение пассажиров: одиночные и пакетные операции.

import { GraphQLError } from "graphql"
import {
  normalizeBulkIndexes,
  spliceAtIndexes
} from "../../services/passengerRequest/bulkHotelPeople.js"
import { ensureHotelPerson } from "../../services/passengerRequest/normalizers.js"
import { closeOpenChess } from "../../services/passengerRequest/chessHelpers.js"
import {
  assertIndex,
  assertMoment,
  assertReason,
  emptyLivingService,
  getSubjectName,
  withPassengerRequest
} from "../../services/passengerRequest/envelope.js"
import { recomputeServiceStatus } from "../../services/passengerRequest/serviceStatus.js"

export default {
  Mutation: {
    relocatePassengerRequestHotelPerson: async (
      _,
      { requestId, fromHotelIndex, toHotelIndex, personIndex, reason, movedAt },
      context
    ) =>
      withPassengerRequest({
        requestId,
        context,
        apply: (existing) => {
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

          const relocationDate = assertMoment(movedAt, "movedAt") ?? new Date()
          const sourceHotel = hotels[fromHotelIndex]
          const targetHotel = hotels[toHotelIndex]

          // Лимит вместимости при переселении снят сознательно: фактическое заселение
          // может превышать заказ, и перебор надо иметь возможность перераспределить
          // между гостиницами, а не только выселять.
          const person = ensureHotelPerson(
            sourcePeople[personIndex],
            fromHotelIndex,
            sourceHotel?.name,
            relocationDate
          )

          const chesses = closeOpenChess(
            person.accommodationChesses,
            relocationDate
          )
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

          return {
            data: {
              livingService: {
                ...living,
                evictions: living.evictions || [],
                hotels: hotelsClone
              }
            },
            unsubmitReports: [fromHotelIndex, toHotelIndex],
            log: (passengerRequest) => ({
              action: "relocate_passenger_request_hotel_person",
              reason: cleanReason,
              description: "Пассажир переселён между гостиницами ФАП",
              fulldescription: `Пользователь ${getSubjectName(context)} переселил пассажира в ФАП ${passengerRequest.flightNumber} из гостиницы ${sourceHotel?.name || "без названия"} в ${targetHotel?.name || "без названия"}`,
              airlineId: passengerRequest.airlineId,
              passengerRequestId: passengerRequest.id,
              emailExtras: {
                hotelName: targetHotel?.name,
                personName: person?.fullName
              }
            }),
            notify: (passengerRequest) => ({
              action: "update_hotel_chess_passenger_request",
              passengerRequestId: passengerRequest.id,
              airlineId: passengerRequest.airlineId,
              hotelId: targetHotel?.hotelId || undefined,
              descriptionHtml: `В ФАП <span style='color:#545873'>${passengerRequest.flightNumber}</span> пассажир переселён: <span style='color:#545873'>${sourceHotel?.name || "без названия"}</span> → <span style='color:#545873'>${targetHotel?.name || "без названия"}</span>`,
              __typename: "PassengerRequestUpdatedNotification"
            })
          }
        }
      }),

    relocatePassengerRequestHotelPeople: async (
      _,
      { requestId, fromHotelIndex, toHotelIndex, personIndexes, reason, movedAt },
      context
    ) =>
      withPassengerRequest({
        requestId,
        context,
        apply: (existing) => {
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

          const relocationDate = assertMoment(movedAt, "movedAt") ?? new Date()
          const { next: nextSource, removed } = spliceAtIndexes(
            sourcePeople,
            indexes
          )

          const moved = removed.map((raw) => {
            const person = ensureHotelPerson(
              raw,
              fromHotelIndex,
              sourceHotel?.name,
              relocationDate
            )
            const chesses = closeOpenChess(
              person.accommodationChesses,
              relocationDate
            )
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

          return {
            data: {
              livingService: {
                ...living,
                evictions: living.evictions || [],
                hotels: hotelsClone
              }
            },
            unsubmitReports: [fromHotelIndex, toHotelIndex],
            log: (passengerRequest) => ({
              action: "relocate_passenger_request_hotel_people",
              reason: cleanReason,
              description: "Массовое переселение между гостиницами ФАП",
              fulldescription: `Пользователь ${getSubjectName(context)} переселил пассажиров (${moved.length}) в ФАП ${passengerRequest.flightNumber} из гостиницы ${sourceHotel?.name || "без названия"} в ${targetHotel?.name || "без названия"}`,
              airlineId: passengerRequest.airlineId,
              passengerRequestId: passengerRequest.id,
              emailExtras: {
                hotelName: targetHotel?.name,
                personName: moved.map((p) => p?.fullName).join(", ")
              }
            }),
            notify: (passengerRequest) => ({
              action: "update_hotel_chess_passenger_request",
              passengerRequestId: passengerRequest.id,
              airlineId: passengerRequest.airlineId,
              hotelId: targetHotel?.hotelId || undefined,
              descriptionHtml: `В ФАП <span style='color:#545873'>${passengerRequest.flightNumber}</span> переселено пассажиров: <span style='color:#545873'>${moved.length}</span>. <span style='color:#545873'>${sourceHotel?.name || "без названия"}</span> → <span style='color:#545873'>${targetHotel?.name || "без названия"}</span>`,
              __typename: "PassengerRequestUpdatedNotification"
            })
          }
        }
      }),

    evictPassengerRequestHotelPerson: async (
      _,
      { requestId, hotelIndex, personIndex, reason, evictedAt },
      context
    ) =>
      withPassengerRequest({
        requestId,
        context,
        apply: (existing) => {
          const cleanReason = assertReason(reason)

          const living = existing.livingService || emptyLivingService()
          const hotels = living.hotels || []
          assertIndex(hotelIndex, hotels.length, "hotelIndex")
          const people = hotels[hotelIndex].people || []
          assertIndex(personIndex, people.length, "personIndex")

          const evictionDate = assertMoment(evictedAt, "evictedAt") ?? new Date()
          const hotel = hotels[hotelIndex]
          const person = ensureHotelPerson(
            people[personIndex],
            hotelIndex,
            hotel?.name,
            evictionDate
          )

          const chesses = closeOpenChess(
            person.accommodationChesses,
            evictionDate,
            {
              reason: cleanReason,
              degenerate: { hotelIndex, hotelName: hotel?.name || null }
            }
          )

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
              people: nextPeople.map((p) =>
                ensureHotelPerson(p, index, item.name)
              )
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

          return {
            data: {
              livingService: {
                ...living,
                hotels: hotelsClone,
                evictions,
                status: recalc.status,
                times: recalc.times
              }
            },
            unsubmitReports: [hotelIndex],
            log: (passengerRequest) => ({
              action: "evict_passenger_request_hotel_person",
              reason: cleanReason,
              description: "Пассажир выселен из гостиницы ФАП",
              fulldescription: `Пользователь ${getSubjectName(context)} выселил пассажира из гостиницы ${hotel?.name || "без названия"} в ФАП ${passengerRequest.flightNumber}`,
              airlineId: passengerRequest.airlineId,
              passengerRequestId: passengerRequest.id,
              emailExtras: {
                hotelName: hotel?.name,
                personName: person?.fullName
              }
            }),
            notify: (passengerRequest) => ({
              action: "update_hotel_chess_passenger_request",
              passengerRequestId: passengerRequest.id,
              airlineId: passengerRequest.airlineId,
              hotelId: hotel?.hotelId || undefined,
              descriptionHtml: `В ФАП <span style='color:#545873'>${passengerRequest.flightNumber}</span> пассажир выселен из гостиницы <span style='color:#545873'>${hotel?.name ?? "без названия"}</span>`,
              __typename: "PassengerRequestUpdatedNotification"
            })
          }
        }
      }),

    evictPassengerRequestHotelPeople: async (
      _,
      { requestId, hotelIndex, personIndexes, reason, evictedAt },
      context
    ) =>
      withPassengerRequest({
        requestId,
        context,
        apply: (existing) => {
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

          const evictionDate = assertMoment(evictedAt, "evictedAt") ?? new Date()
          const { next: nextPeople, removed } = spliceAtIndexes(people, indexes)

          const evicted = removed.map((raw) => {
            const person = ensureHotelPerson(
              raw,
              hotelIndex,
              hotel?.name,
              evictionDate
            )
            const chesses = closeOpenChess(
              person.accommodationChesses,
              evictionDate,
              {
                reason: cleanReason,
                degenerate: { hotelIndex, hotelName: hotel?.name || null }
              }
            )
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
              people: nextPeople.map((p) =>
                ensureHotelPerson(p, index, item.name)
              )
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

          return {
            data: {
              livingService: {
                ...living,
                hotels: hotelsClone,
                evictions,
                status: recalc.status,
                times: recalc.times
              }
            },
            unsubmitReports: [hotelIndex],
            log: (passengerRequest) => ({
              action: "evict_passenger_request_hotel_people",
              reason: cleanReason,
              description: "Массовое выселение из гостиницы ФАП",
              fulldescription: `Пользователь ${getSubjectName(context)} выселил пассажиров (${evicted.length}) из гостиницы ${hotel?.name || "без названия"} в ФАП ${passengerRequest.flightNumber}`,
              airlineId: passengerRequest.airlineId,
              passengerRequestId: passengerRequest.id,
              emailExtras: {
                hotelName: hotel?.name,
                personName: evicted.map((e) => e.person?.fullName).join(", ")
              }
            }),
            notify: (passengerRequest) => ({
              action: "update_hotel_chess_passenger_request",
              passengerRequestId: passengerRequest.id,
              airlineId: passengerRequest.airlineId,
              hotelId: hotel?.hotelId || undefined,
              descriptionHtml: `В ФАП <span style='color:#545873'>${passengerRequest.flightNumber}</span> выселено пассажиров: <span style='color:#545873'>${evicted.length}</span>. Гостиница <span style='color:#545873'>${hotel?.name ?? "без названия"}</span>`,
              __typename: "PassengerRequestUpdatedNotification"
            })
          }
        }
      })
  }
}

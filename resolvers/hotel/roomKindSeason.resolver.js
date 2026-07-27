import { prisma } from "../../prisma.js"
import {
  hotelModerMiddleware,
  allMiddleware
} from "../../middlewares/authMiddleware.js"
import { rethrowUnlessInternalError } from "../../services/infra/mutationError.js"
import {
  assertNoSeasonOverlap,
  assertValidSeasonRange
} from "../../services/hotel/roomKindSeasonPrice.js"
import { recalculateNonArchivedForRoomKindPeriod } from "../../services/request/requestPricing.js"

const loadSeasonsForRoomKind = async (roomKindId) =>
  prisma.roomKindSeason.findMany({
    where: { roomKindId },
    orderBy: { startDate: "asc" }
  })

const roomKindSeasonResolver = {
  Query: {
    roomKindSeasons: async (_, { roomKindId }, context) => {
      await allMiddleware(context)
      return loadSeasonsForRoomKind(roomKindId)
    }
  },

  Mutation: {
    createRoomKindSeason: async (_, { input }, context) => {
      try {
        await hotelModerMiddleware(context)

        const roomKind = await prisma.roomKind.findUnique({
          where: { id: input.roomKindId }
        })
        if (!roomKind) throw new Error("RoomKind не найден")

        const { start, end } = assertValidSeasonRange(
          input.startDate,
          input.endDate
        )
        const existing = await loadSeasonsForRoomKind(input.roomKindId)
        assertNoSeasonOverlap(existing, start, end)

        const created = await prisma.roomKindSeason.create({
          data: {
            roomKindId: input.roomKindId,
            name: input.name ?? null,
            startDate: start,
            endDate: end,
            price: input.price,
            priceForAirline:
              input.priceForAirline != null ? input.priceForAirline : null
          }
        })

        await recalculateNonArchivedForRoomKindPeriod(
          input.roomKindId,
          start,
          end
        )

        return created
      } catch (error) {
        rethrowUnlessInternalError(error)
      }
    },

    updateRoomKindSeason: async (_, { id, input }, context) => {
      try {
        await hotelModerMiddleware(context)

        const existingSeason = await prisma.roomKindSeason.findUnique({
          where: { id }
        })
        if (!existingSeason) throw new Error("Сезон не найден")

        const nextStart = input.startDate ?? existingSeason.startDate
        const nextEnd = input.endDate ?? existingSeason.endDate
        const { start, end } = assertValidSeasonRange(nextStart, nextEnd)

        const siblings = await loadSeasonsForRoomKind(existingSeason.roomKindId)
        assertNoSeasonOverlap(siblings, start, end, id)

        const updated = await prisma.roomKindSeason.update({
          where: { id },
          data: {
            ...(input.name !== undefined && { name: input.name }),
            startDate: start,
            endDate: end,
            ...(input.price !== undefined && { price: input.price }),
            ...(input.priceForAirline !== undefined && {
              priceForAirline: input.priceForAirline
            })
          }
        })

        // Пересчёт по объединённому старому и новому периоду
        const recalcStart =
          existingSeason.startDate < start ? existingSeason.startDate : start
        const recalcEnd =
          existingSeason.endDate > end ? existingSeason.endDate : end

        await recalculateNonArchivedForRoomKindPeriod(
          existingSeason.roomKindId,
          recalcStart,
          recalcEnd
        )

        return updated
      } catch (error) {
        rethrowUnlessInternalError(error)
      }
    },

    deleteRoomKindSeason: async (_, { id }, context) => {
      try {
        await hotelModerMiddleware(context)

        const existingSeason = await prisma.roomKindSeason.findUnique({
          where: { id }
        })
        if (!existingSeason) throw new Error("Сезон не найден")

        await prisma.roomKindSeason.delete({ where: { id } })

        await recalculateNonArchivedForRoomKindPeriod(
          existingSeason.roomKindId,
          existingSeason.startDate,
          existingSeason.endDate
        )

        return true
      } catch (error) {
        rethrowUnlessInternalError(error)
      }
    }
  },

  RoomKind: {
    seasons: async (parent) => {
      if (Array.isArray(parent.seasons)) return parent.seasons
      return loadSeasonsForRoomKind(parent.id)
    }
  },

  RoomKindSeason: {
    roomKind: async (parent) => {
      if (parent.roomKind) return parent.roomKind
      return prisma.roomKind.findUnique({ where: { id: parent.roomKindId } })
    }
  }
}

export default roomKindSeasonResolver

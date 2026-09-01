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
import {
  hiddenAirlineFlag,
  hiddenAirlinePrice,
  omitAirlinePriceWrites
} from "../../services/hotel/hideAirlinePrices.js"

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
        const seasonInput = omitAirlinePriceWrites(input, context)

        const roomKind = await prisma.roomKind.findUnique({
          where: { id: seasonInput.roomKindId }
        })
        if (!roomKind) throw new Error("RoomKind не найден")

        const { start, end } = assertValidSeasonRange(
          seasonInput.startDate,
          seasonInput.endDate
        )
        const existing = await loadSeasonsForRoomKind(seasonInput.roomKindId)
        assertNoSeasonOverlap(existing, start, end)

        const created = await prisma.roomKindSeason.create({
          data: {
            roomKindId: seasonInput.roomKindId,
            name: seasonInput.name ?? null,
            startDate: start,
            endDate: end,
            price: seasonInput.price,
            priceForAirline:
              seasonInput.priceForAirline != null
                ? seasonInput.priceForAirline
                : null,
            priceSingleOccupancy:
              seasonInput.priceSingleOccupancy != null
                ? seasonInput.priceSingleOccupancy
                : null
          }
        })

        await recalculateNonArchivedForRoomKindPeriod(
          seasonInput.roomKindId,
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
        const seasonInput = omitAirlinePriceWrites(input, context)

        const existingSeason = await prisma.roomKindSeason.findUnique({
          where: { id }
        })
        if (!existingSeason) throw new Error("Сезон не найден")

        const nextStart = seasonInput.startDate ?? existingSeason.startDate
        const nextEnd = seasonInput.endDate ?? existingSeason.endDate
        const { start, end } = assertValidSeasonRange(nextStart, nextEnd)

        const siblings = await loadSeasonsForRoomKind(existingSeason.roomKindId)
        assertNoSeasonOverlap(siblings, start, end, id)

        const updated = await prisma.roomKindSeason.update({
          where: { id },
          data: {
            ...(seasonInput.name !== undefined && { name: seasonInput.name }),
            startDate: start,
            endDate: end,
            ...(seasonInput.price !== undefined && { price: seasonInput.price }),
            ...(seasonInput.priceForAirline !== undefined && {
              priceForAirline: seasonInput.priceForAirline
            }),
            ...(seasonInput.priceSingleOccupancy !== undefined && {
              priceSingleOccupancy: seasonInput.priceSingleOccupancy
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
    },
    priceForAirline: (parent, _, context) =>
      hiddenAirlinePrice(parent.priceForAirline, context),
    priceForAirReq: (parent, _, context) =>
      hiddenAirlineFlag(parent.priceForAirReq, context)
  },

  RoomKindSeason: {
    roomKind: async (parent) => {
      if (parent.roomKind) return parent.roomKind
      return prisma.roomKind.findUnique({ where: { id: parent.roomKindId } })
    },
    priceForAirline: (parent, _, context) =>
      hiddenAirlinePrice(parent.priceForAirline, context)
  }
}

export default roomKindSeasonResolver

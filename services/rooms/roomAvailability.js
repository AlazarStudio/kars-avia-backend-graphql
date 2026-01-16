import { prisma } from "../../prisma.js"

const getOverlappingPlaces = async (roomId, start, end, excludeId) => {
  return await prisma.hotelChess.findMany({
    where: {
      roomId,
      start: { lt: end },
      end: { gt: start },
      ...(excludeId ? { id: { not: excludeId } } : {})
    },
    select: { place: true }
  })
}

export const resolveAvailablePlace = async (
  room,
  start,
  end,
  requestedPlace,
  excludeId
) => {
  const overlaps = await getOverlappingPlaces(room.id, start, end, excludeId)

  if (requestedPlace != null) {
    const requested = Number(requestedPlace)
    const occupied = overlaps.some((item) => Number(item.place) === requested)
    if (occupied) {
      throw new Error("Невозможно разместить заявку: выбранное место занято")
    }
    return requested
  }

  const totalPlaces = Math.max(1, Math.floor(Number(room.places) || 1))
  const hasWholeRoomOccupancy = overlaps.some((item) => item.place == null)
  if (hasWholeRoomOccupancy) {
    throw new Error("Невозможно разместить заявку: номер занят")
  }

  const usedPlaces = new Set(
    overlaps
      .map((item) => Number(item.place))
      .filter((value) => Number.isFinite(value) && value > 0)
  )

  for (let place = 1; place <= totalPlaces; place += 1) {
    if (!usedPlaces.has(place)) {
      return place
    }
  }

  throw new Error("Невозможно разместить заявку: свободных мест нет")
}


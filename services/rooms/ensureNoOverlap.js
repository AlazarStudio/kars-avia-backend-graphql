import { prisma } from "../../prisma.js"
import {
  buildHotelChessOverlapWhere,
  normalizePlace
} from "./overlapUtils.js"

const formatOverlapPeriod = (start, end) => {
  const opts = { dateStyle: "short", timeStyle: "short" }
  return `${start.toLocaleString("ru-RU", opts)} – ${end.toLocaleString("ru-RU", opts)}`
}

export const formatOverlapErrorMessage = (overlap) => {
  const requestLabel = overlap.request?.requestNumber
    ? `заявкой №${overlap.request.requestNumber}`
    : "другой записью шахматки"
  const roomName = overlap.room?.name ?? "неизвестный номер"
  const placeLabel =
    overlap.place != null ? String(overlap.place) : "весь номер"
  const period = formatOverlapPeriod(overlap.start, overlap.end)

  return (
    `Невозможно разместить заявку: пересечение с ${requestLabel} ` +
    `в номере «${roomName}», место ${placeLabel} (${period})`
  )
}

const overlapInclude = {
  request: { select: { requestNumber: true } },
  room: { select: { name: true } }
}

export const findHotelChessOverlap = async (
  db,
  { roomId, place, start, end, excludeId }
) => {
  const normalizedPlace = normalizePlace(place)
  return db.hotelChess.findFirst({
    where: buildHotelChessOverlapWhere({
      roomId,
      start,
      end,
      place: normalizedPlace,
      excludeId
    }),
    include: overlapInclude
  })
}

export const ensureNoOverlap = async (
  roomId,
  place,
  newStart,
  newEnd,
  excludeId
) => {
  const overlap = await findHotelChessOverlap(prisma, {
    roomId,
    place,
    start: newStart,
    end: newEnd,
    excludeId
  })

  if (overlap) {
    throw new Error(formatOverlapErrorMessage(overlap))
  }
}

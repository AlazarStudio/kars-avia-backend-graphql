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

export const ensureNoOverlap = async (
  roomId,
  place,
  newStart,
  newEnd,
  excludeId
) => {
  const normalizedPlace = normalizePlace(place)

  const overlap = await prisma.hotelChess.findFirst({
    where: buildHotelChessOverlapWhere({
      roomId,
      start: newStart,
      end: newEnd,
      place: normalizedPlace,
      excludeId
    }),
    include: {
      request: { select: { requestNumber: true } },
      room: { select: { name: true } }
    }
  })

  if (overlap) {
    throw new Error(formatOverlapErrorMessage(overlap))
  }
}

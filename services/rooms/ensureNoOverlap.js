import { prisma } from "../../prisma.js"

export const ensureNoOverlap = async (
  roomId,
  place,
  newStart,
  newEnd,
  excludeId
) => {
  // console.log(
  //   "\n roomId: ",
  //   roomId,
  //   "\n place: ",
  //   place,
  //   "\n newStart: ",
  //   newStart,
  //   "\n newEnd: ",
  //   newEnd,
  //   "\n excludeId: ",
  //   excludeId
  // )
  const overlap = await prisma.hotelChess.findFirst({
    where: {
      roomId,
      place,
      OR: [
        { start: { gte: newStart, lte: newEnd } },
        { end: { gte: newStart, lte: newEnd } }
      ],
      ...(excludeId ? { id: { not: excludeId } } : {})
    }
  })

  if (overlap) {
    console.log(
      `Невозможно разместить заявку: пересечение с заявкой №${overlap.id} ` +
        `в комнате ${roomId}, месте ${place} ` +
        `(${overlap.start.toISOString()} – ${overlap.end.toISOString()})`
    )
    throw new Error(
      `Невозможно разместить заявку: пересечение с заявкой №${overlap.id} ` +
        `в комнате ${roomId}, месте ${place} ` +
        `(${overlap.start.toISOString()} – ${overlap.end.toISOString()})`
    )
  }
}

export const intervalsOverlap = (startA, endA, startB, endB) => {
  const a0 = new Date(startA).getTime()
  const a1 = new Date(endA).getTime()
  const b0 = new Date(startB).getTime()
  const b1 = new Date(endB).getTime()
  return a0 < b1 && a1 > b0
}

export const normalizePlace = (place) => {
  if (place == null) return null
  const n = Number(place)
  return Number.isFinite(n) && n >= 1 ? n : null
}

/**
 * @param {{ roomId: string, start: Date|string, end: Date|string, place?: number|null, excludeId?: string }} params
 * - place задан: конфликт с этим местом или с бронью «весь номер» (place: null)
 * - place не задан: любое пересечение в комнате
 */
export const buildHotelChessOverlapWhere = ({
  roomId,
  start,
  end,
  place,
  excludeId
}) => {
  const startDate = new Date(start)
  const endDate = new Date(end)
  const normalizedPlace = normalizePlace(place)

  const where = {
    roomId,
    start: { lt: endDate },
    end: { gt: startDate },
    ...(excludeId ? { id: { not: excludeId } } : {})
  }

  if (normalizedPlace != null) {
    where.OR = [{ place: normalizedPlace }, { place: null }]
  }

  return where
}

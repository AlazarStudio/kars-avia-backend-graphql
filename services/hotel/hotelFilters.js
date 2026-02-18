export const buildHotelWhere = (filter) => {
  if (!filter) return {}
  const { cityId, stars, usStars } = filter

  const AND = []

  if (cityId) {
    AND.push({
      hotelContract: { some: { cityId } }
    })
  }
  if (stars?.trim()) {
    AND.push({ stars: stars.trim() })
  }
  if (usStars?.trim()) {
    AND.push({ usStars: usStars.trim() })
  }

  return AND.length ? { AND } : {}
}

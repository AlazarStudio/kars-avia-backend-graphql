export const buildHotelWhere = (filter) => {
  if (!filter) return {}
  const { city, stars, usStars } = filter

  const AND = []

  if (city?.trim()) {
    AND.push({
      information: { city: city.trim() }
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

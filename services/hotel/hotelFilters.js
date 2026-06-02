import { prisma } from "../../prisma.js"

export const buildHotelWhere = async (filter) => {
  if (!filter) return {}
  const { cityId, stars, usStars, search } = filter

  const AND = []

  if (cityId) {
    const cityRecord = await prisma.city.findUnique({
      where: { id: cityId },
      select: { city: true }
    })

    const cityOr = [{ hotelContract: { some: { cityId } } }]

    const cityName = cityRecord?.city?.trim()
    if (cityName) {
      cityOr.push({
        information: {
          is: { city: { equals: cityName, mode: "insensitive" } }
        }
      })
    }

    AND.push({ OR: cityOr })
  }
  if (stars?.trim()) {
    AND.push({ stars: stars.trim() })
  }
  if (usStars?.trim()) {
    AND.push({ usStars: usStars.trim() })
  }
  if (search?.trim()) {
    const s = search.trim()
    AND.push({
      OR: [
        { name: { contains: s, mode: "insensitive" } },
        { nameFull: { contains: s, mode: "insensitive" } },
        { information: { is: { city: { contains: s, mode: "insensitive" } } } },
        { location: { is: { city: { contains: s, mode: "insensitive" } } } },
        { location: { is: { region: { contains: s, mode: "insensitive" } } } },
        { airport: { name: { contains: s, mode: "insensitive" } } }
      ]
    })
  }

  return AND.length ? { AND } : {}
}

import { prisma } from "../../prisma.js"

// Рейтинг/звёздность в данных хранятся вперемешку — то с точкой ("4.9"),
// то с запятой ("4,9"). Чтобы фильтр находил оба, сравниваем по обоим вариантам.
const sepVariants = (value) => {
  const t = String(value).trim()
  return [...new Set([t, t.replace(",", "."), t.replace(".", ",")])]
}

export const buildHotelWhere = async (filter) => {
  if (!filter) return {}
  const { cityId, airportId, stars, usStars, search } = filter

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
  if (airportId) {
    AND.push({ airportId })
  }
  if (stars?.trim()) {
    AND.push({ stars: { in: sepVariants(stars) } })
  }
  if (usStars?.trim()) {
    AND.push({ usStars: { in: sepVariants(usStars) } })
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

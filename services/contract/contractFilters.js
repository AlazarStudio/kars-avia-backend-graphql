export const buildAirlineContractWhere = (filter) => {
  if (!filter) return {}
  const { companyId, airlineId, applicationType, dateFrom, dateTo, search } =
    filter

  const AND = []

  if (companyId) AND.push({ companyId })
  if (airlineId) AND.push({ airlineId })
  if (applicationType)
    AND.push({
      applicationType: { contains: applicationType.trim(), mode: "insensitive" }
    })
  if (dateFrom || dateTo) {
    AND.push({
      date: {
        gte: dateFrom ?? undefined,
        lte: dateTo ?? undefined
      }
    })
  }
  if (search && search.trim()) {
    const s = search.trim()
    AND.push({
      OR: [
        { contractNumber: { contains: s, mode: "insensitive" } },
        { region: { contains: s, mode: "insensitive" } },
        { applicationType: { contains: s, mode: "insensitive" } },
        { notes: { contains: s, mode: "insensitive" } },
        { airline: { name: { contains: s, mode: "insensitive" } } },
        { company: { name: { contains: s, mode: "insensitive" } } }
      ]
    })
  }

  return AND.length ? { AND } : {}
}

export const buildHotelContractWhere = (filter) => {
  if (!filter) return {}
  const { companyId, hotelId, cityId, dateFrom, dateTo, search } = filter

  const AND = []
  if (companyId) AND.push({ companyId })
  if (hotelId) AND.push({ hotelId })
  if (cityId) AND.push({ cityId })

  if (dateFrom || dateTo) {
    AND.push({
      date: {
        gte: dateFrom ?? undefined,
        lte: dateTo ?? undefined
      }
    })
  }
  if (search && search.trim()) {
    const s = search.trim()
    AND.push({
      OR: [
        { contractNumber: { contains: s, mode: "insensitive" } },
        { legalEntity: { contains: s, mode: "insensitive" } },
        { applicationType: { contains: s, mode: "insensitive" } },
        { notes: { contains: s, mode: "insensitive" } },
        { hotel: { name: { contains: s, mode: "insensitive" } } },
        { company: { name: { contains: s, mode: "insensitive" } } }
      ]
    })
  }

  return AND.length ? { AND } : {}
}

export const buildOrganizationContractWhere = (filter) => {
  if (!filter) return {}

  const { companyId, organizationId, cityId, dateFrom, dateTo, search } = filter
  const AND = []

  if (companyId) AND.push({ companyId })
  if (organizationId) AND.push({ organizationId })
  if (cityId) AND.push({ cityId })

  if (dateFrom || dateTo) {
    AND.push({
      date: {
        gte: dateFrom ?? undefined,
        lte: dateTo ?? undefined
      }
    })
  }

  if (search && search.trim()) {
    const s = search.trim()
    AND.push({
      OR: [
        { contractNumber: { contains: s, mode: "insensitive" } },
        { applicationType: { contains: s, mode: "insensitive" } },
        { notes: { contains: s, mode: "insensitive" } },
        { organization: { name: { contains: s, mode: "insensitive" } } },
        { company: { name: { contains: s, mode: "insensitive" } } }
      ]
    })
  }

  return AND.length ? { AND } : {}
}

export const buildOrderBy = (orderBy) => {
  if (!orderBy) return undefined
  const allowed = ["date", "contractNumber", "createdAt"]
  const entries = Object.entries(orderBy).filter(([k]) => allowed.includes(k))
  if (!entries.length) return undefined
  return entries.map(([field, dir]) => ({ [field]: dir }))
}


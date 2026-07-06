import { sortContractsByExpiration } from "./contractExpiration.js"
import { appendArchiveFilter, isArchivedContractFilter } from "./contractArchive.js"

export { isArchivedContractFilter }

export const buildAirlineContractWhere = (filter) => {
  const { companyId, airlineId, applicationType, dateFrom, dateTo, search } =
    filter || {}

  const AND = []
  appendArchiveFilter(filter, AND)

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
  const { companyId, hotelId, cityId, dateFrom, dateTo, search } = filter || {}

  const AND = []
  appendArchiveFilter(filter, AND)

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
  const { companyId, organizationId, cityId, dateFrom, dateTo, search } =
    filter || {}
  const AND = []
  appendArchiveFilter(filter, AND)

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
  const allowed = ["date", "contractNumber", "createdAt", "contractEndDate"]
  const entries = Object.entries(orderBy).filter(([k]) => allowed.includes(k))
  if (!entries.length) return undefined
  return entries.map(([field, dir]) => ({ [field]: dir }))
}

export const fetchContractConnection = async ({
  prismaModel,
  where,
  pagination,
  orderBy,
  include,
  sortByExpiration,
  isArchivedList = false
}) => {
  const totalCount = await prismaModel.count({ where })
  const { skip, take, all } = pagination || {}
  const prismaOrderBy = buildOrderBy(orderBy)
  const useExpirationSort =
    isArchivedList || sortByExpiration === false
      ? false
      : sortByExpiration ?? !prismaOrderBy

  let items

  if (prismaOrderBy) {
    items = await prismaModel.findMany({
      where,
      skip: all ? undefined : (skip ?? 0),
      take: all ? undefined : (take ?? 20),
      orderBy: prismaOrderBy,
      include
    })
  } else if (useExpirationSort) {
    const allItems = await prismaModel.findMany({ where, include })
    const sorted = sortContractsByExpiration(allItems)

    if (all) {
      items = sorted
    } else {
      const offset = skip ?? 0
      const limit = take ?? 20
      items = sorted.slice(offset, offset + limit)
    }
  } else {
    items = await prismaModel.findMany({
      where,
      skip: all ? undefined : (skip ?? 0),
      take: all ? undefined : (take ?? 20),
      orderBy: isArchivedList
        ? [{ archivedAt: "desc" }, { date: "desc" }]
        : [{ date: "desc" }],
      include
    })
  }

  const totalPages = take && !all ? Math.ceil(totalCount / take) : 1
  return { items, totalCount, totalPages }
}


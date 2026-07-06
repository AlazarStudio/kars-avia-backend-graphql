export function buildRequestListWhere({ pagination = {}, user, archive = false }) {
  const {
    status,
    airportId,
    airlineId,
    personId,
    hotelId,
    arrival,
    departure,
    search,
    bulkGroupId,
    linkNumber
  } = pagination || {}

  const statusFilter =
    status && status.length > 0 && !status.includes("all")
      ? { status: { in: status } }
      : {}

  const airlineAccessFilter = user?.airlineId
    ? { airlineId: user.airlineId }
    : {}

  const exactMatchFilters = {
    ...(airportId && { airportId }),
    ...(airlineId && { airlineId }),
    ...(personId && { personId }),
    ...(hotelId && { hotelId }),
    ...(arrival && {
      arrival: {
        gte: new Date(arrival),
        lte: new Date(new Date(departure).getTime() + 24 * 60 * 60 * 1000)
      }
    }),
    ...(departure && {
      departure: {
        gte: new Date(arrival),
        lte: new Date(new Date(departure).getTime() + 24 * 60 * 60 * 1000)
      }
    }),
    ...(bulkGroupId && { bulkGroupId }),
    ...(linkNumber && { linkNumber })
  }

  const searchFilter = search
    ? {
        OR: [
          { airport: { name: { contains: search, mode: "insensitive" } } },
          { airline: { name: { contains: search, mode: "insensitive" } } },
          { hotel: { name: { contains: search, mode: "insensitive" } } },
          { person: { name: { contains: search, mode: "insensitive" } } },
          { requestNumber: { contains: search, mode: "insensitive" } }
        ]
      }
    : null

  const filters = [
    archive ? { archive: true } : { archive: { not: true } },
    ...(!archive ? [{ status: { not: "canceled" } }] : []),
    airlineAccessFilter,
    statusFilter,
    exactMatchFilters,
    ...(searchFilter ? [searchFilter] : [])
  ]

  return { AND: filters }
}

export const REQUEST_LIST_INCLUDE = {
  airline: { select: { name: true, images: true } },
  airport: { select: { name: true, code: true } },
  hotel: { select: { name: true } },
  person: { select: { name: true } },
  chat: true
}

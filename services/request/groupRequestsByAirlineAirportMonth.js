import { REQUEST_LIST_INCLUDE } from "./buildRequestListWhere.js"

const monthFormatter = new Intl.DateTimeFormat("en-US", { month: "long" })

function getArrivalYearMonth(date) {
  const d = new Date(date)
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

function formatMonthEn(month) {
  return monthFormatter.format(new Date(2000, month - 1, 1))
}

function buildGroupKey(row) {
  if (row.bulkGroupId) {
    return `bulk:${row.bulkGroupId}`
  }
  const { year, month } = getArrivalYearMonth(row.arrival)
  const airportPart = row.airportId ?? ""
  return `${row.airlineId}|${airportPart}|${year}-${String(month).padStart(2, "0")}`
}

function buildMonthLabel(months) {
  const sorted = [...months].sort((a, b) => a - b)
  if (sorted.length === 0) return ""
  if (sorted.length === 1) return formatMonthEn(sorted[0])
  return `${formatMonthEn(sorted[0])}–${formatMonthEn(sorted[sorted.length - 1])}`
}

function buildGroupLabel({ airline, airport, isBulk, monthLabel }) {
  const code = airport?.code ?? "—"
  const base = `${airline?.name ?? ""} ${code}-${monthLabel}`.trim()
  return isBulk ? `${base} (массовая)` : base
}

function compareGroups(a, b) {
  const createdDiff = b.latestCreatedAt - a.latestCreatedAt
  if (createdDiff !== 0) return createdDiff

  const airlineDiff = (a.airline?.name ?? "").localeCompare(
    b.airline?.name ?? "",
    "ru"
  )
  if (airlineDiff !== 0) return airlineDiff

  const codeDiff = (a.airport?.code ?? "").localeCompare(b.airport?.code ?? "")
  if (codeDiff !== 0) return codeDiff

  const yearDiff = (b.year ?? 0) - (a.year ?? 0)
  if (yearDiff !== 0) return yearDiff

  return (b.month ?? 0) - (a.month ?? 0)
}

function passesGroupPeriodFilter(group, groupYear, groupMonth) {
  if (group.isBulk) return true
  if (groupYear != null && group.year !== groupYear) return false
  if (groupMonth != null && group.month !== groupMonth) return false
  return true
}

export async function groupRequestsByAirlineAirportMonth({
  prisma,
  where,
  pagination = {}
}) {
  const { skip = 0, take = 10, groupYear, groupMonth } = pagination

  const rows = await prisma.request.findMany({
    where,
    select: {
      id: true,
      airlineId: true,
      airportId: true,
      arrival: true,
      bulkGroupId: true,
      createdAt: true,
      airline: { select: { id: true, name: true, images: true } },
      airport: { select: { id: true, name: true, code: true } }
    },
    orderBy: { createdAt: "desc" }
  })

  const groupMap = new Map()

  for (const row of rows) {
    const key = buildGroupKey(row)
    const { year, month } = getArrivalYearMonth(row.arrival)
    const isBulk = Boolean(row.bulkGroupId)
    const createdAt = new Date(row.createdAt).getTime()

    if (!groupMap.has(key)) {
      groupMap.set(key, {
        key,
        isBulk,
        bulkGroupId: row.bulkGroupId || null,
        airlineId: row.airlineId,
        airline: row.airline,
        airportId: row.airportId,
        airport: row.airport,
        years: new Set(),
        months: new Set(),
        requestIds: [],
        latestCreatedAt: createdAt
      })
    }

    const group = groupMap.get(key)
    group.requestIds.push(row.id)
    group.years.add(year)
    group.months.add(month)
    if (createdAt > group.latestCreatedAt) {
      group.latestCreatedAt = createdAt
    }
  }

  const groups = [...groupMap.values()]
    .map((group) => {
      const years = [...group.years]
      const months = [...group.months]
      const singleYear = years.length === 1 ? years[0] : null
      const singleMonth = months.length === 1 ? months[0] : null
      const monthLabel = buildMonthLabel(months)

      return {
        key: group.key,
        isBulk: group.isBulk,
        bulkGroupId: group.bulkGroupId,
        airlineId: group.airlineId,
        airline: group.airline,
        airportId: group.airportId,
        airport: group.airport,
        year: singleYear,
        month: singleMonth,
        monthLabel,
        label: buildGroupLabel({
          airline: group.airline,
          airport: group.airport,
          isBulk: group.isBulk,
          monthLabel
        }),
        requestCount: group.requestIds.length,
        requestIds: group.requestIds,
        latestCreatedAt: group.latestCreatedAt
      }
    })
    .filter((group) => passesGroupPeriodFilter(group, groupYear, groupMonth))
    .sort(compareGroups)

  const totalGroups = groups.length
  const totalPages = Math.ceil(totalGroups / take) || 0
  const pageGroups = groups.slice(skip * take, skip * take + take)

  const pageRequestIds = pageGroups.flatMap((g) => g.requestIds)
  const requestsById = new Map()

  if (pageRequestIds.length > 0) {
    const requests = await prisma.request.findMany({
      where: { id: { in: pageRequestIds } },
      include: REQUEST_LIST_INCLUDE,
      orderBy: { createdAt: "desc" }
    })
    for (const request of requests) {
      requestsById.set(request.id, request)
    }
  }

  const resultGroups = pageGroups.map(
    ({ requestIds, latestCreatedAt, monthLabel, ...group }) => ({
      ...group,
      requests: requestIds
        .map((id) => requestsById.get(id))
        .filter(Boolean)
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
    })
  )

  return {
    totalGroups,
    totalPages,
    groups: resultGroups
  }
}

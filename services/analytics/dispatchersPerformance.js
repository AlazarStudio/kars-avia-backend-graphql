import { prisma } from "../../prisma.js"
import { buildUserTimeAnalytics } from "./userTimeAnalytics.js"

const MS_PER_MINUTE = 60000

const asDate = (v, name) => {
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) throw new Error(`Некорректная дата ${name}`)
  return d
}

const uniqCount = (iterable) => new Set(iterable).size

const safeParseJson = (s) => {
  if (!s || typeof s !== "string") return null
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

const avgOrNull = (values) => {
  if (!values.length) return null
  return values.reduce((a, b) => a + b, 0) / values.length
}

const logInRangeWhere = (start, end, userIds) => ({
  userId: { in: userIds },
  createdAt: { gte: start, lte: end }
})

const ACTIONS_PLACEMENT_REQUEST = new Set([
  "open_request",
  "update_request",
  "create_hotel_chess",
  "update_hotel_chess",
  "update_hotel_chess_request"
])

const ACTIONS_HOTEL = new Set([
  "create_hotel",
  "update_hotel",
  "create_room",
  "update_room"
])

const ACTIONS_CONTRACT = new Set([
  "create_airline_contract",
  "update_airline_contract",
  "create_hotel_contract",
  "update_hotel_contract",
  "create_organization_contract",
  "update_organization_contract",
  "create_additional_agreement",
  "update_additional_agreement"
])

const ACTIONS_TRANSFER = new Set(["create_transfer", "update_transfer", "open_transfer"])

function extractIdsFromContractLog(log) {
  const payload = safeParseJson(log?.newData) || safeParseJson(log?.oldData)
  const id =
    payload?.contractId ||
    payload?.airlineContractId ||
    payload?.hotelContractId ||
    payload?.organizationContractId ||
    payload?.additionalAgreementId
  return id ? [String(id)] : []
}

function extractIdsFromTransferLog(log) {
  const payload = safeParseJson(log?.newData) || safeParseJson(log?.oldData)
  const id = payload?.transferId
  return id ? [String(id)] : []
}

async function loadDispatchers(dispatcherIds) {
  if (Array.isArray(dispatcherIds) && dispatcherIds.length) {
    return prisma.user.findMany({
      where: { id: { in: dispatcherIds } },
      select: { id: true, name: true, dispatcher: true, role: true, dailyTimeStats: true, totalTimeMinutes: true }
    })
  }
  return prisma.user.findMany({
    where: { dispatcher: true },
    select: { id: true, name: true, dispatcher: true, role: true, dailyTimeStats: true, totalTimeMinutes: true }
  })
}

async function computeWorkHoursAvg(user, startDate, endDate) {
  const analytics = buildUserTimeAnalytics({
    dailyTimeStats: user.dailyTimeStats || [],
    totalTimeMinutes: user.totalTimeMinutes || 0,
    period: "CUSTOM",
    startDate,
    endDate
  })
  const avgHours = (analytics.averageMinutesPerActiveDay || 0) / 60
  return Number.isFinite(avgHours) ? avgHours : null
}

async function computeReactionAndProcessing({
  dispatcherId,
  start,
  end
}) {
  // Берем открытия заявок этим диспетчером в периоде
  const openLogs = await prisma.log.findMany({
    where: {
      userId: dispatcherId,
      action: "open_request",
      requestId: { not: null },
      createdAt: { gte: start, lte: end }
    },
    select: { requestId: true, createdAt: true }
  })

  if (!openLogs.length) {
    return { avgReactionMinutes: null, avgProcessingMinutes: null }
  }

  // first open per request
  const firstOpenByRequest = new Map()
  for (const l of openLogs) {
    if (!l.requestId) continue
    const prev = firstOpenByRequest.get(l.requestId)
    if (!prev || new Date(l.createdAt) < new Date(prev)) {
      firstOpenByRequest.set(l.requestId, l.createdAt)
    }
  }

  const requestIds = Array.from(firstOpenByRequest.keys())
  const requests = await prisma.request.findMany({
    where: { id: { in: requestIds } },
    select: { id: true, createdAt: true, placementAt: true, status: true }
  })
  const requestById = new Map(requests.map((r) => [r.id, r]))

  const reactionValues = []
  const processingValues = []

  for (const [requestId, openedAtRaw] of firstOpenByRequest.entries()) {
    const req = requestById.get(requestId)
    if (!req?.createdAt) continue
    const openedAt = new Date(openedAtRaw)
    const reactionMin = (openedAt - new Date(req.createdAt)) / MS_PER_MINUTE
    if (reactionMin >= 0 && Number.isFinite(reactionMin)) {
      reactionValues.push(reactionMin)
    }

    if (req.placementAt) {
      const placementAt = new Date(req.placementAt)
      const processingMin = (placementAt - openedAt) / MS_PER_MINUTE
      if (processingMin >= 0 && Number.isFinite(processingMin)) {
        processingValues.push(processingMin)
      }
    }
  }

  return {
    avgReactionMinutes: avgOrNull(reactionValues),
    avgProcessingMinutes: avgOrNull(processingValues)
  }
}

async function computeDispatcherMetrics(dispatcher, start, end) {
  const dispatcherId = dispatcher.id

  const logs = await prisma.log.findMany({
    where: logInRangeWhere(start, end, [dispatcherId]),
    select: {
      id: true,
      action: true,
      requestId: true,
      hotelId: true,
      createdAt: true,
      newData: true,
      oldData: true
    }
  })

  const placementRequestIds = new Set()
  const hotelIds = new Set()
  const contractIds = new Set()
  const transferIds = new Set()

  for (const l of logs) {
    if (l.requestId && ACTIONS_PLACEMENT_REQUEST.has(l.action)) {
      placementRequestIds.add(l.requestId)
    }
    if (l.hotelId && ACTIONS_HOTEL.has(l.action)) {
      hotelIds.add(l.hotelId)
    }
    if (ACTIONS_CONTRACT.has(l.action)) {
      extractIdsFromContractLog(l).forEach((id) => contractIds.add(id))
    }
    if (ACTIONS_TRANSFER.has(l.action)) {
      extractIdsFromTransferLog(l).forEach((id) => transferIds.add(id))
    }
  }

  const { avgReactionMinutes, avgProcessingMinutes } =
    await computeReactionAndProcessing({ dispatcherId, start, end })

  const avgWorkHours = await computeWorkHoursAvg(dispatcher, start, end)

  return {
    processedPlacementRequests: placementRequestIds.size,
    processedTransferRequests: transferIds.size,
    processedHotels: hotelIds.size,
    processedContracts: contractIds.size,
    avgReactionMinutes,
    avgProcessingMinutes,
    avgWorkHours
  }
}

export async function analyticsDispatchersPerformance(input) {
  const start = asDate(input?.startDate, "startDate")
  const end = asDate(input?.endDate, "endDate")
  if (start > end) throw new Error("startDate не может быть позже endDate")

  const dispatchersRaw = await loadDispatchers(input?.dispatcherIds)
  const dispatchers = dispatchersRaw.filter((u) => u && u.id)

  const byDispatcher = []
  const totalsAcc = {
    processedPlacementRequests: 0,
    processedTransferRequests: 0,
    processedHotels: 0,
    processedContracts: 0,
    reactionValues: [],
    processingValues: [],
    workHoursValues: []
  }

  for (const d of dispatchers) {
    const metrics = await computeDispatcherMetrics(d, start, end)
    byDispatcher.push({
      dispatcher: { id: d.id, name: d.name },
      metrics
    })

    totalsAcc.processedPlacementRequests += metrics.processedPlacementRequests
    totalsAcc.processedTransferRequests += metrics.processedTransferRequests
    totalsAcc.processedHotels += metrics.processedHotels
    totalsAcc.processedContracts += metrics.processedContracts
    if (metrics.avgReactionMinutes != null)
      totalsAcc.reactionValues.push(metrics.avgReactionMinutes)
    if (metrics.avgProcessingMinutes != null)
      totalsAcc.processingValues.push(metrics.avgProcessingMinutes)
    if (metrics.avgWorkHours != null) totalsAcc.workHoursValues.push(metrics.avgWorkHours)
  }

  return {
    totals: {
      processedPlacementRequests: totalsAcc.processedPlacementRequests,
      processedTransferRequests: totalsAcc.processedTransferRequests,
      processedHotels: totalsAcc.processedHotels,
      processedContracts: totalsAcc.processedContracts,
      avgReactionMinutes: avgOrNull(totalsAcc.reactionValues),
      avgProcessingMinutes: avgOrNull(totalsAcc.processingValues),
      avgWorkHours: avgOrNull(totalsAcc.workHoursValues)
    },
    byDispatcher
  }
}


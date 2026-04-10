import { prisma } from "../../prisma.js"
import {
  validateDateRange,
  buildRequestWhere,
  buildTransferWhere,
  REQUEST_INCLUDE,
  TRANSFER_INCLUDE,
  computeRequestCosts,
  computeTransferBudgetDetails,
  extractRoomIds,
  extractUniquePersonIds,
  filterTransfersByPositions,
  countTransferUniquePeople
} from "./airlineAnalyticsUtils.js"

const roundMoney = (v) => Math.round((Number(v) || 0) * 100) / 100

function normalizeServices(services) {
  if (!Array.isArray(services) || !services.length) {
    return ["LIVING", "MEAL", "TRANSFER"]
  }
  return [...new Set(services)]
}

async function fetchRequests(where) {
  return prisma.request.findMany({ where, include: REQUEST_INCLUDE })
}

async function fetchTransfers(where) {
  return prisma.transfer.findMany({ where, include: TRANSFER_INCLUDE })
}

function buildRequestBudgetMap(requests, start, end) {
  const budgetByRequestId = new Map()

  for (const request of requests) {
    const { livingCost, mealCost } = computeRequestCosts(request, start, end)
    budgetByRequestId.set(request.id, {
      livingBudget: roundMoney(livingCost),
      mealBudget: roundMoney(mealCost)
    })
  }

  return budgetByRequestId
}

function getRequestBudget(budgetByRequestId, requestId) {
  return budgetByRequestId.get(requestId) || { livingBudget: 0, mealBudget: 0 }
}

function getServiceRequestBudget(service, requestBudget) {
  if (service === "LIVING") return requestBudget.livingBudget
  if (service === "MEAL") return requestBudget.mealBudget
  return 0
}

function buildServiceRequestItems({ service, requests, budgetByRequestId }) {
  return requests.map((request) => {
    const requestBudget = getRequestBudget(budgetByRequestId, request.id)
    const livingBudget = roundMoney(requestBudget.livingBudget)
    const mealBudget = roundMoney(requestBudget.mealBudget)
    const budget = roundMoney(getServiceRequestBudget(service, requestBudget))

    return {
      requestId: request.id,
      personId: request.personId || null,
      personName: request.person?.name || null,
      positionId: request.person?.positionId || null,
      positionName: request.person?.position?.name || "Не указана",
      airportId: request.airportId || null,
      airportName: request.airport?.name || null,
      budget,
      livingBudget,
      mealBudget,
      transferBudget: 0
    }
  })
}

function buildServiceAirportsFromRequests({ service, requests, budgetByRequestId }) {
  const airportMap = new Map()

  for (const request of requests) {
    const airportKey = request.airportId || "__none__"
    if (!airportMap.has(airportKey)) {
      airportMap.set(airportKey, {
        airportId: request.airportId || null,
        airportName: request.airport?.name || null,
        airportCode: request.airport?.code || null,
        requests: [],
        peopleIds: new Set()
      })
    }

    const bucket = airportMap.get(airportKey)
    bucket.requests.push(request)
    if (request.personId) bucket.peopleIds.add(request.personId)
  }

  const result = []
  for (const bucket of airportMap.values()) {
    let budget = 0
    for (const request of bucket.requests) {
      const requestBudget = getRequestBudget(budgetByRequestId, request.id)
      budget += getServiceRequestBudget(service, requestBudget)
    }

    result.push({
      airportId: bucket.airportId,
      airportName: bucket.airportName,
      airportCode: bucket.airportCode,
      requestsCount: bucket.requests.length,
      uniquePeopleCount: bucket.peopleIds.size,
      budget: roundMoney(budget),
      usedRoomsCount:
        service === "LIVING" ? extractRoomIds(bucket.requests).size : null
    })
  }

  result.sort((a, b) => b.budget - a.budget)
  return result
}

function buildServicePositionsFromRequests({ service, requests, budgetByRequestId }) {
  const positionMap = new Map()
  let totalWithPosition = 0

  for (const request of requests) {
    if (!request.personId) continue

    totalWithPosition += 1
    const positionId = request.person?.positionId || null
    const positionName = request.person?.position?.name || "Не указана"
    const key = positionId || `name:${positionName}`
    const requestBudget = getRequestBudget(budgetByRequestId, request.id)
    const serviceBudget = getServiceRequestBudget(service, requestBudget)

    if (!positionMap.has(key)) {
      positionMap.set(key, {
        positionId,
        positionName,
        count: 0,
        budget: 0
      })
    }

    const row = positionMap.get(key)
    row.count += 1
    row.budget += serviceBudget
  }

  const result = [...positionMap.values()].map((row) => ({
    positionId: row.positionId,
    positionName: row.positionName,
    count: row.count,
    percent: totalWithPosition ? roundMoney((row.count / totalWithPosition) * 100) : 0,
    budget: roundMoney(row.budget)
  }))

  result.sort((a, b) => b.budget - a.budget)
  return result
}

function buildTransferItems({ transfers, transferBudgetById }) {
  return transfers.map((transfer) => {
    const persons = Array.isArray(transfer.persons) ? transfer.persons : []
    const uniquePeopleIds = new Set()
    for (const link of persons) {
      if (link?.personal?.id) uniquePeopleIds.add(link.personal.id)
    }

    return {
      transferId: transfer.id,
      requestNumber: transfer.requestNumber || null,
      fromAddress: transfer.fromAddress || null,
      toAddress: transfer.toAddress || null,
      passengersCount: transfer.passengersCount || 0,
      uniquePeopleCount: uniquePeopleIds.size,
      budget: roundMoney(transferBudgetById.get(transfer.id) || 0)
    }
  })
}

function buildTransferPositions({ transfers, transferBudgetById }) {
  const positionMap = new Map()
  let totalPeopleLinks = 0

  for (const transfer of transfers) {
    const persons = Array.isArray(transfer.persons) ? transfer.persons : []
    const validLinks = persons.filter((link) => link?.personal)
    const transferBudget = roundMoney(transferBudgetById.get(transfer.id) || 0)
    const share = validLinks.length ? transferBudget / validLinks.length : 0

    for (const link of validLinks) {
      const positionId = link.personal?.positionId || null
      const positionName = link.personal?.position?.name || "Не указана"
      const key = positionId || `name:${positionName}`

      if (!positionMap.has(key)) {
        positionMap.set(key, {
          positionId,
          positionName,
          count: 0,
          budget: 0
        })
      }

      const row = positionMap.get(key)
      row.count += 1
      row.budget += share
      totalPeopleLinks += 1
    }
  }

  const result = [...positionMap.values()].map((row) => ({
    positionId: row.positionId,
    positionName: row.positionName,
    count: row.count,
    percent: totalPeopleLinks ? roundMoney((row.count / totalPeopleLinks) * 100) : 0,
    budget: roundMoney(row.budget)
  }))

  result.sort((a, b) => b.budget - a.budget)
  return result
}

function buildTransferAirports({ transfers, totalBudget }) {
  if (!transfers.length) return []

  return [
    {
      airportId: null,
      airportName: null,
      airportCode: null,
      requestsCount: transfers.length,
      uniquePeopleCount: countTransferUniquePeople(transfers).size,
      budget: roundMoney(totalBudget),
      usedRoomsCount: null
    }
  ]
}

function buildServiceAnalyticsBlock({
  service,
  requests,
  transfers,
  budgetByRequestId,
  transferBudgetById,
  transferTotalBudget
}) {
  if (service === "TRANSFER") {
    const totalRequests = transfers.length
    const uniquePeopleCount = countTransferUniquePeople(transfers).size
    const totalBudget = roundMoney(transferTotalBudget)

    return {
      service,
      totalRequests,
      uniquePeopleCount,
      totalBudget,
      usedRoomsCount: null,
      airports: buildTransferAirports({ transfers, totalBudget }),
      positions: buildTransferPositions({ transfers, transferBudgetById }),
      requests: [],
      transfers: buildTransferItems({ transfers, transferBudgetById })
    }
  }

  let totalBudget = 0
  for (const request of requests) {
    const requestBudget = getRequestBudget(budgetByRequestId, request.id)
    totalBudget += getServiceRequestBudget(service, requestBudget)
  }

  return {
    service,
    totalRequests: requests.length,
    uniquePeopleCount: extractUniquePersonIds(requests).size,
    totalBudget: roundMoney(totalBudget),
    usedRoomsCount: service === "LIVING" ? extractRoomIds(requests).size : null,
    airports: buildServiceAirportsFromRequests({
      service,
      requests,
      budgetByRequestId
    }),
    positions: buildServicePositionsFromRequests({
      service,
      requests,
      budgetByRequestId
    }),
    requests: buildServiceRequestItems({
      service,
      requests,
      budgetByRequestId
    }),
    transfers: []
  }
}

async function buildAirlineAnalyticsPeriod({
  airlineId,
  periodInput,
  enabledServices,
  label
}) {
  const range = validateDateRange(periodInput.dateFrom, periodInput.dateTo, label)
  const airportIds = periodInput.airportIds?.length ? periodInput.airportIds : null
  const positionIds = periodInput.positionIds?.length
    ? periodInput.positionIds
    : null

  const reqWhere = buildRequestWhere({
    airlineId,
    start: range.start,
    end: range.end,
    airportIds,
    positionIds
  })
  const trWhere = buildTransferWhere({
    airlineId,
    start: range.start,
    end: range.end
  })

  const [requests, rawTransfers] = await Promise.all([
    fetchRequests(reqWhere),
    enabledServices.includes("TRANSFER")
      ? fetchTransfers(trWhere)
      : Promise.resolve([])
  ])

  const transfers = filterTransfersByPositions(rawTransfers, positionIds)
  const budgetByRequestId = buildRequestBudgetMap(requests, range.start, range.end)
  const { total: transferTotalBudget, byTransferId: transferBudgetById } =
    enabledServices.includes("TRANSFER")
      ? await computeTransferBudgetDetails(transfers, airlineId)
      : { total: 0, byTransferId: new Map() }

  const services = enabledServices.map((service) =>
    buildServiceAnalyticsBlock({
      service,
      requests,
      transfers,
      budgetByRequestId,
      transferBudgetById,
      transferTotalBudget
    })
  )

  return {
    dateFrom: range.start,
    dateTo: range.end,
    services
  }
}

export async function computeAirlineAnalytics(input) {
  const { airlineId } = input
  if (!airlineId) throw new Error("airlineId обязателен")

  const enabledServices = normalizeServices(input.services)
  if (!input.period1) {
    throw new Error("period1 обязателен")
  }

  const period1 = await buildAirlineAnalyticsPeriod({
    airlineId,
    periodInput: input.period1,
    enabledServices,
    label: "period1"
  })

  const period2 = input.period2
    ? await buildAirlineAnalyticsPeriod({
        airlineId,
        periodInput: input.period2,
        enabledServices,
        label: "period2"
      })
    : null

  return {
    period1,
    period2
  }
}

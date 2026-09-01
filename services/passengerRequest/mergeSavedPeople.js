import { GraphQLError } from "graphql"
import { ensurePersonId, normalizePersonCategory } from "./savedPassengers.js"

const DRIVER_FIELDS = [
  "transferService",
  "departureTransferService",
  "intercityTransferService",
  "baggageDeliveryService"
]

const normalizeOptionalString = (value) => {
  if (value == null) return null
  const trimmed = String(value).trim()
  return trimmed === "" ? null : trimmed
}

const badInput = (message) => {
  throw new GraphQLError(message, { extensions: { code: "BAD_USER_INPUT" } })
}

const remapId = (id, dropIds, keepId) =>
  id && dropIds.has(id) ? keepId : id

export const rebindPeopleList = (people, dropIds, keepId) => {
  const list = Array.isArray(people) ? people : []
  const seen = new Set()
  const out = []
  for (const person of list) {
    if (!person) continue
    const next = {
      ...person,
      personId: remapId(person.personId, dropIds, keepId)
    }
    const id = next.personId
    if (id && seen.has(id)) continue
    if (id) seen.add(id)
    out.push(next)
  }
  return out
}

const rebindDriverService = (service, dropIds, keepId) => {
  if (!service) return service
  const drivers = Array.isArray(service.drivers) ? service.drivers : []
  return {
    ...service,
    drivers: drivers.map((driver) => ({
      ...driver,
      people: rebindPeopleList(driver?.people, dropIds, keepId)
    }))
  }
}

export const remapGroupMemberIds = (groups, dropIds, keepId) => {
  const list = Array.isArray(groups) ? groups : []
  return list
    .map((group) => ({
      ...group,
      memberPersonIds: [
        ...new Set(
          (group?.memberPersonIds || []).map((id) =>
            remapId(id, dropIds, keepId)
          )
        )
      ].filter(Boolean)
    }))
    .filter((group) => group.memberPersonIds.length > 0)
}

const fillKeepFromDrops = (keep, drops) => {
  let next = { ...ensurePersonId(keep) }
  for (const drop of drops) {
    next = {
      ...next,
      phone: next.phone ?? normalizeOptionalString(drop?.phone),
      seat: next.seat ?? normalizeOptionalString(drop?.seat),
      airlinePersonalId:
        next.airlinePersonalId ?? normalizeOptionalString(drop?.airlinePersonalId),
      placementRequirement:
        next.placementRequirement ?? drop?.placementRequirement ?? null,
      personCategory:
        next.personCategory == null || next.personCategory === "ADULT"
          ? normalizePersonCategory(drop?.personCategory) === "ADULT"
            ? next.personCategory
            : normalizePersonCategory(drop?.personCategory)
          : next.personCategory
    }
  }
  return next
}

const hotelIndexesWithReboundPeople = (hotels, dropIds) => {
  const indexes = []
  ;(hotels || []).forEach((hotel, index) => {
    if ((hotel?.people || []).some((p) => dropIds.has(p?.personId))) {
      indexes.push(index)
    }
  })
  return indexes
}

export const rebindReportRows = (rows, dropIds, keepId) => {
  const list = Array.isArray(rows) ? rows : []
  return list.map((row) =>
    dropIds.has(row?.personId) ? { ...row, personId: keepId } : row
  )
}

export const mergeSavedPeopleInRequest = (
  request,
  keepPersonId,
  mergePersonIds
) => {
  const roster = Array.isArray(request?.savedPassengers)
    ? request.savedPassengers
    : []
  const keep = roster.find((p) => p?.personId === keepPersonId)
  if (!keep) badInput("Saved passenger to keep not found")

  const dropIds = new Set(
    (Array.isArray(mergePersonIds) ? mergePersonIds : []).filter(Boolean)
  )
  dropIds.delete(keepPersonId)
  if (!dropIds.size) badInput("No duplicate passengers to merge")

  const drops = roster.filter((p) => dropIds.has(p?.personId))
  if (drops.length !== dropIds.size) {
    badInput("Saved passenger to merge not found")
  }

  const kept = fillKeepFromDrops(keep, drops)
  const savedPassengers = roster
    .filter((p) => !dropIds.has(p?.personId))
    .map((p) => (p?.personId === keepPersonId ? kept : p))

  const hotels = request?.livingService?.hotels || []
  const unsubmitReports = hotelIndexesWithReboundPeople(hotels, dropIds)

  const livingService = request.livingService
    ? {
        ...request.livingService,
        hotels: hotels.map((hotel) => ({
          ...hotel,
          people: rebindPeopleList(hotel?.people, dropIds, keepPersonId)
        }))
      }
    : request.livingService

  const data = {
    savedPassengers,
    passengerGroups: remapGroupMemberIds(
      request.passengerGroups,
      dropIds,
      keepPersonId
    )
  }
  if (livingService) data.livingService = livingService
  if (request.waterService) {
    data.waterService = {
      ...request.waterService,
      people: rebindPeopleList(
        request.waterService.people,
        dropIds,
        keepPersonId
      )
    }
  }
  if (request.mealService) {
    data.mealService = {
      ...request.mealService,
      people: rebindPeopleList(request.mealService.people, dropIds, keepPersonId)
    }
  }
  for (const field of DRIVER_FIELDS) {
    if (request[field]) {
      data[field] = rebindDriverService(request[field], dropIds, keepPersonId)
    }
  }

  return { data, unsubmitReports, dropIds, keepPersonId }
}

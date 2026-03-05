import { prisma } from "../../prisma.js"
import { logger } from "./logger.js"

const MAX_DEPTH = 4
const MAX_STRING_LENGTH = 500
const MAX_ARRAY_PREVIEW = 3
const LARGE_ARRAY_KEYS = [
  "images",
  "gallery",
  "files",
  "documents",
  "reportRows",
  "dailyMeals",
  "rooms",
  "hotelChesses",
  "roomKind",
  "additionalServices",
  "department",
  "staff",
  "prices",
  "people",
  "passengers",
  "chats"
]

const isPlainObject = (value) =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  !(value instanceof Date)

const shouldCompactArrayByKey = (key = "") =>
  LARGE_ARRAY_KEYS.some((arrayKey) => key.toLowerCase().includes(arrayKey))

const truncateString = (value) => {
  if (typeof value !== "string") return value
  if (value.length <= MAX_STRING_LENGTH) return value
  return `${value.slice(0, MAX_STRING_LENGTH)}... [truncated ${value.length - MAX_STRING_LENGTH} chars]`
}

const sanitizeLargeFields = (
  value,
  { depth = 0, key = "", seen = new WeakSet() } = {}
) => {
  if (value === null || value === undefined) return value
  if (typeof value === "string") return truncateString(value)
  if (typeof value === "number" || typeof value === "boolean") return value
  if (typeof value === "bigint") return value.toString()
  if (typeof value === "function") return "[Function omitted]"
  if (value instanceof Date) return value.toISOString()
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) {
    return `[Buffer omitted: ${value.length} bytes]`
  }
  if (depth >= MAX_DEPTH) {
    return "[Max depth reached]"
  }

  if (Array.isArray(value)) {
    const preview = value
      .slice(0, MAX_ARRAY_PREVIEW)
      .map((item) =>
        sanitizeLargeFields(item, {
          depth: depth + 1,
          key,
          seen
        })
      )
    const shouldCompact =
      value.length > MAX_ARRAY_PREVIEW || shouldCompactArrayByKey(key)

    if (!shouldCompact) {
      return preview
    }
    return {
      count: value.length,
      preview,
      truncated: Math.max(value.length - MAX_ARRAY_PREVIEW, 0)
    }
  }

  if (!isPlainObject(value)) {
    return String(value)
  }

  if (seen.has(value)) {
    return "[Circular reference omitted]"
  }
  seen.add(value)

  const result = {}
  for (const [childKey, childValue] of Object.entries(value)) {
    if (
      childValue &&
      typeof childValue === "object" &&
      childValue.type === "Buffer" &&
      Array.isArray(childValue.data)
    ) {
      result[childKey] = `[Buffer JSON omitted: ${childValue.data.length} bytes]`
      continue
    }
    result[childKey] = sanitizeLargeFields(childValue, {
      depth: depth + 1,
      key: childKey,
      seen
    })
  }
  return result
}

const getByPath = (obj, path) => {
  if (!obj) return undefined
  return path.split(".").reduce((acc, part) => {
    if (acc == null) return undefined
    return acc[part]
  }, obj)
}

const setByPath = (obj, path, value) => {
  const parts = path.split(".")
  let current = obj
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i]
    if (i === parts.length - 1) {
      current[part] = value
      return
    }
    if (!isPlainObject(current[part])) {
      current[part] = {}
    }
    current = current[part]
  }
}

const pick = (obj, allowedFields = []) => {
  if (!obj || !allowedFields?.length) return null
  const source = sanitizeLargeFields(obj)
  const result = {}
  for (const field of allowedFields) {
    const value = getByPath(source, field)
    if (value !== undefined) {
      setByPath(result, field, value)
    }
  }
  return Object.keys(result).length ? result : null
}

const stableValue = (value) => {
  try {
    return JSON.stringify(sanitizeLargeFields(value))
  } catch (error) {
    return String(value)
  }
}

const computeDiff = (oldObj, newObj, allowedFields = []) => {
  if (!allowedFields?.length) return {}
  const changes = {}
  for (const field of allowedFields) {
    const from = getByPath(oldObj, field)
    const to = getByPath(newObj, field)
    if (stableValue(from) !== stableValue(to)) {
      changes[field] = {
        from: sanitizeLargeFields(from),
        to: sanitizeLargeFields(to)
      }
    }
  }
  return changes
}

const statusActions = new Set([
  "open_request",
  "open_reserve",
  "archive_request",
  "archive_reserve",
  "cancel_request",
  "update_passenger_request_status"
])

const createActions = new Set([
  "create_hotel",
  "create_room",
  "create_airline",
  "create_user",
  "create_request",
  "create_reserve",
  "create_hotel_chess",
  "create_passenger_request"
])

const deleteActions = new Set([
  "delete_hotel",
  "delete_room",
  "delete_passenger_request"
])

const compactImages = (obj) => {
  if (!obj || !Array.isArray(obj.images)) return null
  return {
    count: obj.images.length,
    preview: obj.images.slice(0, MAX_ARRAY_PREVIEW)
  }
}

const summarizePassengerRequest = (data) => {
  if (!data || typeof data !== "object") return null
  return {
    id: data.id ?? null,
    flightNumber: data.flightNumber ?? null,
    status: data.status ?? null,
    airlineId: data.airlineId ?? null,
    airportId: data.airportId ?? null,
    routeFrom: data.routeFrom ?? null,
    routeTo: data.routeTo ?? null,
    livingStatus: data.livingService?.status ?? null,
    mealStatus: data.mealService?.status ?? null,
    transferStatus: data.transferService?.status ?? null,
    baggageStatus: data.baggageDeliveryService?.status ?? null,
    hotelsCount: Array.isArray(data.livingService?.hotels)
      ? data.livingService.hotels.length
      : 0
  }
}

const buildCompactPayload = ({ action, oldData, newData }) => {
  const safeOld = sanitizeLargeFields(oldData)
  const safeNew = sanitizeLargeFields(newData)

  if (action === "update_room") {
    const allowed = [
      "name",
      "roomKindId",
      "category",
      "square",
      "reserve",
      "active",
      "beds",
      "description",
      "descriptionSecond",
      "places",
      "price",
      "priceForAirline",
      "type"
    ]
    const oldWithImages = {
      ...safeOld,
      images: compactImages(safeOld)
    }
    const newWithImages = {
      ...safeNew,
      images: compactImages(safeNew)
    }
    const changes = {
      ...computeDiff(oldWithImages, newWithImages, allowed),
      ...computeDiff(oldWithImages, newWithImages, ["images"])
    }
    return {
      oldData: Object.keys(changes).length ? { changes } : null,
      newData: {
        roomId: safeNew?.id || safeOld?.id || null,
        hotelId: safeNew?.hotelId || safeOld?.hotelId || null,
        changedFields: Object.keys(changes)
      }
    }
  }

  if (action === "update_hotel") {
    const allowed = [
      "name",
      "address",
      "city",
      "country",
      "active",
      "breakfast",
      "lunch",
      "dinner",
      "star",
      "type",
      "contacts"
    ]
    const oldWithMedia = {
      ...safeOld,
      images: compactImages(safeOld),
      gallery: safeOld?.gallery
        ? { count: safeOld.gallery.count || 0, preview: safeOld.gallery.preview || [] }
        : null
    }
    const newWithMedia = {
      ...safeNew,
      images: compactImages(safeNew),
      gallery: safeNew?.gallery
        ? { count: safeNew.gallery.count || 0, preview: safeNew.gallery.preview || [] }
        : null
    }
    const changes = {
      ...computeDiff(oldWithMedia, newWithMedia, allowed),
      ...computeDiff(oldWithMedia, newWithMedia, ["images", "gallery"])
    }
    return {
      oldData: Object.keys(changes).length ? { changes } : null,
      newData: {
        hotelId: safeNew?.id || safeOld?.id || null,
        changedFields: Object.keys(changes)
      }
    }
  }

  if (action === "update_hotel_chess" || action === "create_hotel_chess") {
    const allowed = [
      "roomId",
      "room",
      "place",
      "start",
      "end",
      "status",
      "public",
      "clientId",
      "passengerId",
      "requestId",
      "reserveId"
    ]
    const changes = computeDiff(safeOld, safeNew, allowed)
    if (action === "create_hotel_chess") {
      return {
        oldData: null,
        newData: pick(safeNew, [
          "id",
          "hotelId",
          "roomId",
          "room",
          "place",
          "start",
          "end",
          "status",
          "public",
          "requestId",
          "reserveId",
          "clientId",
          "passengerId"
        ])
      }
    }
    return {
      oldData: Object.keys(changes).length ? { changes } : null,
      newData: {
        hotelChessId: safeNew?.id || safeOld?.id || null,
        hotelId: safeNew?.hotelId || safeOld?.hotelId || null,
        changedFields: Object.keys(changes)
      }
    }
  }

  if (action === "update_request") {
    const toRequestSummary = (source) => {
      if (!source || typeof source !== "object") return source
      const dailyMealsRaw = source.mealPlan?.dailyMeals
      const dailyMealsCount = Array.isArray(dailyMealsRaw)
        ? dailyMealsRaw.length
        : dailyMealsRaw?.count || 0
      return {
        ...source,
        mealPlanSummary: source.mealPlan
          ? {
              included: source.mealPlan.included ?? null,
              breakfast: source.mealPlan.breakfast ?? null,
              lunch: source.mealPlan.lunch ?? null,
              dinner: source.mealPlan.dinner ?? null,
              dailyMealsCount
            }
          : null
      }
    }
    const requestOld = toRequestSummary(safeOld)
    const requestNew = toRequestSummary(safeNew)
    const allowed = [
      "arrival",
      "departure",
      "status",
      "airportId",
      "hotelId",
      "personId",
      "mealPlanSummary"
    ]
    const changes = computeDiff(requestOld, requestNew, allowed)
    if (Object.keys(changes).length) {
      return {
        oldData: { changes },
        newData: {
          requestId: safeNew?.id || safeOld?.id || null,
          changedFields: Object.keys(changes)
        }
      }
    }
    return { oldData: null, newData: pick(safeNew, ["id", "requestNumber", "status"]) }
  }

  if (action === "update_airline") {
    const allowed = ["name", "active", "code", "email", "phone", "departmentId", "positionId", "number", "gender"]
    const changes = computeDiff(safeOld, safeNew, allowed)
    if (Object.keys(changes).length) {
      return {
        oldData: { changes },
        newData: {
          airlineId: safeNew?.id || safeOld?.id || null,
          changedFields: Object.keys(changes)
        }
      }
    }
    return { oldData: null, newData: pick(safeNew, ["id", "name", "active"]) }
  }

  if (action === "save_passenger_request_hotel_report") {
    const rows =
      safeNew && Array.isArray(safeNew.reportRows)
        ? safeNew.reportRows.length
        : safeNew?.reportRows?.count || 0
    return {
      oldData: null,
      newData: pick(
        {
          ...safeNew,
          rowsCount: rows
        },
        ["id", "passengerRequestId", "hotelIndex", "rowsCount"]
      )
    }
  }

  if (action.includes("passenger_request")) {
    const oldSummary = summarizePassengerRequest(safeOld)
    const newSummary = summarizePassengerRequest(safeNew)
    const allowed = [
      "flightNumber",
      "status",
      "airlineId",
      "airportId",
      "routeFrom",
      "routeTo",
      "livingStatus",
      "mealStatus",
      "transferStatus",
      "baggageStatus",
      "hotelsCount"
    ]
    const changes = computeDiff(oldSummary, newSummary, allowed)
    if (action.startsWith("delete_")) {
      return { oldData: oldSummary, newData: null }
    }
    if (action.startsWith("create_")) {
      return { oldData: null, newData: newSummary }
    }
    return {
      oldData: Object.keys(changes).length ? { changes } : oldSummary,
      newData: newSummary
    }
  }

  if (statusActions.has(action)) {
    const changes = computeDiff(safeOld, safeNew, ["status", "archive"])
    return {
      oldData: Object.keys(changes).length ? { changes } : null,
      newData: pick(safeNew, ["id", "requestNumber", "reserveNumber", "status", "archive"])
    }
  }

  if (createActions.has(action) || action.startsWith("create_")) {
    return {
      oldData: null,
      newData: pick(safeNew, [
        "id",
        "name",
        "number",
        "requestNumber",
        "reserveNumber",
        "flightNumber",
        "status",
        "hotelId",
        "airlineId",
        "requestId",
        "reserveId",
        "airportId",
        "personId",
        "roomId",
        "roomKindId",
        "active",
        "price",
        "priceForAirline",
        "type"
      ])
    }
  }

  if (deleteActions.has(action) || action.startsWith("delete_")) {
    return {
      oldData: pick(safeOld, [
        "id",
        "name",
        "number",
        "requestNumber",
        "reserveNumber",
        "flightNumber",
        "status",
        "hotelId",
        "airlineId",
        "requestId",
        "reserveId",
        "airportId",
        "personId",
        "roomId",
        "roomKindId",
        "active"
      ]),
      newData: null
    }
  }

  return {
    oldData: sanitizeLargeFields(oldData),
    newData: sanitizeLargeFields(newData)
  }
}

const safeStringify = (data) => {
  try {
    return JSON.stringify(data)
  } catch (error) {
    console.error("Ошибка при преобразовании данных в JSON:", error)
    return null
  }
}

const serializeDescription = (description) => {
  if (description == null) return null
  if (typeof description === "string") return description
  return safeStringify(sanitizeLargeFields(description))
}

const createLog = async ({
  userId,
  action,
  reason = null,
  description,
  hotelId = null,
  airlineId = null,
  requestId = null,
  reserveId = null,
  oldData = null,
  newData = null
}) => {
  try {
    const compactPayload = buildCompactPayload({
      action,
      oldData,
      newData
    })

    const currentTime = new Date()
    const adjustedTime = new Date(currentTime.getTime() + 3 * 60 * 60 * 1000)
    const formattedTime = adjustedTime.toISOString()

    await prisma.log.create({
      data: {
        userId,
        action,
        reason: reason ? reason : null,
        description: serializeDescription(description),
        hotelId: hotelId ? hotelId : null,
        airlineId: airlineId ? airlineId : null,
        requestId: requestId ? requestId : null,
        reserveId: reserveId ? reserveId : null,
        oldData: compactPayload.oldData ? safeStringify(compactPayload.oldData) : null,
        newData: compactPayload.newData ? safeStringify(compactPayload.newData) : null,
        createdAt: formattedTime
      }
    })
  } catch (error) {
    logger.error('Ошибка логирования', error)
    console.error("Ошибка при логировании действия:", error)
  }
}

const logAction = async ({
  context,
  action,
  reason = null,
  description,
  oldData = null,
  newData = null,
  hotelId = null,
  airlineId = null,
  requestId = null,
  reserveId = null
}) => {
  await createLog({
    userId: context.user.id,
    action,
    reason,
    description,
    hotelId,
    airlineId,
    requestId,
    reserveId,
    oldData,
    newData
  })
}

export default logAction
export { computeDiff, pick, sanitizeLargeFields }

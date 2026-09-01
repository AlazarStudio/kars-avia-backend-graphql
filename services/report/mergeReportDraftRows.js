export const STICKY_ROW_KEYS = [
  "arrival",
  "departure",
  "totalDays",
  "category",
  "roomName",
  "roomId",
  "breakfastCount",
  "lunchCount",
  "dinnerCount",
  "breakfastIncludedInPrice",
  "totalMealCost",
  "totalLivingCost",
  "pricePerDay",
  "totalDebt",
  "hotelName"
]

export const valuesEqual = (a, b) => {
  if (a == null && b == null) return true
  if (typeof a === "boolean" || typeof b === "boolean") {
    return Boolean(a) === Boolean(b)
  }
  if (typeof a === "number" || typeof b === "number") {
    const na = Number(a)
    const nb = Number(b)
    if (Number.isNaN(na) && Number.isNaN(nb)) return true
    return na === nb
  }
  return String(a ?? "") === String(b ?? "")
}

const rowKey = (row) => (row?.requestId ? String(row.requestId) : null)

const indexByRequestId = (rows) => {
  const map = new Map()
  for (const row of rows || []) {
    const key = rowKey(row)
    if (key) map.set(key, row)
  }
  return map
}

export const stripChangedKeys = (rows) =>
  (Array.isArray(rows) ? rows : []).map((row) => {
    const { changedKeys, ...rest } = row || {}
    return rest
  })

export const detectChangedKeys = (computedRows, incomingRows) => {
  const computedById = indexByRequestId(computedRows)
  return (Array.isArray(incomingRows) ? incomingRows : []).map((row) => {
    const computed = computedById.get(rowKey(row))
    const changedKeys = []
    if (computed) {
      for (const key of STICKY_ROW_KEYS) {
        if (!valuesEqual(row[key], computed[key])) changedKeys.push(key)
      }
    }
    return { ...row, changedKeys }
  })
}

export const mergeStickyRowOverrides = (computedRows, previousRows) => {
  const prevById = indexByRequestId(previousRows)
  return (Array.isArray(computedRows) ? computedRows : []).map((row) => {
    const prev = prevById.get(rowKey(row))
    if (!prev) return { ...row, changedKeys: [] }

    const changedKeys = (Array.isArray(prev.changedKeys) ? prev.changedKeys : [])
      .filter((key) => STICKY_ROW_KEYS.includes(key))

    const merged = { ...row, changedKeys }
    for (const key of changedKeys) {
      if (prev[key] !== undefined) merged[key] = prev[key]
    }

    if (
      (changedKeys.includes("totalLivingCost") ||
        changedKeys.includes("totalMealCost")) &&
      !changedKeys.includes("totalDebt")
    ) {
      merged.totalDebt =
        (Number(merged.totalMealCost) || 0) +
        (Number(merged.totalLivingCost) || 0)
    }

    return merged
  })
}

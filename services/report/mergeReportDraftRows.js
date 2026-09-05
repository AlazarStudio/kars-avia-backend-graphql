export const STICKY_ROW_KEYS = [
  "arrival",
  "departure",
  "totalDays",
  "category",
  "personName",
  "personPosition",
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
    const { changedKeys, changedFrom, ...rest } = row || {}
    return rest
  })

// Рядом с каждым изменившимся ключом — значение из свежего расчёта, строкой:
// фронт показывает его подсказкой «что было» и умеет откатить одно поле.
const changedFromEntry = (computed, key) => ({
  key,
  value: computed[key] == null ? null : String(computed[key])
})

export const detectChangedKeys = (computedRows, incomingRows) => {
  const computedById = indexByRequestId(computedRows)
  return (Array.isArray(incomingRows) ? incomingRows : []).map((row) => {
    const computed = computedById.get(rowKey(row))
    const changedKeys = []
    const changedFrom = []
    if (computed) {
      for (const key of STICKY_ROW_KEYS) {
        if (!valuesEqual(row[key], computed[key])) {
          changedKeys.push(key)
          changedFrom.push(changedFromEntry(computed, key))
        }
      }
    }
    return { ...row, changedKeys, changedFrom }
  })
}

export const mergeStickyRowOverrides = (computedRows, previousRows) => {
  const prevById = indexByRequestId(previousRows)
  const consumedKeys = new Set()
  const merged = (Array.isArray(computedRows) ? computedRows : []).map((row) => {
    const prev = prevById.get(rowKey(row))
    if (!prev) return { ...row, changedKeys: [], changedFrom: [] }
    consumedKeys.add(rowKey(row))

    // Замороженная строка не пересобирается ВООБЩЕ: все значения остаются
    // прежними, свежий расчёт для неё лишь фон. changedKeys при этом честно
    // показывают, чем удержанные значения отличаются от свежего расчёта —
    // та же семантика подсветки «расходится с расчётом сервера», что и у
    // обычной слитой правки.
    if (prev.frozen) {
      const out = { ...row, frozen: true }
      const changedKeys = []
      const changedFrom = []
      for (const key of STICKY_ROW_KEYS) {
        if (prev[key] !== undefined) out[key] = prev[key]
        if (!valuesEqual(out[key], row[key])) {
          changedKeys.push(key)
          changedFrom.push(changedFromEntry(row, key))
        }
      }
      out.changedKeys = changedKeys
      out.changedFrom = changedFrom
      return out
    }

    const changedKeys = (Array.isArray(prev.changedKeys) ? prev.changedKeys : [])
      .filter((key) => STICKY_ROW_KEYS.includes(key))

    const out = {
      ...row,
      changedKeys,
      changedFrom: changedKeys.map((key) => changedFromEntry(row, key))
    }
    for (const key of changedKeys) {
      if (prev[key] !== undefined) out[key] = prev[key]
    }

    if (
      (changedKeys.includes("totalLivingCost") ||
        changedKeys.includes("totalMealCost")) &&
      !changedKeys.includes("totalDebt")
    ) {
      out.totalDebt =
        (Number(out.totalMealCost) || 0) +
        (Number(out.totalLivingCost) || 0)
    }

    return out
  })

  // Замороженные строки, которых в свежем расчёте больше нет (человек ушёл из
  // заявок периода), не выбрасываются — «заморожена» значит переживает любое
  // пересоздание. index сбрасывается: normalizeReportDraftRows дономерует их
  // в хвосте, иначе остался бы старый номер и в списке появились дубли.
  const leftoverFrozen = (Array.isArray(previousRows) ? previousRows : []).filter(
    (row) => row?.frozen && rowKey(row) && !consumedKeys.has(rowKey(row))
  )
  return [
    ...merged,
    ...leftoverFrozen.map((row) => ({ ...row, index: null }))
  ]
}

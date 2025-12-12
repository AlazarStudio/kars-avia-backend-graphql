// exports/computeRoomShareMatrix.js
// Делит стоимость проживания по «ночам» внутри комнаты между всеми проживающими в эту ночь.
// Вход: reportRows из aggregateRequestReports (arrival/dep в формате "DD.MM.YYYY HH:mm:ss").
// Выход: { rows, debug } — rows уже с пересчитанными totalLivingCost/totalDebt и shareNote.

const parseDDMMYYYY_HHMMSS = (str) => {
  if (!str) return new Date(NaN)
  const [datePart, timePart = "00:00:00"] = String(str).trim().split(" ")
  const [dd, mm, yyyy] = datePart.split(".").map(Number)
  const [hh, mi, ss] = timePart.split(":").map(Number)
  return new Date(yyyy, (mm || 1) - 1, dd || 1, hh || 0, mi || 0, ss || 0)
}
const startOfServiceDay = (dt, serviceDayHour = 12) => {
  const d = new Date(dt)
  d.setHours(serviceDayHour, 0, 0, 0)
  return d
}
const addDays = (dt, n) => {
  const d = new Date(dt)
  d.setDate(d.getDate() + n)
  return d
}
/** Ночи — интервалы [12:00; 12:00) по умолчанию */
const listServiceNights = (start, end, serviceDayHour = 12) => {
  const nights = []
  let cur = startOfServiceDay(start, serviceDayHour)
  if (start < cur) cur = addDays(cur, -1)
  const last = startOfServiceDay(end, serviceDayHour)
  while (cur < last) {
    nights.push(new Date(cur))
    cur = addDays(cur, 1)
  }
  return nights
}
const toRu = (d) => {
  const dd = String(d.getDate()).padStart(2, "0")
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const yy = d.getFullYear()
  return `${dd}.${mm}.${yy}`
}

export function computeRoomShareMatrix(
  reportRows,
  {
    mode = "shared_equal", // "shared_equal" | "shared_proportional" | "owner"
    serviceDayHour = 12,
    filterStart = null, // Date | null
    filterEnd = null // Date | null
  } = {}
) {
  const rows = (reportRows || []).map((r) => ({ ...r }))

  // подготовим служебные даты
  rows.forEach((r) => {
    r.__arrival = parseDDMMYYYY_HHMMSS(r.arrival)
    r.__departure = parseDDMMYYYY_HHMMSS(r.departure)
    if (isNaN(r.__arrival)) r.__arrival = new Date(0)
    if (isNaN(r.__departure)) r.__departure = new Date(0)
  })

  // глобальный срез
  let globalStart = filterStart instanceof Date ? filterStart : null
  let globalEnd = filterEnd instanceof Date ? filterEnd : null
  if (!globalStart) {
    globalStart =
      rows.reduce((m, r) => (!m || r.__arrival < m ? r.__arrival : m), null) ||
      new Date()
  }
  if (!globalEnd) {
    globalEnd =
      rows.reduce(
        (m, r) => (!m || r.__departure > m ? r.__departure : m),
        null
      ) || new Date()
  }

  // группируем по комнате
  const groups = {}
  rows.forEach((r, i) => {
    const key = r.roomId || `${r.roomName || "room"}_${r.hotelName || ""}_${i}`
    ;(groups[key] ||= []).push(r)
  })

  const ownedDaysMap = {} // id -> float
  const companionsTimeline = new Map() // id -> [{start,end,comp:string[]}]

  const nightDebugMap = {}

  Object.entries(groups).forEach(([roomKey, group]) => {
    // клип к срезу
    group.forEach((r) => {
      r.__effArr =
        r.__arrival < globalStart
          ? new Date(globalStart)
          : new Date(r.__arrival)
      r.__effDep =
        r.__departure > globalEnd
          ? new Date(globalEnd)
          : new Date(r.__departure)
    })

    // общий диапазон комнаты
    const minArr =
      group.reduce((m, r) => (!m || r.__effArr < m ? r.__effArr : m), null) ||
      globalStart
    const maxDep =
      group.reduce((m, r) => (!m || r.__effDep > m ? r.__effDep : m), null) ||
      globalEnd

    const nights = listServiceNights(minArr, maxDep, serviceDayHour)
    nightDebugMap[roomKey] = []

    nights.forEach((nightStart) => {
      const nightEnd = addDays(nightStart, 1)
      const covering = group.filter(
        (r) => r.__effArr < nightEnd && r.__effDep > nightStart
      )
      if (!covering.length) return

      // фиксируем «кто с кем» по ночам для примечания
      const names = covering.map((x) => x.personName || "").sort()
      covering.forEach((r) => {
        const comp = names.filter((n) => n && n !== r.personName)
        const arr = companionsTimeline.get(r.id) || []
        arr.push({ start: new Date(nightStart), end: new Date(nightEnd), comp })
        companionsTimeline.set(r.id, arr)
      })

      if (mode === "owner") {
        covering.sort((a, b) => a.__effArr - b.__effArr)
        const owner = covering[0]
        ownedDaysMap[owner.id] = (ownedDaysMap[owner.id] || 0) + 1
        nightDebugMap[roomKey].push({
          nightStart,
          nightEnd,
          mode: "owner",
          allocated: [{ id: owner.id, share: 1 }]
        })
      } else if (mode === "shared_proportional") {
        const overlaps = covering.map((r) => {
          const s = r.__effArr > nightStart ? r.__effArr : nightStart
          const e = r.__effDep < nightEnd ? r.__effDep : nightEnd
          return { r, ms: Math.max(0, e - s) }
        })
        const total = overlaps.reduce((a, o) => a + o.ms, 0) || 1
        overlaps.forEach((o) => {
          const share = o.ms / total
          ownedDaysMap[o.r.id] = (ownedDaysMap[o.r.id] || 0) + share
        })
        nightDebugMap[roomKey].push({
          nightStart,
          nightEnd,
          mode: "shared_proportional"
        })
      } else {
        // shared_equal
        const share = 1 / covering.length
        covering.forEach((r) => {
          ownedDaysMap[r.id] = (ownedDaysMap[r.id] || 0) + share
        })
        nightDebugMap[roomKey].push({
          nightStart,
          nightEnd,
          mode: "shared_equal"
        })
      }
    })
  })

  // build shareNote по непрерывным сегментам с одинаковым составом
  const buildShareNote = (id) => {
    const items = (companionsTimeline.get(id) || []).sort(
      (a, b) => a.start - b.start
    )
    if (!items.length) return ""
    const eq = (a, b) => a.length === b.length && a.every((v, i) => v === b[i])

    const segs = []
    let curStart = items[0].start
    let curEnd = items[0].end
    let curComp = items[0].comp

    for (let i = 1; i < items.length; i++) {
      const it = items[i]
      if (eq(curComp, it.comp) && +it.start === +curEnd) {
        curEnd = it.end // сливаем смежные ночи
      } else {
        segs.push({ start: curStart, end: curEnd, comp: curComp })
        curStart = it.start
        curEnd = it.end
        curComp = it.comp
      }
    }
    segs.push({ start: curStart, end: curEnd, comp: curComp })

    return segs
      .map((s) => {
        const A = toRu(s.start),
          B = toRu(addDays(s.end, -1))
        if (!s.comp.length) return `с ${A} по ${B} жил один`
        if (s.comp.length === 1) return `с ${A} по ${B} жил с ${s.comp[0]}`
        return `с ${A} по ${B} жил с: ${s.comp.join(", ")}`
      })
      .join(", ")
  }

  // финализация строк
  const res = rows.map((r) => {
    const owned = +(ownedDaysMap[r.id] || 0) // «владение ночами»
    const denom = +r.totalDays ? +r.totalDays : 1
    const pricePerDay = (+r.totalLivingCost || 0) / denom // исходная дневная ставка

    const newLiving = Math.round(owned * pricePerDay * 100) / 100
    const totalMeal = Number(r.totalMealCost) || 0

    return {
      ...r,
      ownedDays: Math.round(owned * 100) / 100,
      totalLivingCost: newLiving,
      totalDebt: Math.round((newLiving + totalMeal) * 100) / 100,
      shareNote: buildShareNote(r.id)
    }
  })

  return { rows: res, debug: { nightDebugMap } }
}

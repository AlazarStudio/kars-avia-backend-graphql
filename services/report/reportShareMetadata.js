const parseLocalDT = (s) => {
  if (!s) return null
  const m = String(s).match(
    /^(\d{2})\.(\d{2})\.(\d{4})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/
  )
  if (!m) return null
  const [, dd, MM, yyyy, hh, mm, ss = "0"] = m
  return new Date(+yyyy, +MM - 1, +dd, +hh, +mm, +ss)
}

const formatLocal = (d) => {
  const pad = (n) => String(n).padStart(2, "0")
  return `${pad(d.getDate())}.${pad(
    d.getMonth() + 1
  )}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`
}

const findOverlapClusters = (guests) => {
  if (!guests.length) return []
  const assigned = new Set()
  const clusters = []

  for (let i = 0; i < guests.length; i++) {
    if (assigned.has(i)) continue
    const cluster = [i]
    assigned.add(i)

    let changed = true
    while (changed) {
      changed = false
      for (let j = 0; j < guests.length; j++) {
        if (assigned.has(j)) continue
        const cand = guests[j]
        const overlaps = cluster.some((idx) => {
          const g = guests[idx]
          return (
            g.arrivalTS < cand.departureTS && g.departureTS > cand.arrivalTS
          )
        })
        if (overlaps) {
          cluster.push(j)
          assigned.add(j)
          changed = true
        }
      }
    }

    clusters.push(cluster.map((idx) => guests[idx]))
  }

  return clusters
}

const buildShareSegmentsForGuest = (guest, validGuests) => {
  if (!guest.arrivalTS || !guest.departureTS) return []

  const others = validGuests
    .filter(
      (g) =>
        g !== guest &&
        g.arrivalTS < guest.departureTS &&
        g.departureTS > guest.arrivalTS
    )
    .sort((a, b) => a.arrivalTS - b.arrivalTS)

  if (!others.length) {
    return [
      {
        start: formatLocal(guest.arrivalTS),
        end: formatLocal(guest.departureTS),
        alone: true,
        cohabitants: []
      }
    ]
  }

  const segments = []
  for (const other of others) {
    const start = new Date(Math.max(+guest.arrivalTS, +other.arrivalTS))
    const end = new Date(Math.min(+guest.departureTS, +other.departureTS))
    if (start < end) {
      segments.push({
        start: formatLocal(start),
        end: formatLocal(end),
        alone: false,
        cohabitants: [
          {
            requestId: other.requestId || other.id || null,
            personName: other.personName || ""
          }
        ]
      })
    }
  }

  return segments
}

const buildShareNoteFromSegments = (segments) => {
  if (!segments.length) return ""
  if (segments.length === 1 && segments[0].alone) {
    return `с ${segments[0].start} по ${segments[0].end} жил один`
  }
  return segments
    .map((s) => {
      if (s.alone) return `с ${s.start} по ${s.end} жил один`
      const names = s.cohabitants.map((c) => c.personName).filter(Boolean)
      return `с ${s.start} по ${s.end} жил с ${names.join(", ")}`
    })
    .join(", ")
}

const buildShareClusterId = (roomGroupId, cluster) => {
  const ids = cluster
    .map((g) => g.requestId || g.id || g.personName || "")
    .sort()
    .join("|")
  return `${roomGroupId}::${ids}`
}

export const enrichRowsWithShareMetadata = (rows) => {
  if (!Array.isArray(rows) || !rows.length) return []

  const bookings = rows.map((r, sourceIndex) => ({
    ...r,
    sourceIndex,
    requestId: r.requestId ?? r.id ?? null,
    arrivalTS: parseLocalDT(r.arrival),
    departureTS: parseLocalDT(r.departure)
  }))

  const rooms = new Map()
  let soloIndex = 0
  for (const b of bookings) {
    const roomGroupId = b.roomId ? String(b.roomId) : `__solo_${soloIndex++}`
    if (!rooms.has(roomGroupId)) rooms.set(roomGroupId, [])
    rooms.get(roomGroupId).push(b)
  }

  const metaBySourceIndex = new Map()

  for (const [roomGroupId, guests] of rooms.entries()) {
    const valid = guests.filter(
      (g) => g.arrivalTS && g.departureTS && g.arrivalTS < g.departureTS
    )
    const clusters = findOverlapClusters(valid)

    for (const cluster of clusters) {
      const shareClusterId = buildShareClusterId(roomGroupId, cluster)
      for (const guest of cluster) {
        const shareSegments = buildShareSegmentsForGuest(guest, valid)
        metaBySourceIndex.set(guest.sourceIndex, {
          roomGroupId,
          shareClusterId,
          shareSegments,
          shareNote: buildShareNoteFromSegments(shareSegments)
        })
      }
    }

    for (const guest of guests) {
      if (metaBySourceIndex.has(guest.sourceIndex)) continue
      metaBySourceIndex.set(guest.sourceIndex, {
        roomGroupId,
        shareClusterId: `${roomGroupId}::invalid`,
        shareSegments: [],
        shareNote: guest.shareNote || ""
      })
    }
  }

  return rows.map((row, i) => {
    const meta = metaBySourceIndex.get(i) || {
      roomGroupId: row.roomId ? String(row.roomId) : `__solo_${i}`,
      shareClusterId: null,
      shareSegments: row.shareSegments || [],
      shareNote: row.shareNote || ""
    }
    return {
      ...row,
      requestId: row.requestId ?? row.id ?? null,
      roomGroupId: meta.roomGroupId,
      shareClusterId: meta.shareClusterId,
      shareSegments: meta.shareSegments,
      shareNote: meta.shareNote || row.shareNote || ""
    }
  })
}

export const recomputeReportDraftShareMetadata = (rows) =>
  enrichRowsWithShareMetadata(rows)

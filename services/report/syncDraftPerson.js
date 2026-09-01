import { prisma } from "../../prisma.js"
import { recomputeReportDraftShareMetadata } from "./reportShareMetadata.js"

const OPEN_DRAFT_STATUSES = ["DRAFT", "SUBMITTED"]

const applyPersonToRows = (rows, requestId, personName, personPosition) => {
  let changed = false
  const next = (Array.isArray(rows) ? rows : []).map((row) => {
    let nextRow = row
    if (row?.requestId === requestId) {
      if (
        row.personName !== personName ||
        row.personPosition !== personPosition
      ) {
        nextRow = {
          ...row,
          personName,
          personPosition
        }
        changed = true
      }
    }

    const segments = nextRow?.shareSegments
    if (!Array.isArray(segments) || !segments.length) return nextRow

    let segmentsChanged = false
    const nextSegments = segments.map((seg) => {
      const cohabitants = Array.isArray(seg.cohabitants) ? seg.cohabitants : []
      let cohortChanged = false
      const nextCohabitants = cohabitants.map((c) => {
        if (c?.requestId === requestId && c.personName !== personName) {
          cohortChanged = true
          return { ...c, personName }
        }
        return c
      })
      if (!cohortChanged) return seg
      segmentsChanged = true
      return { ...seg, cohabitants: nextCohabitants }
    })

    if (!segmentsChanged) return nextRow
    changed = true
    return { ...nextRow, shareSegments: nextSegments }
  })

  return { rows: next, changed }
}

export const syncPersonInReportDrafts = async ({
  requestId,
  personName,
  personPosition,
  airlineId,
  hotelId
}) => {
  if (!requestId) return 0

  const or = []
  if (airlineId) or.push({ airlineId })
  if (hotelId) or.push({ hotelId })

  const drafts = await prisma.reportDraft.findMany({
    where: {
      status: { in: OPEN_DRAFT_STATUSES },
      ...(or.length ? { OR: or } : {})
    }
  })

  let updated = 0
  for (const draft of drafts) {
    const { rows, changed } = applyPersonToRows(
      draft.rows,
      requestId,
      personName || "Не указано",
      personPosition || "Не указано"
    )
    if (!changed) continue
    await prisma.reportDraft.update({
      where: { id: draft.id },
      data: { rows: recomputeReportDraftShareMetadata(rows) }
    })
    updated += 1
  }
  return updated
}

export { applyPersonToRows }

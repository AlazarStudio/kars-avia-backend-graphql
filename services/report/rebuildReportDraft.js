import {
  buildAirlineReportData,
  buildHotelReportData,
  normalizeReportDraftRows
} from "./buildReportData.js"
import {
  detectChangedKeys,
  mergeStickyRowOverrides,
  stripChangedKeys
} from "./mergeReportDraftRows.js"

export const snapshotFromDraft = (draft) => draft.filterJson || {}

export const filterFromDraft = (draft) => {
  const snap = snapshotFromDraft(draft)
  return {
    startDate: snap.startDate || draft.startDate,
    endDate: snap.endDate || draft.endDate,
    airlineId: snap.airlineId || draft.airlineId,
    hotelId: snap.hotelId || draft.hotelId,
    airportId: snap.airportId || null,
    personId: snap.personId || null,
    positionId: snap.positionId || null,
    position: snap.position || null,
    region: snap.region || null,
    passengersReport: snap.passengersReport || false
  }
}

export const buildLiveDraftRows = async (draft) => {
  const filter = filterFromDraft(draft)
  const built =
    draft.type === "AIRLINE"
      ? await buildAirlineReportData(filter)
      : await buildHotelReportData(filter)
  return normalizeReportDraftRows(built.rows)
}

export const markDraftRowChanges = (computedRows, incomingRows) =>
  normalizeReportDraftRows(detectChangedKeys(computedRows, incomingRows))

export const recreateDraftRows = (computedRows, previousRows) =>
  normalizeReportDraftRows(
    mergeStickyRowOverrides(computedRows, previousRows)
  )

export const snapshotComputedRows = (rows) =>
  stripChangedKeys(normalizeReportDraftRows(rows))

import test from "node:test"
import assert from "node:assert/strict"
import {
  intervalsOverlap,
  normalizePlace,
  buildHotelChessOverlapWhere
} from "../../services/rooms/overlapUtils.js"
import { formatOverlapErrorMessage } from "../../services/rooms/ensureNoOverlap.js"

const roomId = "room-1"
const start = new Date("2025-06-10T14:00:00.000Z")
const end = new Date("2025-06-15T12:00:00.000Z")

test("intervalsOverlap: partial overlap", () => {
  assert.equal(
    intervalsOverlap(
      "2025-06-10",
      "2025-06-15",
      "2025-06-12",
      "2025-06-20"
    ),
    true
  )
})

test("intervalsOverlap: enclosing interval is detected", () => {
  assert.equal(
    intervalsOverlap(
      "2025-06-01",
      "2025-06-30",
      "2025-06-10",
      "2025-06-15"
    ),
    true
  )
})

test("intervalsOverlap: adjacent checkout/checkin does not overlap", () => {
  assert.equal(
    intervalsOverlap(
      "2025-06-10",
      "2025-06-15",
      "2025-06-15",
      "2025-06-20"
    ),
    false
  )
})

test("normalizePlace: valid and invalid values", () => {
  assert.equal(normalizePlace(2), 2)
  assert.equal(normalizePlace("2"), 2)
  assert.equal(normalizePlace(null), null)
  assert.equal(normalizePlace(undefined), null)
  assert.equal(normalizePlace(0), null)
})

test("buildHotelChessOverlapWhere: place 2 does not filter place 1 only", () => {
  const where = buildHotelChessOverlapWhere({
    roomId,
    start,
    end,
    place: 2
  })
  assert.deepEqual(where.OR, [{ place: 2 }, { place: null }])
  assert.equal(where.roomId, roomId)
  assert.ok(where.start.lt)
  assert.ok(where.end.gt)
})

test("buildHotelChessOverlapWhere: no place means whole room", () => {
  const where = buildHotelChessOverlapWhere({
    roomId,
    start,
    end,
    place: null
  })
  assert.equal(where.OR, undefined)
})

test("buildHotelChessOverlapWhere: excludeId", () => {
  const where = buildHotelChessOverlapWhere({
    roomId,
    start,
    end,
    place: 1,
    excludeId: "chess-self"
  })
  assert.deepEqual(where.id, { not: "chess-self" })
})

test("formatOverlapErrorMessage uses requestNumber and room name", () => {
  const msg = formatOverlapErrorMessage({
    start: new Date("2025-06-10T14:00:00.000Z"),
    end: new Date("2025-06-15T12:00:00.000Z"),
    place: 1,
    request: { requestNumber: "REQ-42" },
    room: { name: "101" }
  })
  assert.match(msg, /заявкой №REQ-42/)
  assert.match(msg, /номере «101»/)
  assert.match(msg, /место 1/)
})

test("formatOverlapErrorMessage: whole room occupancy label", () => {
  const msg = formatOverlapErrorMessage({
    start: new Date("2025-06-10T14:00:00.000Z"),
    end: new Date("2025-06-15T12:00:00.000Z"),
    place: null,
    request: null,
    room: { name: "202" }
  })
  assert.match(msg, /другой записью шахматки/)
  assert.match(msg, /место весь номер/)
})

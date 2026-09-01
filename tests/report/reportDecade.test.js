import test from "node:test"
import assert from "node:assert/strict"
import {
  getDecadeRange,
  getPreviousDecadeRange,
  getArchiveThreshold,
  isPastArchiveThreshold
} from "../../services/report/reportDecade.js"

test("27 августа — третья декада 21–31", () => {
  const range = getDecadeRange(new Date(2026, 7, 27, 14, 0, 0))
  assert.equal(range.start.getDate(), 21)
  assert.equal(range.start.getMonth(), 7)
  assert.equal(range.end.getDate(), 31)
  assert.equal(range.end.getMonth(), 7)
})

test("5 августа — первая декада 1–10", () => {
  const range = getDecadeRange(new Date(2026, 7, 5))
  assert.equal(range.start.getDate(), 1)
  assert.equal(range.end.getDate(), 10)
})

test("15 августа — вторая декада 11–20", () => {
  const range = getDecadeRange(new Date(2026, 7, 15))
  assert.equal(range.start.getDate(), 11)
  assert.equal(range.end.getDate(), 20)
})

test("предыдущая декада от 27 августа — 11–20 августа", () => {
  const prev = getPreviousDecadeRange(new Date(2026, 7, 27))
  assert.equal(prev.start.getDate(), 11)
  assert.equal(prev.end.getDate(), 20)
})

test("предыдущая декада от 5 августа — 21–31 июля", () => {
  const prev = getPreviousDecadeRange(new Date(2026, 7, 5))
  assert.equal(prev.start.getMonth(), 6)
  assert.equal(prev.start.getDate(), 21)
  assert.equal(prev.end.getDate(), 31)
})

test("порог архива 27 августа — начало 11 августа", () => {
  const threshold = getArchiveThreshold(new Date(2026, 7, 27))
  assert.equal(threshold.getFullYear(), 2026)
  assert.equal(threshold.getMonth(), 7)
  assert.equal(threshold.getDate(), 11)
})

test("отчёт за первую декаду августа архивируется 27 августа", () => {
  const now = new Date(2026, 7, 27)
  assert.equal(isPastArchiveThreshold(new Date(2026, 7, 10, 23, 59, 59), now), true)
  assert.equal(isPastArchiveThreshold(new Date(2026, 7, 11, 0, 0, 0), now), false)
  assert.equal(isPastArchiveThreshold(new Date(2026, 7, 31), now), false)
})

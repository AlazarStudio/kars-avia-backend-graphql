import test from "node:test"
import assert from "node:assert/strict"
import {
  DEFAULT_AUTO_SYNC_HOURS,
  isAutoSyncDue,
  normalizeAutoSyncHours
} from "../../services/travelline/autoSyncSchedule.js"

const H = 60 * 60 * 1000
const NOW = Date.parse("2026-08-31T12:00:00.000Z")
const ago = (ms) => new Date(NOW - ms).toISOString()

test("normalizeAutoSyncHours: мусор и нули дают дефолт", () => {
  assert.equal(normalizeAutoSyncHours(undefined), DEFAULT_AUTO_SYNC_HOURS)
  assert.equal(normalizeAutoSyncHours(null), DEFAULT_AUTO_SYNC_HOURS)
  assert.equal(normalizeAutoSyncHours("abc"), DEFAULT_AUTO_SYNC_HOURS)
  assert.equal(normalizeAutoSyncHours(0), DEFAULT_AUTO_SYNC_HOURS)
  assert.equal(normalizeAutoSyncHours(-5), DEFAULT_AUTO_SYNC_HOURS)
})

test("normalizeAutoSyncHours: клампит в [1, 168] и читает строки из настроек", () => {
  assert.equal(normalizeAutoSyncHours(0.2), 1)
  assert.equal(normalizeAutoSyncHours(500), 168)
  assert.equal(normalizeAutoSyncHours("6"), 6)
})

test("не синхронизировались ни разу — не пора (первичную делает фронт)", () => {
  assert.equal(isAutoSyncDue({ lastSyncAt: null, autoSyncHours: 24, now: NOW }), false)
  assert.equal(isAutoSyncDue({ lastSyncAt: "не дата", autoSyncHours: 24, now: NOW }), false)
})

test("интервал не истёк — не пора", () => {
  assert.equal(isAutoSyncDue({ lastSyncAt: ago(23 * H), autoSyncHours: 24, now: NOW }), false)
})

test("интервал истёк — пора", () => {
  assert.equal(isAutoSyncDue({ lastSyncAt: ago(24 * H), autoSyncHours: 24, now: NOW }), true)
  assert.equal(isAutoSyncDue({ lastSyncAt: ago(72 * H), autoSyncHours: 24, now: NOW }), true)
})

test("допуск тика не даёт округлить интервал вверх до следующего тика", () => {
  // тик 5 мин, допуск 2.5 мин: осталось 2 мин — считаем, что пора,
  // иначе синхронизация уехала бы ещё на целый шаг планировщика
  const almost = ago(24 * H - 2 * 60 * 1000)
  assert.equal(isAutoSyncDue({ lastSyncAt: almost, autoSyncHours: 24, now: NOW }), false)
  assert.equal(
    isAutoSyncDue({ lastSyncAt: almost, autoSyncHours: 24, now: NOW, toleranceMs: 150_000 }),
    true
  )
})

test("допуск не превращает свежую синхронизацию в просроченную", () => {
  assert.equal(
    isAutoSyncDue({ lastSyncAt: ago(H), autoSyncHours: 24, now: NOW, toleranceMs: 150_000 }),
    false
  )
})

test("интервал из настроек уважается, а не только дефолтные 24 ч", () => {
  assert.equal(isAutoSyncDue({ lastSyncAt: ago(90 * 60_000), autoSyncHours: 1, now: NOW }), true)
  assert.equal(isAutoSyncDue({ lastSyncAt: ago(90 * 60_000), autoSyncHours: 6, now: NOW }), false)
})

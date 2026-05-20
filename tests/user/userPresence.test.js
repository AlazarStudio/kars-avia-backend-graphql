import test from "node:test"
import assert from "node:assert/strict"
import {
  buildOfflineUpdateData,
  buildOnlineRestoreData,
  isLastSeenStale,
  resolveUserOnlineStatus
} from "../../services/user/userPresenceUtils.js"

test("isLastSeenStale returns true when lastSeen is missing", () => {
  const now = new Date("2026-05-19T12:00:00.000Z")
  assert.equal(isLastSeenStale(null, now, 60_000), true)
})

test("isLastSeenStale returns false within timeout window", () => {
  const now = new Date("2026-05-19T12:10:00.000Z")
  const lastSeen = new Date("2026-05-19T12:05:00.000Z")
  assert.equal(isLastSeenStale(lastSeen, now, 10 * 60 * 1000), false)
})

test("isLastSeenStale returns true after timeout window", () => {
  const now = new Date("2026-05-19T12:11:01.000Z")
  const lastSeen = new Date("2026-05-19T12:00:00.000Z")
  assert.equal(isLastSeenStale(lastSeen, now, 10 * 60 * 1000), true)
})

test("buildOnlineRestoreData sets online flags and starts session when missing", () => {
  const now = new Date("2026-05-19T10:00:00.000Z")

  const withoutSession = buildOnlineRestoreData({ sessionStartedAt: null, now })
  assert.equal(withoutSession.isOnline, true)
  assert.equal(withoutSession.lastSeen, now)
  assert.equal(withoutSession.sessionStartedAt, now)

  const existingSession = new Date("2026-05-19T09:00:00.000Z")
  const withSession = buildOnlineRestoreData({
    sessionStartedAt: existingSession,
    now
  })
  assert.equal(withSession.sessionStartedAt, existingSession)
})

test("buildOfflineUpdateData closes session and resets flags", () => {
  const now = new Date("2026-05-19T15:30:00.000Z")
  const sessionStartedAt = new Date("2026-05-19T14:00:00.000Z")

  const data = buildOfflineUpdateData({
    currentUser: {
      sessionStartedAt,
      totalTimeMinutes: 10,
      dailyTimeStats: []
    },
    now
  })

  assert.equal(data.isOnline, false)
  assert.equal(data.sessionStartedAt, null)
  assert.equal(data.lastSeen, now)
  assert.equal(data.totalTimeMinutes, 100)
  assert.ok(Array.isArray(data.dailyTimeStats))
})

test("resolveUserOnlineStatus uses isOnline and lastSeen grace", () => {
  const now = new Date("2026-05-19T12:05:00.000Z")
  const lastSeen = new Date("2026-05-19T12:00:00.000Z")

  assert.equal(
    resolveUserOnlineStatus({ isOnline: true, lastSeen, now }),
    true
  )
  assert.equal(
    resolveUserOnlineStatus({ isOnline: false, lastSeen, now }),
    true
  )
  assert.equal(
    resolveUserOnlineStatus({
      isOnline: false,
      lastSeen: new Date("2026-05-19T11:00:00.000Z"),
      now
    }),
    false
  )
})

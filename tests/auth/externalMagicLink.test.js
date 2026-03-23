import test from "node:test"
import assert from "node:assert/strict"
import {
  createMagicLinkTokenPair,
  evaluateMagicLinkRequestLimits,
  hashMagicLinkToken,
  nextSessionExpiry,
  validateMagicLinkRecord
} from "../../services/auth/externalMagicLink.js"
import { buildExternalMagicLink } from "../../services/auth/sendExternalMagicLinkEmail.js"

test("external magic link: valid record passes validation", () => {
  const now = new Date("2026-03-06T10:00:00.000Z")
  const { rawToken, tokenHash } = createMagicLinkTokenPair()
  const record = {
    tokenHash,
    usedAt: null,
    expiresAt: new Date("2026-03-06T10:30:00.000Z")
  }

  const result = validateMagicLinkRecord({ record, rawToken, now })
  assert.equal(result.valid, true)
  assert.equal(result.reason, null)
})

test("external magic link: tampered token is rejected", () => {
  const now = new Date("2026-03-06T10:00:00.000Z")
  const record = {
    tokenHash: hashMagicLinkToken("good-token"),
    usedAt: null,
    expiresAt: new Date("2026-03-06T10:30:00.000Z")
  }

  const result = validateMagicLinkRecord({
    record,
    rawToken: "bad-token",
    now
  })
  assert.equal(result.valid, false)
  assert.equal(result.reason, "TOKEN_MISMATCH")
})

test("external magic link: expired and reused states are rejected", () => {
  const now = new Date("2026-03-06T10:00:00.000Z")
  const { rawToken, tokenHash } = createMagicLinkTokenPair()

  const expired = validateMagicLinkRecord({
    record: {
      tokenHash,
      usedAt: null,
      expiresAt: new Date("2026-03-06T09:59:59.000Z")
    },
    rawToken,
    now
  })
  assert.equal(expired.valid, false)
  assert.equal(expired.reason, "EXPIRED")

  const used = validateMagicLinkRecord({
    record: {
      tokenHash,
      usedAt: new Date("2026-03-06T09:55:00.000Z"),
      expiresAt: new Date("2026-03-06T10:30:00.000Z")
    },
    rawToken,
    now
  })
  assert.equal(used.valid, false)
  assert.equal(used.reason, "ALREADY_USED")
})

test("external magic link: issue limits block frequent and hourly overflow", () => {
  const now = new Date("2026-03-06T10:00:00.000Z")

  const tooFrequent = evaluateMagicLinkRequestLimits({
    now,
    latestToken: { createdAt: new Date("2026-03-06T09:59:30.000Z") },
    issuedInLastHour: 1
  })
  assert.equal(tooFrequent.allowed, false)
  assert.equal(tooFrequent.reason, "TOO_FREQUENT")

  const tooManyPerHour = evaluateMagicLinkRequestLimits({
    now,
    latestToken: null,
    issuedInLastHour: 5
  })
  assert.equal(tooManyPerHour.allowed, false)
  assert.equal(tooManyPerHour.reason, "TOO_MANY_PER_HOUR")
})

test("external session extension: adds 48h from max(now, session)", () => {
  const now = new Date("2026-03-06T10:00:00.000Z")
  const future = new Date("2026-03-06T12:00:00.000Z")

  const fromNow = nextSessionExpiry(null, now)
  assert.equal(fromNow.toISOString(), "2026-03-08T10:00:00.000Z")

  const fromFuture = nextSessionExpiry(future, now)
  assert.equal(fromFuture.toISOString(), "2026-03-08T12:00:00.000Z")
})

test("external magic link builder: includes kind and token", () => {
  const link = buildExternalMagicLink({
    token: "abc123",
    kind: "EXTERNAL_USER"
  })

  assert.match(link, /token=abc123/)
  assert.match(link, /kind=EXTERNAL_USER/)
})

// Повтор уже использованной магик-ссылки. Раньше ветка ALREADY_USED отдавала
// действующую сессию владельца без ограничения по времени: утёкшая ссылка
// входила под владельцем, пока жива его сессия. Теперь — только в коротком
// окне после первого входа (двойной клик, префетч).

import test from "node:test"
import assert from "node:assert/strict"
import resolver, {
  ALREADY_USED_GRACE_MS,
  canReuseSessionForUsedLink
} from "../../resolvers/externalAuth/externalAuth.resolver.js"
import {
  createMagicLinkTokenPair
} from "../../services/auth/externalMagicLink.js"
import { installPrismaDouble } from "../helpers/prismaDouble.js"

const NOW = new Date("2026-10-02T10:00:00.000Z")

const activeUser = (overrides = {}) => ({
  id: "ext-1",
  active: true,
  refreshToken: "session-owner",
  sessionExpiresAt: new Date(NOW.getTime() + 24 * 60 * 60 * 1000),
  ...overrides
})

const usedRecord = ({ usedAgoMs, externalUser = activeUser() }) => ({
  usedAt: new Date(NOW.getTime() - usedAgoMs),
  externalUser
})

test("used link: session is returned within the grace window", () => {
  assert.equal(
    canReuseSessionForUsedLink({ record: usedRecord({ usedAgoMs: 5_000 }), now: NOW }),
    true
  )
  assert.equal(
    canReuseSessionForUsedLink({
      record: usedRecord({ usedAgoMs: ALREADY_USED_GRACE_MS }),
      now: NOW
    }),
    true
  )
})

test("used link: outside the grace window session is not returned", () => {
  assert.equal(
    canReuseSessionForUsedLink({
      record: usedRecord({ usedAgoMs: ALREADY_USED_GRACE_MS + 1 }),
      now: NOW
    }),
    false
  )
  assert.equal(
    canReuseSessionForUsedLink({
      record: usedRecord({ usedAgoMs: 24 * 60 * 60 * 1000 }),
      now: NOW
    }),
    false
  )
})

test("used link: without usedAt or active session nothing is returned", () => {
  assert.equal(
    canReuseSessionForUsedLink({ record: { usedAt: null, externalUser: activeUser() }, now: NOW }),
    false
  )
  assert.equal(canReuseSessionForUsedLink({ record: null, now: NOW }), false)

  const inWindow = (externalUser) =>
    canReuseSessionForUsedLink({ record: usedRecord({ usedAgoMs: 1_000, externalUser }), now: NOW })
  assert.equal(inWindow(activeUser({ active: false })), false)
  assert.equal(inWindow(activeUser({ refreshToken: null })), false)
  assert.equal(inWindow(activeUser({ sessionExpiresAt: null })), false)
  assert.equal(inWindow(activeUser({ sessionExpiresAt: new Date(NOW.getTime() - 1) })), false)
  assert.equal(inWindow(null), false)
})

// Сквозная проверка мутации: ветка ALREADY_USED проходит через резолвер.
async function authorizeUsedLink(usedAgoMs) {
  process.env.JWT_SECRET ||= "test-secret"
  const { rawToken, tokenHash } = createMagicLinkTokenPair()
  const now = Date.now()
  const double = installPrismaDouble({
    documents: {
      externalUserMagicLinkToken: {
        id: "link-1",
        tokenHash,
        usedAt: new Date(now - usedAgoMs),
        expiresAt: new Date(now + 60 * 60 * 1000),
        externalUser: {
          id: "ext-1",
          active: true,
          refreshToken: "session-owner",
          sessionExpiresAt: new Date(now + 24 * 60 * 60 * 1000)
        }
      }
    }
  })
  try {
    const result = await resolver.Mutation.authorizeExternalAuth(null, { token: rawToken })
    return { result, double }
  } catch (error) {
    return { error, double }
  } finally {
    double.restore()
  }
}

test("authorizeExternalAuth: repeat within the window gets the owner's session", async () => {
  const { result, error, double } = await authorizeUsedLink(5_000)
  assert.equal(error, undefined)
  assert.equal(result.refreshToken, "session-owner")
  assert.equal(result.subjectType, "EXTERNAL_USER")
  assert.equal(double.callsTo("externalUser", "update").length, 0)
})

test("authorizeExternalAuth: repeat after the window is rejected", async () => {
  const { result, error, double } = await authorizeUsedLink(ALREADY_USED_GRACE_MS + 60_000)
  assert.equal(result, undefined)
  assert.match(error?.message ?? "", /Invalid or expired magic link/)
  assert.equal(double.callsTo("externalUser", "update").length, 0)
  assert.equal(double.callsTo("externalUserMagicLinkToken", "updateMany").length, 0)
})

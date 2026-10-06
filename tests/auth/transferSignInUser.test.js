// transferSignIn — второй вход (клиент — мобильное приложение). Для USER он
// пропускал проверку почты и 2FA, которые есть в основном входе: учётка с
// неподтверждённой почтой получала сессию (ПДН-Е-09). Водитель без подтверждения
// входит по-прежнему — решение владельца 02.10.2026.

import test from "node:test"
import assert from "node:assert/strict"
import argon2 from "argon2"
import speakeasy from "@levminer/speakeasy"
import { makeExecutableSchema } from "@graphql-tools/schema"
import mergedTypeDefs from "../../typeDefs/typedefs.js"
import globalResolver from "../../resolvers/global/global.resolver.js"
import { installPrismaDouble } from "../helpers/prismaDouble.js"
import { releasePubsubAfterTests } from "../helpers/fapHarness.js"

releasePubsubAfterTests()

process.env.JWT_SECRET ||= "test-secret"

const PASSWORD = "Secret-123"
const passwordHash = await argon2.hash(PASSWORD)

const crmUser = (overrides = {}) => ({
  id: "u1",
  login: "user1",
  email: "user1@example.com",
  password: passwordHash,
  role: "AIRLINEADMIN",
  active: true,
  emailVerified: true,
  is2FAEnabled: false,
  ...overrides
})

const signIn = (input) =>
  globalResolver.Mutation.transferSignIn(null, {
    input: { fingerprint: "fp", ...input }
  })

const withDouble = async (documents, fn) => {
  const prismaDouble = installPrismaDouble({ documents })
  try {
    return await fn(prismaDouble)
  } finally {
    prismaDouble.restore()
  }
}

test("USER с неподтверждённой почтой не получает сессию", async () => {
  await withDouble({ user: crmUser({ emailVerified: false }) }, async (db) => {
    await assert.rejects(
      signIn({ identifier: "user1", password: PASSWORD }),
      /Подтвердите email перед входом/
    )
    assert.equal(db.callsTo("user", "update").length, 0, "сессия не выдаётся")
  })
})

test("неверный пароль проверяется раньше почты: статус учётки не раскрывается", async () => {
  await withDouble({ user: crmUser({ emailVerified: false }) }, async () => {
    await assert.rejects(
      signIn({ identifier: "user1", password: "wrong-password" }),
      /Invalid credentials/
    )
  })
})

test("USER с 2FA без кода и с неверным кодом не входит", async () => {
  const secret = speakeasy.generateSecret().base32
  const user = crmUser({ is2FAEnabled: true, twoFAMethod: "TOTP", twoFASecret: secret })
  await withDouble({ user }, async (db) => {
    await assert.rejects(
      signIn({ identifier: "user1", password: PASSWORD }),
      /Invalid 2FA token/
    )
    await assert.rejects(
      signIn({ identifier: "user1", password: PASSWORD, token2FA: "abc" }),
      /Invalid 2FA token/
    )
    assert.equal(db.callsTo("user", "update").length, 0)
  })
})

test("USER с 2FA и верным кодом входит", async () => {
  const secret = speakeasy.generateSecret().base32
  const user = crmUser({ is2FAEnabled: true, twoFAMethod: "TOTP", twoFASecret: secret })
  const token2FA = speakeasy.totp({ secret, encoding: "base32" })
  await withDouble({ user }, async () => {
    const result = await signIn({ identifier: "user1", password: PASSWORD, token2FA })
    assert.equal(result.subjectType, "USER")
    assert.ok(result.token)
  })
})

test("подтверждённый USER без 2FA входит как раньше", async () => {
  await withDouble({ user: crmUser() }, async (db) => {
    const result = await signIn({ identifier: "user1", password: PASSWORD })
    assert.equal(result.subjectType, "USER")
    assert.ok(result.token)
    assert.equal(db.callsTo("user", "update").length, 1)
  })
})

test("водитель входит без подтверждения (решение владельца 02.10.2026)", async () => {
  const driver = {
    id: "d1",
    email: "driver@example.com",
    password: passwordHash,
    registrationStatus: "PENDING",
    organizationId: null
  }
  await withDouble({ driver }, async () => {
    const result = await signIn({ identifier: "driver@example.com", password: PASSWORD })
    assert.equal(result.subjectType, "DRIVER")
    assert.ok(result.token)
  })
})

test("TransferSignInInput принимает token2FA", () => {
  const schema = makeExecutableSchema({ typeDefs: mergedTypeDefs })
  assert.ok(schema.getType("TransferSignInInput").getFields().token2FA)
})

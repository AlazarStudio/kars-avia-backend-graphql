// Секреты (хеш пароля, refresh-токен, отпечаток, секрет 2FA) не уходят в ответ
// GraphQL: поля остаются в схеме nullable, field-резолвер всегда отдаёт null.

import test from "node:test"
import assert from "node:assert/strict"
import { isNonNullType } from "graphql"
import { makeExecutableSchema } from "@graphql-tools/schema"
import { mergeResolvers } from "@graphql-tools/merge"
import mergedTypeDefs from "../../typeDefs/typedefs.js"
import airlineResolver from "../../resolvers/airline/airline.resolver.js"
import driverResolver from "../../resolvers/driver/driver.resolver.js"
import filePathsResolver from "../../resolvers/filePaths/filePaths.resolver.js"
import globalResolver from "../../resolvers/global/global.resolver.js"
import organizationResolver from "../../resolvers/organization/organization.resolver.js"
import userResolver from "../../resolvers/user/user.resolver.js"
import {
  SESSION_SECRET_FIELDS,
  USER_SECRET_FIELDS,
  hideSecretFields,
  omitSecretFields
} from "../../services/auth/hiddenSecretFields.js"
import { installPrismaDouble } from "../helpers/prismaDouble.js"
import {
  installPubsubSpy,
  releasePubsubAfterTests
} from "../helpers/fapHarness.js"

releasePubsubAfterTests()

const HIDDEN = {
  User: USER_SECRET_FIELDS,
  Driver: SESSION_SECRET_FIELDS,
  AirlinePersonal: SESSION_SECRET_FIELDS
}

const parentWithSecrets = {
  password: "$argon2id$hash",
  twoFASecret: "BASE32SECRET",
  refreshToken: "refresh-uuid",
  fingerprint: "device-fp"
}

test("hideSecretFields: every listed field resolves to null", () => {
  const resolvers = hideSecretFields(USER_SECRET_FIELDS)
  assert.deepEqual(Object.keys(resolvers), USER_SECRET_FIELDS)
  for (const field of USER_SECRET_FIELDS) {
    assert.equal(resolvers[field](parentWithSecrets), null)
  }
  assert.deepEqual(hideSecretFields([]), {})
})

// Полный resolvers.js тянет chat.resolver → @maxhub/max-bot-api, которого
// может не быть в локальном node_modules. Тогда собираем схему из полных
// typeDefs и резолверов, где объявлены User / Driver / AirlinePersonal:
// резолвер на несуществующее поле типа всё равно уронит сборку.
async function loadResolvers(t) {
  try {
    return (await import("../../resolvers/resolvers.js")).default
  } catch (error) {
    if (error.code !== "ERR_MODULE_NOT_FOUND") throw error
    t.diagnostic(`full resolvers.js skipped: ${error.message.split("\n")[0]}`)
    return mergeResolvers([
      airlineResolver,
      driverResolver,
      filePathsResolver,
      globalResolver,
      organizationResolver,
      userResolver
    ])
  }
}

test("schema builds and secret fields are nullable and hidden", async (t) => {
  const schema = makeExecutableSchema({
    typeDefs: mergedTypeDefs,
    resolvers: await loadResolvers(t)
  })

  for (const [typeName, fields] of Object.entries(HIDDEN)) {
    const typeFields = schema.getType(typeName).getFields()
    for (const field of fields) {
      const definition = typeFields[field]
      assert.ok(definition, `${typeName}.${field} exists`)
      assert.equal(
        isNonNullType(definition.type),
        false,
        `${typeName}.${field} is nullable`
      )
      assert.equal(
        definition.resolve(parentWithSecrets, {}, {}, {}),
        null,
        `${typeName}.${field} resolves to null`
      )
    }
  }
})

test("omitSecretFields: strips secrets, keeps the rest", () => {
  const entity = { id: "u1", name: "A", ...parentWithSecrets }
  assert.deepEqual(omitSecretFields(entity), { id: "u1", name: "A" })
  assert.equal(entity.refreshToken, "refresh-uuid", "source is not mutated")
  assert.equal(omitSecretFields(null), null)
})

// updateUser отвечает типом AuthPayload, у которого refreshToken легитимен
// (signIn / refreshToken) и резолвером не скрыт — мутация снимает секреты сама.
test("updateUser: AuthPayload answer carries no session secrets", async () => {
  const pubsubSpy = installPubsubSpy()
  const prismaDouble = installPrismaDouble({
    documents: {
      user: { id: "u1", name: "Old", role: "AIRLINEADMIN", ...parentWithSecrets }
    }
  })
  try {
    const result = await userResolver.Mutation.updateUser(
      null,
      { input: { id: "u1", name: "New" } },
      {
        subjectType: "USER",
        subject: { id: "u1", role: "AIRLINEADMIN" },
        user: { id: "u1", role: "AIRLINEADMIN" }
      }
    )
    assert.equal(result.name, "New")
    for (const field of USER_SECRET_FIELDS) {
      assert.equal(field in result, false, field)
    }
  } finally {
    prismaDouble.restore()
    pubsubSpy.restore()
  }
})

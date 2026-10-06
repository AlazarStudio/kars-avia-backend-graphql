// Публичная саморегистрация закрыта (ПДН-Е-09, решение владельца 06.10.2026):
// её не вызывал ни один клиент, а созданная учётка USER проходила allMiddleware.
// Вход, подтверждение почты и восстановление пароля остаются.

import test from "node:test"
import assert from "node:assert/strict"
import express from "express"
import { makeExecutableSchema } from "@graphql-tools/schema"
import mergedTypeDefs from "../../typeDefs/typedefs.js"
import authRouter from "../../services/routes/auth.js"
import * as publicAuthService from "../../services/auth/publicAuthService.js"
import userResolver from "../../resolvers/user/user.resolver.js"
import { releasePubsubAfterTests } from "../helpers/fapHarness.js"

releasePubsubAfterTests()

test("GraphQL: в схеме нет signUp и SignUpInput", () => {
  const schema = makeExecutableSchema({ typeDefs: mergedTypeDefs })
  // assert.ok вместо equal: при провале equal пытается напечатать весь объект типа
  // GraphQL и падает по памяти, не показав сообщения
  assert.ok(!schema.getMutationType().getFields().signUp, "мутация signUp есть в схеме")
  assert.ok(!schema.getType("SignUpInput"), "тип SignUpInput есть в схеме")
  assert.ok(schema.getMutationType().getFields().signIn, "вход на месте")
})

test("GraphQL: у резолвера пользователя нет signUp", () => {
  assert.equal(userResolver.Mutation.signUp, undefined)
})

test("REST: маршрута /register нет, вход и восстановление пароля остались", () => {
  const paths = authRouter.stack
    .filter((layer) => layer.route)
    .map((layer) => layer.route.path)
  assert.equal(paths.includes("/register"), false)
  for (const path of ["/login", "/verify-email", "/forgot-password", "/reset-password"]) {
    assert.ok(paths.includes(path), `маршрут ${path} на месте`)
  }
})

test("publicAuthService не экспортирует registerSelfUser", () => {
  assert.equal(publicAuthService.registerSelfUser, undefined)
  assert.equal(typeof publicAuthService.verifyEmailWithToken, "function")
  assert.equal(typeof publicAuthService.requestPasswordResetByEmail, "function")
  assert.equal(typeof publicAuthService.resetPasswordWithToken, "function")
})

test("REST: POST /api/auth/register отвечает 404", async () => {
  const app = express()
  app.use(express.json())
  app.use("/api/auth", authRouter)
  // как в проде: Apollo, смонтированный на "/", перехватывает всё, что не поймал роутер
  app.use((req, res) => res.status(400).json({ message: "fallthrough" }))
  const server = app.listen(0)
  try {
    const { port } = server.address()
    const response = await fetch(`http://127.0.0.1:${port}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "a", email: "a@example.com", login: "a", password: "12345678" })
    })
    assert.equal(response.status, 404)
  } finally {
    server.close()
  }
})

import test from "node:test"
import assert from "node:assert/strict"
import { GraphQLError } from "graphql"
import { rethrowUnlessInternalError } from "../../services/infra/mutationError.js"

test("rethrows GraphQLError as-is", () => {
  const error = new GraphQLError("Регион уже используется", {
    extensions: { code: "BAD_USER_INPUT" }
  })

  assert.throws(
    () => rethrowUnlessInternalError(error, "fallback"),
    (err) => err === error
  )
})

test("rethrows plain Error with message", () => {
  const error = new Error("Нельзя изменить отель после даты заселения")

  assert.throws(
    () => rethrowUnlessInternalError(error, "fallback"),
    (err) => err === error
  )
})

test("masks Prisma errors with fallback", () => {
  const error = Object.assign(new Error("Unique constraint failed"), {
    code: "P2002"
  })

  assert.throws(
    () => rethrowUnlessInternalError(error, "Не удалось обновить"),
    (err) => err.message === "Не удалось обновить"
  )
})

test("uses fallback for unknown errors", () => {
  assert.throws(
    () => rethrowUnlessInternalError({ foo: 1 }, "Не удалось обновить"),
    (err) => err.message === "Не удалось обновить"
  )
})

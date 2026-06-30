import test from "node:test"
import assert from "node:assert/strict"
import { buildRequestListWhere } from "../../services/request/buildRequestListWhere.js"

test("buildRequestListWhere: excludes canceled when archive is false", () => {
  const where = buildRequestListWhere({ archive: false })

  assert.ok(
    where.AND.some(
      (f) => f.status?.not === "canceled"
    )
  )
})

test("buildRequestListWhere: does not exclude canceled when archive is true", () => {
  const where = buildRequestListWhere({ archive: true })

  assert.ok(
    !where.AND.some(
      (f) => f.status?.not === "canceled"
    )
  )
})

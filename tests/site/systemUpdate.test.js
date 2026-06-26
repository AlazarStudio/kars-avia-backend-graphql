import test from "node:test"
import assert from "node:assert/strict"
import {
  compareVersions,
  computeShouldShow,
  toSystemUpdateResponse,
  validateSystemUpdateInput
} from "../../services/site/systemUpdateUtils.js"

test("compareVersions orders semver parts", () => {
  assert.equal(compareVersions("3.5.0", "3.4.0"), 1)
  assert.equal(compareVersions("3.4.0", "3.5.0"), -1)
  assert.equal(compareVersions("3.5.0", "3.5.0"), 0)
})

test("compareVersions rejects invalid format", () => {
  assert.throws(() => compareVersions("3.5", "3.4.0"), /X\.Y\.Z/)
})

test("computeShouldShow returns false when disabled", () => {
  assert.equal(
    computeShouldShow({ enabled: false, version: "3.5.0" }, null),
    false
  )
})

test("computeShouldShow returns true for unseen version", () => {
  assert.equal(
    computeShouldShow({ enabled: true, version: "3.5.0" }, null),
    true
  )
  assert.equal(
    computeShouldShow({ enabled: true, version: "3.5.0" }, "3.4.0"),
    true
  )
})

test("computeShouldShow returns false when already seen", () => {
  assert.equal(
    computeShouldShow({ enabled: true, version: "3.5.0" }, "3.5.0"),
    false
  )
})

test("toSystemUpdateResponse returns defaults when record is null", () => {
  const result = toSystemUpdateResponse(null, null)
  assert.deepEqual(result, {
    version: null,
    title: null,
    message: null,
    enabled: false,
    publishedAt: null,
    shouldShow: false
  })
})

test("validateSystemUpdateInput requires fields when enabled", () => {
  assert.throws(
    () =>
      validateSystemUpdateInput({
        enabled: true,
        version: "bad",
        title: "Title",
        message: "Message"
      }),
    /Версия/
  )

  assert.throws(
    () =>
      validateSystemUpdateInput({
        enabled: true,
        version: "3.5.0",
        title: "  ",
        message: "Message"
      }),
    /Заголовок/
  )

  assert.throws(
    () =>
      validateSystemUpdateInput({
        enabled: true,
        version: "3.5.0",
        title: "Title",
        message: "  "
      }),
    /Текст/
  )
})

test("validateSystemUpdateInput allows empty fields when disabled", () => {
  assert.doesNotThrow(() =>
    validateSystemUpdateInput({
      enabled: false,
      version: "",
      title: "",
      message: ""
    })
  )
})

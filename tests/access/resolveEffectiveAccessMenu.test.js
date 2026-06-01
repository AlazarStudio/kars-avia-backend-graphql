import test from "node:test"
import assert from "node:assert/strict"
import { mergeAccessMenus } from "../../services/access/resolveEffectiveAccessMenu.js"

test("department only", () => {
  const result = mergeAccessMenus({ requestMenu: true, userMenu: false })
  assert.equal(result.requestMenu, true)
  assert.equal(result.userMenu, false)
})

test("position overrides department per key", () => {
  const result = mergeAccessMenus(
    { requestMenu: true, userMenu: true },
    { userMenu: false }
  )
  assert.equal(result.requestMenu, true)
  assert.equal(result.userMenu, false)
})

test("department fills keys missing on position", () => {
  const result = mergeAccessMenus(
    { requestMenu: true, reserveMenu: true },
    { userMenu: false }
  )
  assert.equal(result.requestMenu, true)
  assert.equal(result.reserveMenu, true)
  assert.equal(result.userMenu, false)
})

test("airline layers: department, POD, position model", () => {
  const result = mergeAccessMenus(
    { requestMenu: false },
    { requestMenu: true, userMenu: false },
    { userMenu: true }
  )
  assert.equal(result.requestMenu, true)
  assert.equal(result.userMenu, true)
})

test("user layer wins over position and department", () => {
  const result = mergeAccessMenus(
    { requestMenu: false },
    { requestMenu: true },
    { requestMenu: false, transferMenu: true }
  )
  assert.equal(result.requestMenu, false)
  assert.equal(result.transferMenu, true)
})

test("empty layers returns null", () => {
  assert.equal(mergeAccessMenus(null, null), null)
})
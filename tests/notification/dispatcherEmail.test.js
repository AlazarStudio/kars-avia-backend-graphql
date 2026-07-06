import test from "node:test"
import assert from "node:assert/strict"
import {
  normalizeEmail,
  dedupeDepartmentRecipients,
  isActionEnabledInMenu
} from "../../services/notification/notificationMenuCheck.js"
import { resolveEnvEmail } from "../../services/notification/departmentEmailDelivery.js"

test("normalizeEmail trims and lowercases", () => {
  assert.equal(normalizeEmail("  KARS@Example.COM  "), "kars@example.com")
  assert.equal(normalizeEmail(null), "")
  assert.equal(normalizeEmail(undefined), "")
})

test("dedupeDepartmentRecipients collapses duplicate addresses", () => {
  const recipients = dedupeDepartmentRecipients([
    { id: "dept-1", email: "a@x.com" },
    { id: "dept-2", email: "A@X.COM" }
  ])

  assert.equal(recipients.length, 1)
  assert.equal(recipients[0].email, "a@x.com")
  assert.equal(recipients[0].departmentId, "dept-1")
})

test("dedupeDepartmentRecipients keeps three unique emails", () => {
  const recipients = dedupeDepartmentRecipients([
    { id: "dept-1", email: "one@x.com" },
    { id: "dept-2", email: "two@x.com" },
    { id: "dept-3", email: "three@x.com" }
  ])

  assert.equal(recipients.length, 3)
})

test("isActionEnabledInMenu respects email flags", () => {
  const menuEnabled = { emailRequestCreate: true }
  const menuDisabled = { emailRequestCreate: false }

  assert.equal(isActionEnabledInMenu(menuEnabled, "create_request", "email"), true)
  assert.equal(isActionEnabledInMenu(menuDisabled, "create_request", "email"), false)
})

test("isActionEnabledInMenu defaults to enabled when menu is null", () => {
  assert.equal(isActionEnabledInMenu(null, "create_request", "email"), true)
})

test("filterDepartmentsForEmail logic via isActionEnabledInMenu", () => {
  const departments = [
    {
      id: "d1",
      email: "a@x.com",
      notificationMenu: { emailRequestCreate: true }
    },
    {
      id: "d2",
      email: "b@x.com",
      notificationMenu: { emailRequestCreate: false }
    },
    { id: "d3", email: "   ", notificationMenu: { emailRequestCreate: true } }
  ]

  const filtered = departments.filter(
    (dept) =>
      dept.email?.trim() &&
      isActionEnabledInMenu(dept.notificationMenu, "create_request", "email")
  )

  assert.equal(filtered.length, 1)
  assert.equal(filtered[0].id, "d1")
})

test("resolveEnvEmail uses EMAIL_RECEIVER or EMAIL_RESIEVER", () => {
  const prevReceiver = process.env.EMAIL_RECEIVER
  const prevResiever = process.env.EMAIL_RESIEVER

  process.env.EMAIL_RECEIVER = "receiver@example.com"
  process.env.EMAIL_RESIEVER = "typo@example.com"
  assert.equal(resolveEnvEmail("EMAIL_RECEIVER"), "receiver@example.com")

  delete process.env.EMAIL_RECEIVER
  assert.equal(resolveEnvEmail("EMAIL_RECEIVER"), "typo@example.com")

  process.env.EMAIL_RECEIVER = prevReceiver
  process.env.EMAIL_RESIEVER = prevResiever
})

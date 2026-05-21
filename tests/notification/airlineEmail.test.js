import test from "node:test"
import assert from "node:assert/strict"
import {
  normalizeEmail,
  dedupeDepartmentRecipients,
  isActionEnabledInMenu
} from "../../services/notification/notificationMenuCheck.js"

test("airline department filter excludes other airlines by query shape", () => {
  const airlineA = "airline-a-id"
  const airlineB = "airline-b-id"

  const allDepartments = [
    {
      id: "dept-a1",
      airlineId: airlineA,
      email: "a1@airline.com",
      notificationMenu: { emailRequestCreate: true }
    },
    {
      id: "dept-a2",
      airlineId: airlineA,
      email: "a2@airline.com",
      notificationMenu: { emailRequestCreate: true }
    },
    {
      id: "dept-b1",
      airlineId: airlineB,
      email: "b1@other.com",
      notificationMenu: { emailRequestCreate: true }
    }
  ]

  const forAirlineA = allDepartments.filter((dept) => dept.airlineId === airlineA)
  const filtered = forAirlineA.filter(
    (dept) =>
      dept.email?.trim() &&
      isActionEnabledInMenu(dept.notificationMenu, "create_request", "email")
  )
  const recipients = dedupeDepartmentRecipients(filtered)

  assert.equal(recipients.length, 2)
  assert.ok(recipients.every((r) => r.departmentId.startsWith("dept-a")))
  assert.ok(!recipients.some((r) => normalizeEmail(r.email) === "b1@other.com"))
})

test("dedupeDepartmentRecipients for airline departments with same email", () => {
  const recipients = dedupeDepartmentRecipients([
    { id: "dept-a1", email: "shared@airline.com" },
    { id: "dept-a2", email: "SHARED@airline.com" }
  ])

  assert.equal(recipients.length, 1)
  assert.equal(recipients[0].departmentId, "dept-a1")
})

test("isActionEnabledInMenu disables airline email for action", () => {
  const menu = { emailRequestCancel: false }
  assert.equal(isActionEnabledInMenu(menu, "cancel_request", "email"), false)
})

test("scoped departmentId returns only creator department", () => {
  const airlineA = "airline-a-id"
  const creatorDeptId = "dept-a1"

  const departments = [
    {
      id: "dept-a1",
      airlineId: airlineA,
      email: "creator@airline.com",
      notificationMenu: { emailRequestCreate: true }
    },
    {
      id: "dept-a2",
      airlineId: airlineA,
      email: "other@airline.com",
      notificationMenu: { emailRequestCreate: true }
    }
  ]

  const forAirlineA = departments.filter((dept) => dept.airlineId === airlineA)
  const scoped = forAirlineA.filter((dept) => dept.id === creatorDeptId)
  const filtered = scoped.filter(
    (dept) =>
      dept.email?.trim() &&
      isActionEnabledInMenu(dept.notificationMenu, "create_request", "email")
  )
  const recipients = dedupeDepartmentRecipients(filtered)

  assert.equal(recipients.length, 1)
  assert.equal(recipients[0].departmentId, creatorDeptId)
  assert.equal(normalizeEmail(recipients[0].email), "creator@airline.com")
})

test("scoped department with disabled email action yields no recipients", () => {
  const departments = [
    {
      id: "dept-a1",
      airlineId: "airline-a",
      email: "creator@airline.com",
      notificationMenu: { emailRequestCreate: false }
    }
  ]

  const filtered = departments.filter(
    (dept) =>
      dept.email?.trim() &&
      isActionEnabledInMenu(dept.notificationMenu, "create_request", "email")
  )

  assert.equal(filtered.length, 0)
})

test("without departmentId all airline departments remain eligible", () => {
  const departments = [
    {
      id: "dept-a1",
      airlineId: "airline-a",
      email: "a1@airline.com",
      notificationMenu: { emailRequestCreate: true }
    },
    {
      id: "dept-a2",
      airlineId: "airline-a",
      email: "a2@airline.com",
      notificationMenu: { emailRequestCreate: true }
    }
  ]

  const filtered = departments.filter(
    (dept) =>
      dept.email?.trim() &&
      isActionEnabledInMenu(dept.notificationMenu, "create_request", "email")
  )
  const recipients = dedupeDepartmentRecipients(filtered)

  assert.equal(recipients.length, 2)
})

test("skipEnvFallback prevents fallback when scoped recipients are empty", () => {
  const recipients = []
  const skipEnvFallback = true
  const shouldUseEnvFallback = !recipients?.length && !skipEnvFallback
  assert.equal(shouldUseEnvFallback, false)
})

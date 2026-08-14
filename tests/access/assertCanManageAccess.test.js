import test from "node:test"
import assert from "node:assert/strict"
import { GraphQLError } from "graphql"
import { compactAccessMenu } from "../../services/access/accessMenuKeys.js"
import {
  assertAccessMenuWrite,
  assertCanAssignRole,
  assertCanManageUsers,
  assertCanModifyTargetUser,
  assertNoSelfPrivilegeChange,
  assertTravellineAccess,
  canAccessTravellineFrom,
  canManageUsersFrom,
  toAccessMenuWriteData
} from "../../services/access/assertCanManageAccess.js"

const superAdmin = { id: "sa", role: "SUPERADMIN" }
const dispatcherAdmin = { id: "da", role: "DISPATCHERADMIN" }
const dispatcherUser = { id: "du", role: "DISPATCHERUSER" }

const expectForbidden = (fn, message) => {
  try {
    fn()
    assert.fail("должно было бросить")
  } catch (error) {
    assert.ok(error instanceof GraphQLError)
    assert.equal(error.extensions.code, "FORBIDDEN")
    if (message) assert.match(error.message, message)
  }
}

test("canManageUsersFrom: админ-роли и accessManage", () => {
  assert.equal(canManageUsersFrom({ role: "SUPERADMIN" }), true)
  assert.equal(canManageUsersFrom({ role: "DISPATCHERADMIN" }), true)
  assert.equal(canManageUsersFrom({ role: "HOTELADMIN" }), true)
  assert.equal(canManageUsersFrom({ role: "AIRLINEADMIN" }), true)
  assert.equal(
    canManageUsersFrom({
      role: "DISPATCHERUSER",
      effectiveAccessMenu: { accessManage: true }
    }),
    true
  )
  assert.equal(
    canManageUsersFrom({
      role: "DISPATCHERUSER",
      effectiveAccessMenu: { accessManage: false }
    }),
    false
  )
  assert.equal(canManageUsersFrom({ role: "DISPATCHERUSER" }), false)
})

test("canAccessTravellineFrom: админы TL и travellineMenu", () => {
  assert.equal(canAccessTravellineFrom({ role: "SUPERADMIN" }), true)
  assert.equal(canAccessTravellineFrom({ role: "DISPATCHERADMIN" }), true)
  assert.equal(canAccessTravellineFrom({ role: "HOTELADMIN" }), false)
  assert.equal(
    canAccessTravellineFrom({
      role: "DISPATCHERUSER",
      effectiveAccessMenu: { travellineMenu: true }
    }),
    true
  )
  assert.equal(
    canAccessTravellineFrom({
      role: "DISPATCHERUSER",
      effectiveAccessMenu: { travellineMenu: false }
    }),
    false
  )
})

test("assertCanAssignRole: SUPERADMIN только суперадмин", () => {
  assert.doesNotThrow(() => assertCanAssignRole(superAdmin, "SUPERADMIN"))
  assert.doesNotThrow(() => assertCanAssignRole(dispatcherAdmin, "DISPATCHERUSER"))
  expectForbidden(
    () => assertCanAssignRole(dispatcherAdmin, "SUPERADMIN"),
    /SUPERADMIN/
  )
  expectForbidden(
    () => assertCanAssignRole(dispatcherUser, "SUPERADMIN"),
    /SUPERADMIN/
  )
})

test("assertCanModifyTargetUser: чужого SUPERADMIN не трогает никто кроме суперадмина", () => {
  assert.doesNotThrow(() =>
    assertCanModifyTargetUser(superAdmin, { role: "SUPERADMIN" })
  )
  assert.doesNotThrow(() =>
    assertCanModifyTargetUser(dispatcherAdmin, { role: "DISPATCHERUSER" })
  )
  expectForbidden(
    () => assertCanModifyTargetUser(dispatcherAdmin, { role: "SUPERADMIN" }),
    /SUPERADMIN/
  )
})

test("assertNoSelfPrivilegeChange: себе нельзя роль и accessMenu", () => {
  assert.doesNotThrow(() =>
    assertNoSelfPrivilegeChange({
      actorId: "du",
      targetId: "other",
      input: { role: "AIRLINEADMIN", accessMenu: { userMenu: true } },
      currentRole: "DISPATCHERUSER"
    })
  )
  assert.doesNotThrow(() =>
    assertNoSelfPrivilegeChange({
      actorId: "du",
      targetId: "du",
      input: { name: "Иван" },
      currentRole: "DISPATCHERUSER"
    })
  )
  expectForbidden(
    () =>
      assertNoSelfPrivilegeChange({
        actorId: "du",
        targetId: "du",
        input: { role: "DISPATCHERADMIN" },
        currentRole: "DISPATCHERUSER"
      }),
    /роль/
  )
  expectForbidden(
    () =>
      assertNoSelfPrivilegeChange({
        actorId: "du",
        targetId: "du",
        input: { accessMenu: { userMenu: true } },
        currentRole: "DISPATCHERUSER"
      }),
    /доступ/
  )
})

test("assertAccessMenuWrite: accessManage только суперадмин", () => {
  assert.doesNotThrow(() =>
    assertAccessMenuWrite({
      actor: superAdmin,
      incomingMenu: { accessManage: true }
    })
  )
  expectForbidden(
    () =>
      assertAccessMenuWrite({
        actor: dispatcherAdmin,
        incomingMenu: { accessManage: true }
      }),
    /accessManage/
  )
  expectForbidden(
    () =>
      assertAccessMenuWrite({
        actor: dispatcherUser,
        incomingMenu: { accessManage: true },
        actorEffectiveMenu: { accessManage: true }
      }),
    /accessManage/
  )
})

test("assertAccessMenuWrite: делегат не выдаёт флаги, которых у него нет", () => {
  assert.doesNotThrow(() =>
    assertAccessMenuWrite({
      actor: dispatcherUser,
      incomingMenu: { requestMenu: true, travellineMenu: false },
      actorEffectiveMenu: { requestMenu: true, accessManage: true }
    })
  )
  expectForbidden(
    () =>
      assertAccessMenuWrite({
        actor: dispatcherUser,
        incomingMenu: { travellineMenu: true },
        actorEffectiveMenu: { accessManage: true, requestMenu: true }
      }),
    /travellineMenu/
  )
})

test("assertAccessMenuWrite: админ-роли без subset", () => {
  assert.doesNotThrow(() =>
    assertAccessMenuWrite({
      actor: dispatcherAdmin,
      incomingMenu: { travellineMenu: true, userMenu: true }
    })
  )
})

test("toAccessMenuWriteData: null снимает слой, пустой объект — no-op", () => {
  assert.deepEqual(toAccessMenuWriteData(null), { unset: true })
  assert.equal(toAccessMenuWriteData(undefined), null)
  assert.equal(toAccessMenuWriteData({}), null)
  assert.deepEqual(toAccessMenuWriteData({ travellineMenu: true }), {
    set: { travellineMenu: true }
  })
})

test("compactAccessMenu оставляет только известные ключи", () => {
  assert.equal(compactAccessMenu(null), null)
  assert.deepEqual(
    compactAccessMenu({ requestMenu: false, unknown: true }),
    { requestMenu: false }
  )
})

test("assertCanManageUsers: роль, accessManage, отказ", async () => {
  await assertCanManageUsers({}, { user: superAdmin })
  await assertCanManageUsers({}, { user: dispatcherAdmin })

  const manager = {
    id: "m1",
    role: "DISPATCHERUSER",
    accessMenu: { accessManage: true }
  }
  const cap = await assertCanManageUsers({}, { user: manager })
  assert.equal(cap.via, "accessManage")

  await assert.rejects(
    () => assertCanManageUsers({}, { user: dispatcherUser }),
    (error) => {
      assert.ok(error instanceof GraphQLError)
      assert.equal(error.extensions.code, "FORBIDDEN")
      return true
    }
  )
  await assert.rejects(
    () => assertCanManageUsers({}, {}),
    (error) => error.extensions?.code === "UNAUTHENTICATED"
  )
})

test("assertTravellineAccess: админ, флаг, отказ", async () => {
  await assertTravellineAccess({}, { user: superAdmin })
  await assertTravellineAccess({}, { user: dispatcherAdmin })
  await assertTravellineAccess(
    {},
    { user: { ...dispatcherUser, accessMenu: { travellineMenu: true } } }
  )
  await assert.rejects(
    () => assertTravellineAccess({}, { user: dispatcherUser }),
    (error) => error.extensions?.code === "FORBIDDEN"
  )
})

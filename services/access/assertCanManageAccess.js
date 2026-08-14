import { GraphQLError } from "graphql"
import { ACCESS_MENU_KEYS, compactAccessMenu } from "./accessMenuKeys.js"
import { loadEffectiveAccessMenuForUser } from "./loadEffectiveAccessMenuForUser.js"

export const ADMIN_HOTEL_AIR_ROLES = [
  "SUPERADMIN",
  "DISPATCHERADMIN",
  "HOTELADMIN",
  "AIRLINEADMIN"
]

const hasOwn = (obj, key) =>
  Object.prototype.hasOwnProperty.call(obj || {}, key)

const forbidden = (message) =>
  new GraphQLError(message, {
    extensions: { code: "FORBIDDEN", http: { status: 403 } }
  })

const unauthenticated = () =>
  new GraphQLError("Access forbidden: No auth subject provided.", {
    extensions: { code: "UNAUTHENTICATED", http: { status: 401 } }
  })

export function getActor(context) {
  return context?.user || context?.subject || null
}

export function isSuperAdminRole(role) {
  return role === "SUPERADMIN"
}

export function isAdminHotelAirRole(role) {
  return ADMIN_HOTEL_AIR_ROLES.includes(role)
}

export function isTravellineAdminRole(role) {
  return role === "SUPERADMIN" || role === "DISPATCHERADMIN"
}

export function canManageUsersFrom({ role, effectiveAccessMenu }) {
  return (
    isAdminHotelAirRole(role) || effectiveAccessMenu?.accessManage === true
  )
}

export function canAccessTravellineFrom({ role, effectiveAccessMenu }) {
  return (
    isTravellineAdminRole(role) || effectiveAccessMenu?.travellineMenu === true
  )
}

export function assertCanAssignRole(actor, targetRole) {
  if (targetRole === "SUPERADMIN" && actor?.role !== "SUPERADMIN") {
    throw forbidden("Назначить роль SUPERADMIN может только суперадмин.")
  }
}

export function assertCanModifyTargetUser(actor, target) {
  if (target?.role === "SUPERADMIN" && actor?.role !== "SUPERADMIN") {
    throw forbidden("Пользователя с ролью SUPERADMIN может менять только суперадмин.")
  }
}

export function assertNoSelfPrivilegeChange({
  actorId,
  targetId,
  input,
  currentRole
}) {
  if (!actorId || actorId !== targetId) return
  if (input?.role !== undefined && input.role !== currentRole) {
    throw forbidden("Нельзя менять свою роль.")
  }
  if (hasOwn(input, "accessMenu")) {
    throw forbidden("Нельзя менять свои настройки доступа.")
  }
}

export function assertAccessMenuWrite({
  actor,
  incomingMenu,
  actorEffectiveMenu
}) {
  if (incomingMenu == null) return

  if (incomingMenu.accessManage === true && actor?.role !== "SUPERADMIN") {
    throw forbidden("Флаг accessManage может выдать только суперадмин.")
  }

  if (isSuperAdminRole(actor?.role) || isAdminHotelAirRole(actor?.role)) {
    return
  }

  for (const key of ACCESS_MENU_KEYS) {
    if (key === "accessManage") continue
    if (
      incomingMenu[key] === true &&
      actorEffectiveMenu?.[key] !== true
    ) {
      throw forbidden(`Нельзя выдать право ${key}: его нет у вас.`)
    }
  }
}

export function toAccessMenuWriteData(incomingMenu) {
  if (incomingMenu === null) {
    return { unset: true }
  }
  const compacted = compactAccessMenu(incomingMenu)
  if (!compacted || Object.keys(compacted).length === 0) {
    return null
  }
  return { set: compacted }
}

export async function assertCanManageUsers(prisma, context) {
  const actor = getActor(context)
  if (!actor) throw unauthenticated()

  if (isAdminHotelAirRole(actor.role)) {
    return { actor, via: "role", effectiveAccessMenu: null }
  }

  const effectiveAccessMenu = await loadEffectiveAccessMenuForUser(
    prisma,
    actor
  )
  if (effectiveAccessMenu?.accessManage === true) {
    return { actor, via: "accessManage", effectiveAccessMenu }
  }

  throw forbidden("Access forbidden: Admins only or accessManage required.")
}

export async function assertTravellineAccess(prisma, context) {
  const actor = getActor(context)
  if (!actor) throw unauthenticated()

  if (isTravellineAdminRole(actor.role)) return

  const effectiveAccessMenu = await loadEffectiveAccessMenuForUser(
    prisma,
    actor
  )
  if (effectiveAccessMenu?.travellineMenu === true) return

  throw forbidden("Access forbidden: TravelLine section is not allowed.")
}

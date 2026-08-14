export const ACCESS_MENU_KEYS = [
  "requestMenu",
  "requestCreate",
  "requestUpdate",
  "requestChat",
  "transferMenu",
  "transferCreate",
  "transferUpdate",
  "transferChat",
  "personalMenu",
  "personalCreate",
  "personalUpdate",
  "reserveMenu",
  "reserveCreate",
  "reserveUpdate",
  "reserveUpdateCompleted",
  "analyticsMenu",
  "analyticsUpload",
  "reportMenu",
  "reportCreate",
  "userMenu",
  "userCreate",
  "userUpdate",
  "airlineMenu",
  "airlineUpdate",
  "contracts",
  "contractCreate",
  "contractUpdate",
  "organizationMenu",
  "organizationCreate",
  "organizationUpdate",
  "organizationAddDrivers",
  "organizationAcceptDrivers",
  "accessManage",
  "travellineMenu"
]

const hasOwn = (obj, key) =>
  Object.prototype.hasOwnProperty.call(obj || {}, key)

/** Оставляет только явно переданные ключи AccessMenu — без Prisma-дефолтов. */
export function compactAccessMenu(input) {
  if (input == null) return input
  const compacted = {}
  for (const key of ACCESS_MENU_KEYS) {
    if (hasOwn(input, key) && input[key] !== undefined && input[key] !== null) {
      compacted[key] = input[key]
    }
  }
  return compacted
}
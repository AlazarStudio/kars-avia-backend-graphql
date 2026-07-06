import { ACCESS_MENU_KEYS } from "./accessMenuKeys.js"

const hasOwn = (obj, key) =>
  Object.prototype.hasOwnProperty.call(obj || {}, key)

/**
 * Merge accessMenu layers: later layers override earlier keys.
 * Order: department -> PositionOnDepartment (airline) -> Position -> User.
 */
export function mergeAccessMenus(...layers) {
  const definedLayers = layers.filter((layer) => layer != null)
  if (definedLayers.length === 0) {
    return null
  }

  const merged = {}

  for (const key of ACCESS_MENU_KEYS) {
    for (const layer of definedLayers) {
      if (hasOwn(layer, key) && layer[key] !== undefined) {
        merged[key] = layer[key]
      }
    }
  }

  return Object.keys(merged).length > 0 ? merged : null
}

/** @deprecated use mergeAccessMenus */
export function resolveEffectiveAccessMenu({
  departmentAccessMenu,
  positionAccessMenu
}) {
  return mergeAccessMenus(departmentAccessMenu, positionAccessMenu)
}
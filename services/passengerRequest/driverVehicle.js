import { prisma } from "../../prisma.js"

// Гос. номер водителя ФАП из справочника Driver. В заявку при создании уходят
// только имя и телефон водителя справочника (строка в строку), ссылки на id нет,
// поэтому ищем по ним же: сначала точный телефон, потом имя — и только если оно
// однозначно (одно имя может стоять у водителей разных компаний).
const TTL_MS = 60 * 1000
const cache = new Map()

const defaultDeps = {
  findDrivers: (where, take) => prisma.driver.findMany({ where, take }),
  now: () => Date.now()
}

const keyOf = (driver) => `${driver?.phone ?? ""}|${driver?.fullName ?? ""}`

export async function catalogVehicleNumber(driver, deps = defaultDeps) {
  const phone = driver?.phone?.trim?.() || ""
  const name = driver?.fullName?.trim?.() || ""
  if (!phone && !name) return null

  const key = keyOf({ phone, fullName: name })
  const hit = cache.get(key)
  if (hit && hit.expiresAt > deps.now()) return hit.value

  let found = null
  if (phone) {
    const byPhone = await deps.findDrivers({ number: phone }, 1)
    found = byPhone[0] ?? null
  }
  if (!found && name) {
    const byName = await deps.findDrivers(
      { name: { equals: name, mode: "insensitive" } },
      2
    )
    if (byName.length === 1) found = byName[0]
  }

  const value = found?.vehicleNumber?.trim?.() || null
  cache.set(key, { value, expiresAt: deps.now() + TTL_MS })
  return value
}

// Для тестов: сбросить кэш между кейсами.
export const resetCatalogVehicleCache = () => cache.clear()

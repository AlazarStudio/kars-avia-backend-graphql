/**
 * Read-only: проверка предпосылок жёсткого режима FAP_SCOPE_ENFORCE.
 *
 * Флаг режет выдачу заявок ФАП по принадлежности субъекта. Правило
 * (services/passengerRequest/fapScope.js) построено на белом списке: субъект,
 * у которого нет своей принадлежности, получает не полный доступ, а ОТКАЗ.
 * Значит до включения флага надо убедиться, что принадлежность заполнена у
 * всех, кто ходит в модуль.
 *
 * Скрипт НИЧЕГО не пишет: только считает и печатает.
 *
 * Запуск: node services/migrations/checkFapScopeReadiness.js
 */
import { prisma } from "../../prisma.js"

const DISPATCHER_ROLES = ["SUPERADMIN", "DISPATCHERADMIN", "DISPATCHERMODERATOR"]
const AIRLINE_ROLES = ["AIRLINEADMIN", "AIRLINEMODERATOR"]
const HOTEL_ROLES = ["HOTELADMIN", "HOTELMODERATOR"]
const KNOWN_ROLES = [...DISPATCHER_ROLES, ...AIRLINE_ROLES, ...HOTEL_ROLES]

const sample = (items, size = 5) => items.slice(0, size).map((item) => item.email || item.id)

// Ссылка, указывающая в никуда, отказа не даёт — она даёт молча пустой список,
// что заметить труднее. Поэтому висячие ссылки считаем отдельно.
async function countDangling(ids, finder) {
  const unique = [...new Set(ids.filter(Boolean))]
  if (unique.length === 0) return 0
  const found = await finder(unique)
  const alive = new Set(found.map((item) => item.id))
  return unique.filter((id) => !alive.has(id)).length
}

async function main() {
  const problems = []

  const externals = await prisma.externalUser.findMany({
    select: {
      id: true,
      email: true,
      scope: true,
      active: true,
      hotelId: true,
      airlineId: true,
      airportId: true,
      passengerRequestId: true
    }
  })

  const byScope = { HOTEL: [], DRIVER: [], REPRESENTATIVE: [] }
  for (const user of externals) {
    if (byScope[user.scope]) byScope[user.scope].push(user)
    else problems.push('ExternalUser scope "' + user.scope + '" — вне правила, такой субъект получит отказ')
  }

  const missing = {
    HOTEL: byScope.HOTEL.filter((u) => u.active && !u.hotelId),
    DRIVER: byScope.DRIVER.filter((u) => u.active && !u.passengerRequestId),
    REPRESENTATIVE: byScope.REPRESENTATIVE.filter(
      (u) => u.active && !(u.airlineId && u.airportId)
    )
  }

  console.log("=== Внешние пользователи ===")
  for (const scope of ["HOTEL", "DRIVER", "REPRESENTATIVE"]) {
    const all = byScope[scope]
    const active = all.filter((u) => u.active)
    console.log(
      scope + ": всего " + all.length + ", активных " + active.length +
        ", без принадлежности " + missing[scope].length
    )
    if (missing[scope].length) {
      console.log("  примеры: " + sample(missing[scope]).join(", "))
      problems.push(
        "ExternalUser " + scope + ": " + missing[scope].length +
          " активных без принадлежности — под флагом получат пустой список и 403"
      )
    }
  }

  const danglingHotel = await countDangling(
    byScope.HOTEL.map((u) => u.hotelId),
    (ids) => prisma.hotel.findMany({ where: { id: { in: ids } }, select: { id: true } })
  )
  const danglingRequest = await countDangling(
    byScope.DRIVER.map((u) => u.passengerRequestId),
    (ids) =>
      prisma.passengerRequest.findMany({ where: { id: { in: ids } }, select: { id: true } })
  )
  const danglingAirline = await countDangling(
    byScope.REPRESENTATIVE.map((u) => u.airlineId),
    (ids) => prisma.airline.findMany({ where: { id: { in: ids } }, select: { id: true } })
  )
  const danglingAirport = await countDangling(
    byScope.REPRESENTATIVE.map((u) => u.airportId),
    (ids) => prisma.airport.findMany({ where: { id: { in: ids } }, select: { id: true } })
  )
  console.log(
    "висячие ссылки: гостиница " + danglingHotel + ", заявка " + danglingRequest +
      ", авиакомпания " + danglingAirline + ", аэропорт " + danglingAirport
  )

  const users = await prisma.user.findMany({
    select: { id: true, email: true, role: true, hotelId: true, airlineId: true }
  })
  const unknownRole = users.filter((u) => !KNOWN_ROLES.includes(u.role))
  const hotelWithout = users.filter((u) => HOTEL_ROLES.includes(u.role) && !u.hotelId)
  const airlineWithout = users.filter((u) => AIRLINE_ROLES.includes(u.role) && !u.airlineId)

  console.log("=== Пользователи CRM ===")
  console.log(
    "всего " + users.length + ", роль вне правила " + unknownRole.length +
      ", гостиничные без hotelId " + hotelWithout.length +
      ", авиакомпанийные без airlineId " + airlineWithout.length
  )
  if (unknownRole.length) {
    console.log("  роли: " + [...new Set(unknownRole.map((u) => u.role))].join(", "))
    problems.push("User: " + unknownRole.length + " с ролью вне белого списка — получат отказ")
  }
  if (hotelWithout.length) {
    console.log("  без hotelId: " + sample(hotelWithout).join(", "))
    problems.push("User: " + hotelWithout.length + " гостиничных без hotelId — получат отказ")
  }
  if (airlineWithout.length) {
    console.log("  без airlineId: " + sample(airlineWithout).join(", "))
    problems.push("User: " + airlineWithout.length + " авиакомпанийных без airlineId — получат отказ")
  }

  const personals = await prisma.airlinePersonal.findMany({
    select: { id: true, email: true, airlineId: true }
  })
  const personalWithout = personals.filter((p) => !p.airlineId)
  console.log("=== Персонал авиакомпаний ===")
  console.log("всего " + personals.length + ", без airlineId " + personalWithout.length)
  if (personalWithout.length) {
    console.log("  примеры: " + sample(personalWithout).join(", "))
    problems.push(
      "AirlinePersonal: " + personalWithout.length + " без airlineId — получат отказ"
    )
  }

  console.log("=== Вердикт ===")
  if (problems.length === 0) {
    console.log("блокеров по данным нет")
  } else {
    for (const problem of problems) console.log("БЛОКЕР: " + problem)
  }
  console.log(
    "⚠️ Данные — только половина проверки. Вторая половина — лог наблюдения:",
    "grep -rh FAP_SCOPE logs/warn/"
  )

  await prisma.$disconnect()
}

main().catch(async (error) => {
  console.error(error)
  await prisma.$disconnect()
  process.exit(1)
})

/**
 * One-off: заполняет ExternalUser.airlineId/airportId/passengerRequestId,
 * разбирая автогенерируемый email. До появления этих полей принадлежность
 * внешнего пользователя существовала только там.
 *
 * Запуск: node services/migrations/backfillExternalUserScopeFields.js
 * Идемпотентна: записи с уже заполненными полями пропускаются.
 */
import { prisma } from "../../prisma.js"

// representative-{airlineId}-{airportId}@auto.internal
// Первая группа ленивая: заглушки генератора ключа («unknown-airline»,
// «no-airport») сами содержат дефисы, и жадный разбор съел бы у соседнего
// сегмента настоящий ObjectId.
const REPRESENTATIVE = /^representative-(.+?)-(.+)@auto\.internal$/
// driver-{requestId}-{serviceKind}-{driverId|driverIndex}@auto.internal
// Хвост забираем целиком: driverId — это uuid водителя, он содержит дефисы.
// requestId и serviceKind дефисов не содержат (ObjectId и transfer/baggage).
const DRIVER = /^driver-([^@-]+)-([^@-]+)-(.+)@auto\.internal$/

// Идентификатор — ObjectId из 24 hex-символов.
const isObjectId = (value) => /^[0-9a-f]{24}$/i.test(String(value))

function parse(user) {
  if (user.scope === "REPRESENTATIVE") {
    const m = REPRESENTATIVE.exec(user.email)
    if (!m) return null
    const [, airlineId, airportId] = m
    // «unknown-airline» и «no-airport» — заглушки генератора ключа,
    // принадлежностью не являются.
    return {
      airlineId: isObjectId(airlineId) ? airlineId : null,
      airportId: isObjectId(airportId) ? airportId : null
    }
  }
  if (user.scope === "DRIVER") {
    const m = DRIVER.exec(user.email)
    if (!m) return null
    const [, requestId] = m
    // driverId не восстанавливаем: хвост адреса — uuid водителя внутри
    // embedded-сервиса, а ExternalUser.driverId ссылается на модель Driver.
    return {
      passengerRequestId: isObjectId(requestId) ? requestId : null
    }
  }
  return null
}

async function main() {
  const users = await prisma.externalUser.findMany({
    where: { scope: { in: ["REPRESENTATIVE", "DRIVER"] } },
    select: {
      id: true,
      email: true,
      scope: true,
      airlineId: true,
      airportId: true,
      passengerRequestId: true
    }
  })

  let filled = 0
  let skipped = 0
  let unparsed = 0

  for (const user of users) {
    const parsed = parse(user)
    if (!parsed) {
      unparsed += 1
      console.log(`не разобран: ${user.scope} ${user.email}`)
      continue
    }
    const data = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (value && !user[key]) data[key] = value
    }
    if (Object.keys(data).length === 0) {
      skipped += 1
      continue
    }
    await prisma.externalUser.update({ where: { id: user.id }, data })
    filled += 1
  }

  console.log(`заполнено: ${filled}, пропущено: ${skipped}, не разобрано: ${unparsed}`)
  await prisma.$disconnect()
}

main().catch(async (error) => {
  console.error(error)
  await prisma.$disconnect()
  process.exit(1)
})

// Backfill: проставляет requestNumber для PassengerRequest без него,
// чтобы можно было создать уникальный индекс на поле (prisma db push).
// Формат: {seq4}{airportCode}{MM}{YY}f (как в createPassengerRequest).
//
// Запуск:  node scripts/backfill-passenger-request-numbers.js

import { prisma } from "../prisma.js"

async function main() {
  const nullRequests = await prisma.passengerRequest.findMany({
    where: { requestNumber: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, airportId: true, createdAt: true }
  })

  console.log(`Найдено заявок без requestNumber: ${nullRequests.length}`)
  if (nullRequests.length === 0) {
    console.log("Backfill не требуется.")
    return
  }

  // Найти максимальный существующий seq, чтобы продолжить нумерацию.
  const withNumber = await prisma.passengerRequest.findMany({
    where: { requestNumber: { not: null } },
    select: { requestNumber: true }
  })
  let maxSeq = 0
  for (const r of withNumber) {
    const seq = parseInt(String(r.requestNumber).slice(0, 4), 10)
    if (Number.isFinite(seq) && seq > maxSeq) maxSeq = seq
  }
  let nextSeq = maxSeq + 1
  console.log(`Стартовый seq: ${nextSeq}`)

  // Предзагрузить коды аэропортов.
  const airportIds = [
    ...new Set(nullRequests.map((r) => r.airportId).filter(Boolean))
  ]
  const airports = airportIds.length
    ? await prisma.airport.findMany({
        where: { id: { in: airportIds } },
        select: { id: true, code: true }
      })
    : []
  const codeById = Object.fromEntries(airports.map((a) => [a.id, a.code]))

  let updated = 0
  for (const req of nullRequests) {
    const date = req.createdAt || new Date()
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const year = String(date.getFullYear()).slice(-2)
    const airportCode = req.airportId ? codeById[req.airportId] || "XXX" : "XXX"
    const seqStr = String(nextSeq).padStart(4, "0")
    const requestNumber = `${seqStr}${airportCode}${month}${year}f`

    await prisma.passengerRequest.update({
      where: { id: req.id },
      data: { requestNumber }
    })
    console.log(`${req.id} → ${requestNumber}`)
    nextSeq++
    updated++
  }

  console.log(`Готово. Обновлено заявок: ${updated}`)
}

main()
  .catch((e) => {
    console.error("Ошибка backfill:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

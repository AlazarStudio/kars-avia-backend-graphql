// Backfill: проставляет submittedAt существующим PassengerRequestHotelReport,
// у которых это поле пустое (null или вовсе отсутствует в документе).
// Иначе после деплоя поля submittedAt авиакомпании перестанут видеть всю
// историю отчётов, пока диспетчер вручную не отправит каждый заново.
// Значение берётся из updatedAt — эти отчёты авиакомпания уже видела,
// прятать их задним числом было бы регрессом.
//
// Обновление сделано сырой командой Mongo ($runCommandRaw), а не через
// Prisma Client: у submittedAt в схеме нет `@updatedAt`, но у соседнего
// updatedAt он есть — обычный prisma.update() перезаписал бы updatedAt
// текущим временем и стёр бы те самые даты, которые мы хотим сохранить.
//
// Запуск:  node scripts/backfill-hotel-report-submitted-at.js

import { prisma } from "../prisma.js"

async function main() {
  // В Mongo `{ submittedAt: null }` ловит и явный null, и отсутствие поля,
  // но условие пишем явно через $or, чтобы намерение читалось из кода.
  const filter = {
    $or: [{ submittedAt: null }, { submittedAt: { $exists: false } }]
  }

  const toBackfillCount = await prisma.passengerRequestHotelReport.count({
    where: {
      OR: [
        { submittedAt: null },
        { submittedAt: { isSet: false } }
      ]
    }
  })

  console.log(`Найдено отчётов без submittedAt: ${toBackfillCount}`)
  if (toBackfillCount === 0) {
    console.log("Backfill не требуется.")
    return
  }

  // Pipeline-обновление: submittedAt = значение updated_at того же документа.
  // Требует MongoDB 4.2+; на более старом сервере команда упадёт с ошибкой —
  // это ожидаемо, глушить её не нужно.
  const result = await prisma.$runCommandRaw({
    update: "PassengerRequestHotelReport",
    updates: [
      {
        q: filter,
        u: [{ $set: { submittedAt: "$updated_at" } }],
        multi: true
      }
    ]
  })

  const modified = result?.nModified ?? result?.n ?? 0
  console.log(`Готово. Обновлено отчётов: ${modified}`)

  const remaining = await prisma.passengerRequestHotelReport.count({
    where: {
      OR: [
        { submittedAt: null },
        { submittedAt: { isSet: false } }
      ]
    }
  })

  if (remaining > 0) {
    console.warn(`ВНИМАНИЕ: после backfill остались отчёты без submittedAt: ${remaining}`)
  } else {
    console.log("Проверка: отчётов без submittedAt не осталось.")
  }
}

main()
  .catch((e) => {
    console.error("Ошибка backfill:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

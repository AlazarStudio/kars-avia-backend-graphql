/**
 * One-off: чинит уже испорченные документы ФАП, у которых последний ОТКРЫТЫЙ
 * интервал accommodationChesses указывает не на ту гостиницу, в people которой
 * гость лежит.
 *
 * Откуда порча: removePassengerRequestHotel синтезировал недостающий интервал
 * по НОВОМУ индексу гостиницы, а следом прогонял его через карту сдвига,
 * которая ждёт СТАРЫЙ, — перевод случался дважды, и легаси-гость получал индекс
 * и имя чужой гостиницы. Само это не рассасывается: массив уже непустой, и
 * ensureAccommodationChesses его больше не пересинтезирует.
 *
 * Запуск:
 *   node services/migrations/healPassengerHotelChessIndexes.js
 *     — сухой прогон: только считает и печатает, ничего не пишет
 *   node services/migrations/healPassengerHotelChessIndexes.js --apply
 *     — записывает исправления
 */
import { prisma } from "../../prisma.js"

// Правка боевых данных по умолчанию идёт вхолостую: сперва владелец смотрит
// масштаб, и только потом запускает запись.
const APPLY = process.argv.includes("--apply")

// Интервал открыт, пока не проставлен endAt. Отсутствующее поле и null для нас
// одно и то же, поэтому нестрогое сравнение.
const isOpen = (chess) => chess?.endAt == null

// Текущее размещение описывает ПОСЛЕДНИЙ открытый интервал. Закрытые не трогаем
// вовсе: они законно ссылаются на прежние гостиницы — так выглядит история
// переселений, и перевод их индексов затёр бы её.
const findLastOpenIndex = (chesses) => {
  for (let i = chesses.length - 1; i >= 0; i -= 1) {
    if (isOpen(chesses[i])) return i
  }
  return -1
}

const requestLabel = (request) =>
  request?.requestNumber || request?.flightNumber || request?.id

async function main() {
  const requests = await prisma.passengerRequest.findMany({
    where: { livingService: { is: { hotels: { isEmpty: false } } } },
    select: {
      id: true,
      requestNumber: true,
      flightNumber: true,
      livingService: true
    }
  })

  let scanned = 0
  let mismatched = 0
  let withoutChesses = 0
  let updated = 0
  const details = []

  for (const request of requests) {
    scanned += 1

    const living = request.livingService
    const hotels = living?.hotels || []
    let dirty = false

    const nextHotels = hotels.map((hotel, hotelIdx) => {
      const hotelName = hotel?.name ?? null
      const nextPeople = (hotel?.people || []).map((person) => {
        const chesses = Array.isArray(person?.accommodationChesses)
          ? person.accommodationChesses
          : []

        // Гостей без размещения не чиним: синтез потребовал бы выдумать startAt
        // — это отдельный вопрос (реестр дефектов, №21). К тому же такая форма
        // залечивается сама следующей мутацией проживания.
        if (chesses.length === 0) {
          withoutChesses += 1
          return person
        }

        const openIdx = findLastOpenIndex(chesses)
        if (openIdx === -1) return person

        const open = chesses[openIdx]
        if (open?.hotelIndex === hotelIdx) return person

        mismatched += 1
        dirty = true
        details.push(
          `  заявка ${requestLabel(request)} · гостиница [${hotelIdx}] «${hotelName ?? "без названия"}» · ${person?.fullName || "без ФИО"}: hotelIndex ${open?.hotelIndex ?? "—"} → ${hotelIdx}, hotelName «${open?.hotelName ?? "—"}» → «${hotelName ?? "—"}»`
        )

        const nextChesses = chesses.map((chess, i) =>
          i === openIdx ? { ...chess, hotelIndex: hotelIdx, hotelName } : chess
        )
        return { ...person, accommodationChesses: nextChesses }
      })
      return { ...hotel, people: nextPeople }
    })

    if (!dirty || !APPLY) continue

    await prisma.passengerRequest.update({
      where: { id: request.id },
      data: { livingService: { ...living, hotels: nextHotels } }
    })
    updated += 1
  }

  if (details.length > 0) {
    console.log("Расхождения:")
    for (const line of details) console.log(line)
    console.log("")
  }

  console.log(`Просмотрено заявок с гостиницами: ${scanned}`)
  console.log(`Гостей с расхождением: ${mismatched}`)
  console.log(`Гостей с пустым размещением (не чиним): ${withoutChesses}`)

  if (APPLY) {
    console.log(`Обновлено заявок: ${updated}`)
    console.log("Режим: ЗАПИСЬ (--apply). Изменения сохранены.")
  } else {
    console.log(
      "Режим: СУХОЙ ПРОГОН. Ничего не записано — для записи запустить с --apply"
    )
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())

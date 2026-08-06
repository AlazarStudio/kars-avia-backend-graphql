/**
 * One-off: дописывает город в адреса гостиниц заявок ФАП и в связанные с ними
 * адреса поездок водителей.
 *
 * Откуда порча: в справочнике город и улица лежат раздельно (Information.city и
 * Information.address), а форма добавления гостиницы копировала в заявку только
 * улицу. Дальше обрезанный адрес уходил в поле водителя и в карту PWA, где
 * геокодер не находит точку: «ул. Кирова, 114, стр. 1» без города не разрешается.
 * Замер дев-стенда на момент написания: 41 гостиница заявок из 46 и 20 маршрутов
 * из 21 — без города.
 *
 * ⚠️ Трогаем ТОЛЬКО те записи, где адрес заявки дословно равен адресу справочника,
 * то есть является нетронутой копией. Если оператор правил адрес руками, его
 * версия остаётся как есть — угадывать за него нельзя.
 *
 * Пишем напрямую, мимо конверта мутаций: ни истории, ни писем, ни публикации в
 * подписку. Для правки данных это и нужно.
 *
 * Запуск:
 *   node services/migrations/backfillPassengerHotelAddressCity.js
 *     — сухой прогон: только считает и печатает, ничего не пишет
 *   node services/migrations/backfillPassengerHotelAddressCity.js --apply
 *     — записывает исправления
 */
import { prisma } from "../../prisma.js"

const APPLY = process.argv.includes("--apply")

// Зеркало фронтового composeHotelAddress (src/utils/hotelAddress.js в CRM):
// город приписывается спереди и только если его ещё нет в строке. Сравнение по
// подстроке без учёта регистра — в справочнике встречаются и «Абакан», и «г. Абакан».
const composeHotelAddress = (city, address) => {
  const c = String(city ?? "").trim()
  const a = String(address ?? "").trim()
  if (!c) return a
  if (!a) return c
  if (a.toLowerCase().includes(c.toLowerCase())) return a
  return c + ", " + a
}

const sameString = (left, right) =>
  String(left ?? "").trim() === String(right ?? "").trim()

async function main() {
  const requests = await prisma.passengerRequest.findMany({
    select: {
      id: true,
      requestNumber: true,
      livingService: true,
      transferService: true,
      departureTransferService: true,
      intercityTransferService: true,
      baggageDeliveryService: true
    }
  })

  // Справочник читаем один раз: заявок много, гостиниц мало.
  const hotels = await prisma.hotel.findMany({
    select: { id: true, information: true }
  })
  const infoById = new Map(hotels.map((hotel) => [hotel.id, hotel.information]))

  const stats = {
    requests: requests.length,
    hotelsSeen: 0,
    hotelsFixed: 0,
    hotelsNoHotelId: 0,
    hotelsEdited: 0,
    hotelsAlreadyFull: 0,
    driversSeen: 0,
    driversFixed: 0,
    written: 0
  }
  const examples = []

  for (const request of requests) {
    const living = request.livingService
    if (!living?.hotels?.length) continue

    // Карта «старый адрес гостиницы → новый»: по ней потом чиним поездки.
    const rewritten = new Map()
    let livingChanged = false

    const hotels = living.hotels.map((hotel) => {
      stats.hotelsSeen += 1
      if (!hotel?.hotelId) {
        stats.hotelsNoHotelId += 1
        return hotel
      }
      const info = infoById.get(hotel.hotelId)
      if (!info) {
        stats.hotelsNoHotelId += 1
        return hotel
      }
      // Чиним только нетронутую копию: адрес заявки дословно равен справочному.
      if (!sameString(hotel.address, info.address)) {
        stats.hotelsEdited += 1
        return hotel
      }
      const next = composeHotelAddress(info.city, info.address)
      if (sameString(next, hotel.address)) {
        stats.hotelsAlreadyFull += 1
        return hotel
      }
      stats.hotelsFixed += 1
      livingChanged = true
      if (String(hotel.address ?? "").trim()) {
        rewritten.set(String(hotel.address).trim(), next)
      }
      if (examples.length < 8) {
        examples.push(
          request.requestNumber + " · " + hotel.name + ": «" + hotel.address + "» → «" + next + "»"
        )
      }
      return { ...hotel, address: next }
    })

    // Поездки водителей: адрес стороны гостиницы — копия того же обрезанного
    // адреса. Меняем только дословные совпадения, чужие строки не трогаем.
    const patchDrivers = (service) => {
      if (!service?.drivers?.length) return { service, changed: false }
      let changed = false
      const drivers = service.drivers.map((driver) => {
        stats.driversSeen += 1
        const from = rewritten.get(String(driver?.addressFrom ?? "").trim())
        const to = rewritten.get(String(driver?.addressTo ?? "").trim())
        if (!from && !to) return driver
        changed = true
        stats.driversFixed += 1
        return {
          ...driver,
          ...(from ? { addressFrom: from } : {}),
          ...(to ? { addressTo: to } : {})
        }
      })
      return { service: { ...service, drivers }, changed }
    }

    const transfer = patchDrivers(request.transferService)
    const departure = patchDrivers(request.departureTransferService)
    const intercity = patchDrivers(request.intercityTransferService)
    const baggage = patchDrivers(request.baggageDeliveryService)

    const anyChange =
      livingChanged ||
      transfer.changed ||
      departure.changed ||
      intercity.changed ||
      baggage.changed
    if (!anyChange) continue

    if (APPLY) {
      await prisma.passengerRequest.update({
        where: { id: request.id },
        data: {
          ...(livingChanged ? { livingService: { ...living, hotels } } : {}),
          ...(transfer.changed ? { transferService: transfer.service } : {}),
          ...(departure.changed ? { departureTransferService: departure.service } : {}),
          ...(intercity.changed ? { intercityTransferService: intercity.service } : {}),
          ...(baggage.changed ? { baggageDeliveryService: baggage.service } : {})
        }
      })
    }
    stats.written += 1
  }

  console.log(APPLY ? "=== ЗАПИСЬ ===" : "=== СУХОЙ ПРОГОН (ничего не записано) ===")
  console.log("заявок просмотрено:      " + stats.requests)
  console.log("гостиниц в заявках:      " + stats.hotelsSeen)
  console.log("  дописан город:         " + stats.hotelsFixed)
  console.log("  адрес правили руками:  " + stats.hotelsEdited + " (не трогаем)")
  console.log("  город уже был:         " + stats.hotelsAlreadyFull)
  console.log("  без ссылки на справочник: " + stats.hotelsNoHotelId)
  console.log("поездок водителей:       " + stats.driversSeen)
  console.log("  адрес поездки обновлён: " + stats.driversFixed)
  console.log("заявок к записи:         " + stats.written)
  if (examples.length) {
    console.log("\nпримеры:")
    for (const line of examples) console.log("  " + line)
  }
  if (!APPLY && stats.written > 0) {
    console.log("\nчтобы записать: node services/migrations/backfillPassengerHotelAddressCity.js --apply")
  }

  await prisma.$disconnect()
}

main().catch(async (error) => {
  console.error(error)
  await prisma.$disconnect()
  process.exit(1)
})

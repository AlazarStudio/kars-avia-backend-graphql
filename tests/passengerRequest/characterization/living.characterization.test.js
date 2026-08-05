// Характеризационные тесты группы «Проживание — гостиницы и заселение»:
// добавление/удаление/правка гостиницы в услуге проживания и заселение людей
// в неё (поштучно, пачкой, правка гостя, номер комнаты, выселение из списка).
//
// Фиксируют поведение КАК ЕСТЬ, включая дефекты. Тест, закрепляющий дефект,
// помечен номером из реестра спеки — при починке дефекта обязан измениться
// именно он.

import test from "node:test"
import assert from "node:assert/strict"
import resolvers from "../../../resolvers/passengerRequest/passengerRequest.resolver.js"
import { installPrismaDouble } from "../../helpers/prismaDouble.js"
import {
  installPubsubSpy,
  releasePubsubAfterTests
} from "../../helpers/fapHarness.js"
import { runFapMutation as runMutation } from "../../helpers/runFapMutation.js"
import { resolveEmailActionForLog } from "../../../services/notification/passengerRequestEmailActions.js"
import {
  makeRequest,
  makeContext,
  makeHotelContext
} from "../fixtures/passengerRequest.js"

// Обязательно в каждом файле, импортирующем резолвер: иначе при заданном
// REDIS_URL клиенты Redis удержат процесс и раннер не завершится.
releasePubsubAfterTests()

// Общий хелпер отдаёт нормализованный срез. Части тестов этой группы нужен
// сырой доступ: аргументы deleteMany/updateMany отчётов внутри $transaction и
// следы УПАВШЕЙ мутации. Форму runFapMutation ради них не расширяем — она
// общая на все группы, поэтому стенд ставим здесь (тот же приём, что в
// core.characterization.test.js).
async function runRaw(
  name,
  args,
  { request = makeRequest(), context = makeContext() } = {}
) {
  const double = installPrismaDouble({ documents: { passengerRequest: request } })
  const spy = installPubsubSpy()
  let result = null
  let error = null
  try {
    result = await resolvers.Mutation[name](null, args, context)
  } catch (e) {
    error = e
  } finally {
    spy.restore()
    double.restore()
  }
  return { result, error, double, published: spy.published }
}

// Легаси-гость: документ, созданный до появления personType/personCategory/
// accommodationChesses и до перехода на personId. Именно на нём видно, что
// делает (и чего не делает) ensureHotelPerson.
const legacyGuest = (fullName = "Легаси Гость") => ({ fullName })

// Заявка с легаси-гостем во ВТОРОЙ гостинице (в фикстуре она пустая).
// Нужна, чтобы отличить «мутация тронула свою гостиницу» от «мутация прошлась
// по всем гостиницам услуги».
function requestWithLegacyInSecondHotel() {
  const request = makeRequest()
  request.livingService.hotels[1].people = [legacyGuest()]
  return request
}

// Три гостиницы; легаси-гость — в ТРЕТЬЕЙ. Отдельная фикстура нужна ровно для
// дефекта №9: при двух гостиницах он проявляется иначе (см. тесты ниже).
function requestWithThreeHotels() {
  const request = makeRequest()
  request.livingService.hotels.push({
    itemId: "bbbbbbbb-0000-4000-8000-000000000003",
    hotelId: "hotel-3",
    name: "Сибирь",
    address: "г. Абакан, ул. Щетинкина, 9",
    peopleCount: 2,
    people: [legacyGuest()]
  })
  return request
}

// Гостиница с заданной вместимостью и N уже заселёнными гостями.
function requestWithPlaced({ capacity, placed }) {
  const request = makeRequest()
  const hotel = request.livingService.hotels[0]
  hotel.peopleCount = capacity
  hotel.people = Array.from({ length: placed }, (_, i) => ({
    personId: `cccccccc-0000-4000-8000-00000000000${i + 1}`,
    fullName: `Гость ${i + 1}`,
    personType: "PASSENGER",
    personCategory: "ADULT",
    accommodationChesses: [
      {
        hotelIndex: 0,
        hotelName: "Азия",
        startAt: "2026-08-04T12:00:00.000Z",
        endAt: null,
        reason: null
      }
    ]
  }))
  return request
}

const newGuest = (fullName = "Новый Гость") => ({
  fullName,
  personType: "PASSENGER",
  personCategory: "ADULT"
})

// ───────────────────────── addPassengerRequestHotel ─────────────────────────

test("addPassengerRequestHotel: гостиница дописывается в конец, лог, уведомление, публикация", async () => {
  const run = await runMutation("addPassengerRequestHotel", {
    requestId: "req-1",
    hotel: { hotelId: "hotel-3", name: "Сибирь", peopleCount: 5 }
  })

  assert.equal(run.written.length, 1)
  assert.deepEqual(Object.keys(run.written[0]), ["livingService"])
  const living = run.written[0].livingService
  assert.equal(living.hotels.length, 3)
  // Гостиница в фикстуре не первая, поэтому статус и отметки услуги не трогаются.
  assert.equal(living.status, "IN_PROGRESS")
  assert.deepEqual(living.times, { createdAt: "<DATE>" })

  const added = living.hotels[2]
  assert.equal(added.name, "Сибирь")
  assert.equal(added.peopleCount, 5)
  // itemId проставляется генератором, если его нет во входе.
  assert.equal(added.itemId, "<UUID>")
  // Стенд не знает такой гостиницы, generateHotelLinks выходит на первом же
  // чтении и отдаёт пару null — ключи в документе всё равно появляются.
  assert.equal(added.linkCRM, null)
  assert.equal(added.linkPWA, null)
  // Люди уже стоявших гостиниц уносятся как есть, без нормализации.
  assert.equal(living.hotels[1].people.length, 0)

  assert.equal(run.logged.length, 1)
  assert.equal(run.logged[0].action, "add_passenger_request_hotel")
  assert.equal(run.notified.length, 1)
  assert.equal(
    run.notified[0].description.action,
    "update_hotel_chess_passenger_request"
  )
  assert.deepEqual(run.published, ["PASSENGER_REQUEST_UPDATED", "NOTIFICATION"])
  assert.ok(
    run.order.indexOf("publish:PASSENGER_REQUEST_UPDATED") <
      run.order.indexOf("notification.create"),
    "публикация раньше сайтового уведомления"
  )
})

test("addPassengerRequestHotel: itemId из входа сохраняется", async () => {
  const run = await runRaw("addPassengerRequestHotel", {
    requestId: "req-1",
    hotel: {
      itemId: "bbbbbbbb-0000-4000-8000-000000000099",
      hotelId: "hotel-3",
      name: "Сибирь"
    }
  })

  const hotels = run.result.livingService.hotels
  assert.equal(hotels[2].itemId, "bbbbbbbb-0000-4000-8000-000000000099")
})

test("addPassengerRequestHotel: ПЕРВАЯ гостиница переводит услугу в ACCEPTED в обход движка статусов", async () => {
  // Здесь не вызывается recomputeServiceStatus вовсе: статус выставляется
  // напрямую по признаку «до этого гостиниц не было».
  const request = makeRequest()
  request.livingService.hotels = []
  request.livingService.status = "NEW"
  request.livingService.times = {}

  const run = await runMutation(
    "addPassengerRequestHotel",
    { requestId: "req-1", hotel: { hotelId: "hotel-3", name: "Сибирь" } },
    { request }
  )

  const living = run.written[0].livingService
  assert.equal(living.status, "ACCEPTED")
  assert.deepEqual(living.times, { acceptedAt: "<DATE>" })
})

test("addPassengerRequestHotel: первая гостиница поднимает даже ОТМЕНЁННУЮ услугу до ACCEPTED", async () => {
  // Обход движка статусов виден лучше всего на CANCELLED: весь остальной
  // модуль считает отменённую услугу неприкасаемой (recomputeServiceStatus
  // возвращает её статус без изменений), а эта ветка её переоткрывает.
  const request = makeRequest()
  request.livingService.hotels = []
  request.livingService.status = "CANCELLED"
  request.livingService.times = { cancelledAt: "2026-08-02T10:00:00.000Z" }

  const run = await runMutation(
    "addPassengerRequestHotel",
    { requestId: "req-1", hotel: { hotelId: "hotel-3", name: "Сибирь" } },
    { request }
  )

  assert.equal(run.written[0].livingService.status, "ACCEPTED")
})

test("addPassengerRequestHotel НЕ прогоняет ensureHotelPerson: легаси-гость соседней гостиницы остаётся сырым", async () => {
  // Скрытая миграция данных (см. тесты ниже) есть у шести мутаций группы, но
  // не у этой: гостиницы уносятся спредом, люди не трогаются.
  const run = await runRaw(
    "addPassengerRequestHotel",
    { requestId: "req-1", hotel: { hotelId: "hotel-3", name: "Сибирь" } },
    { request: requestWithLegacyInSecondHotel() }
  )

  const guest = run.result.livingService.hotels[1].people[0]
  assert.deepEqual(guest, { fullName: "Легаси Гость" })
})

// ─────────────────────── removePassengerRequestHotel ───────────────────────

test("removePassengerRequestHotel: гостиница вырезается, лог, уведомление, публикация", async () => {
  const run = await runMutation("removePassengerRequestHotel", {
    requestId: "req-1",
    hotelIndex: 1
  })

  assert.equal(run.written.length, 1)
  assert.deepEqual(Object.keys(run.written[0]), ["livingService"])
  const living = run.written[0].livingService
  assert.equal(living.hotels.length, 1)
  assert.equal(living.hotels[0].name, "Азия")
  // Людей в услуге не убавилось — статус остаётся прежним.
  assert.equal(living.status, "IN_PROGRESS")

  assert.equal(run.logged.length, 1)
  assert.equal(run.logged[0].action, "remove_passenger_request_hotel")
  assert.equal(run.notified.length, 1)
  assert.equal(
    run.notified[0].description.action,
    "update_hotel_chess_passenger_request"
  )
  assert.deepEqual(run.published, ["PASSENGER_REQUEST_UPDATED", "NOTIFICATION"])
})

test("removePassengerRequestHotel: удаление ПОСЛЕДНЕЙ гостиницы сбрасывает услугу в NEW", async () => {
  const request = makeRequest()
  request.livingService.hotels = [request.livingService.hotels[0]]

  const run = await runMutation(
    "removePassengerRequestHotel",
    { requestId: "req-1", hotelIndex: 0 },
    { request }
  )

  const living = run.written[0].livingService
  assert.deepEqual(living.hotels, [])
  assert.equal(living.status, "NEW")
  // Отметки времени при сбросе в NEW не пересчитываются — уносятся как были.
  assert.deepEqual(living.times, { createdAt: "<DATE>" })
})

test("removePassengerRequestHotel идёт через $transaction и сдвигает отчёты по гостиницам", async () => {
  const run = await runRaw("removePassengerRequestHotel", {
    requestId: "req-1",
    hotelIndex: 0
  })

  const removed = run.double.callsTo("passengerRequestHotelReport", "deleteMany")
  assert.equal(removed.length, 1)
  assert.deepEqual(removed[0].args.where, {
    passengerRequestId: "req-1",
    hotelIndex: 0
  })

  const shifted = run.double.callsTo("passengerRequestHotelReport", "updateMany")
  assert.equal(shifted.length, 1)
  assert.deepEqual(shifted[0].args.where, {
    passengerRequestId: "req-1",
    hotelIndex: { gt: 0 }
  })
  assert.deepEqual(shifted[0].args.data, { hotelIndex: { decrement: 1 } })

  assert.equal(run.double.callsTo("$transaction", "call").length, 1)
  // Все три операции — часть одной транзакции, отдельного апдейта заявки нет.
  assert.equal(run.double.callsTo("passengerRequest", "update").length, 1)
})

test("removePassengerRequestHotel сдвигает выселения и отцепляет поездки удалённой гостиницы", async () => {
  const request = makeRequest()
  request.livingService.evictions = [
    { hotelIndex: 0, hotelName: "Азия", personIndex: 0, reason: "выехал" },
    { hotelIndex: 1, hotelName: "Чаплан", personIndex: 0, reason: "переехал" }
  ]
  request.transferService.drivers = [
    {
      fullName: "Водитель",
      hotelItemId: "bbbbbbbb-0000-4000-8000-000000000001",
      people: []
    }
  ]
  request.baggageDeliveryService.drivers = [
    { fullName: "Багажный", hotelItemId: null, people: [] }
  ]

  const run = await runMutation(
    "removePassengerRequestHotel",
    { requestId: "req-1", hotelIndex: 0 },
    { request }
  )

  // Выселения удалённой гостиницы вычищены, оставшееся пересажено на новый индекс.
  assert.deepEqual(run.written[0].livingService.evictions, [
    { hotelIndex: 0, hotelName: "Чаплан", personIndex: 0, reason: "переехал" }
  ])

  // Поездка, привязанная к удалённой гостинице, теряет привязку; услуга без
  // таких поездок в апдейт вообще не попадает.
  assert.deepEqual(Object.keys(run.written[0]), [
    "livingService",
    "transferService"
  ])
  assert.equal(run.written[0].transferService.drivers[0].hotelItemId, null)
})

test("removePassengerRequestHotel: при удалении первой из ТРЁХ гостиниц легаси-гость третьей сохраняет своё размещение", async () => {
  // Раньше ensureHotelPerson достраивал отсутствующий accommodationChesses по
  // НОВОМУ индексу гостиницы (индексу в уже отфильтрованном массиве), а следом
  // та же запись прогонялась через карту сдвига, которая ждёт СТАРЫЙ индекс, —
  // сдвиг применялся дважды, и гость «Сибири» получал индекс 0 с названием
  // «Чаплан». Теперь синтез идёт по старому индексу (2), карта переводит его
  // ровно один раз (2 → 1), и гость остаётся в своей гостинице.
  const run = await runRaw(
    "removePassengerRequestHotel",
    { requestId: "req-1", hotelIndex: 0 },
    { request: requestWithThreeHotels() }
  )

  const hotels = run.result.livingService.hotels
  assert.equal(hotels.length, 2)
  assert.equal(hotels[1].name, "Сибирь")

  const chesses = hotels[1].people[0].accommodationChesses
  assert.equal(chesses.length, 1)
  assert.equal(chesses[0].hotelIndex, 1, "указывает на «Сибирь», а не на «Чаплан»")
  assert.equal(chesses[0].hotelName, "Сибирь")
  // Интервал открытый: гость заселён, а не выселен.
  assert.equal(chesses[0].endAt, null)
})

test("removePassengerRequestHotel: при ДВУХ гостиницах легаси-гость оставшейся сохраняет своё размещение", async () => {
  // Вторая грань того же двойного перевода: достроенная запись получала индекс
  // 0, численно совпадала с удалённой гостиницей и тут же отсеивалась фильтром
  // «записи удалённой гостиницы» — гость оставался вовсе без размещения.
  // Синтез по старому индексу (1) фильтр проходит, карта переводит 1 → 0.
  const run = await runRaw(
    "removePassengerRequestHotel",
    { requestId: "req-1", hotelIndex: 0 },
    { request: requestWithLegacyInSecondHotel() }
  )

  const guest = run.result.livingService.hotels[0].people[0]
  const chesses = guest.accommodationChesses
  assert.equal(chesses.length, 1)
  assert.equal(chesses[0].hotelIndex, 0)
  assert.equal(chesses[0].hotelName, "Чаплан")
  assert.equal(chesses[0].endAt, null)
})

test("removePassengerRequestHotel: удаление ПОСЛЕДНЕЙ по счёту гостиницы размещения не портит", async () => {
  // Контрольный случай к дефекту №9: индексы оставшихся гостиниц не съезжают,
  // и запись размещения остаётся на своей гостинице.
  const run = await runRaw("removePassengerRequestHotel", {
    requestId: "req-1",
    hotelIndex: 1
  })

  const chesses = run.result.livingService.hotels[0].people[0].accommodationChesses
  assert.equal(chesses.length, 1)
  assert.equal(chesses[0].hotelIndex, 0)
  assert.equal(chesses[0].hotelName, "Азия")
})

test("removePassengerRequestHotel: индекс вне диапазона отбивается до записи", async () => {
  const run = await runRaw("removePassengerRequestHotel", {
    requestId: "req-1",
    hotelIndex: 5
  })

  assert.match(run.error.message, /Invalid hotelIndex/)
  assert.equal(run.double.callsTo("passengerRequest", "update").length, 0)
  assert.equal(run.double.callsTo("$transaction", "call").length, 0)
  assert.equal(run.published.length, 0)
})

// ─────────────────────── updatePassengerRequestHotel ───────────────────────

test("updatePassengerRequestHotel правит только редактируемые поля, люди и itemId сохраняются", async () => {
  const run = await runRaw("updatePassengerRequestHotel", {
    requestId: "req-1",
    hotelIndex: 0,
    hotel: {
      name: "Азия Плюс",
      peopleCount: 7,
      address: "г. Абакан, ул. Ленина, 2",
      link: "https://example.test/azia",
      hotelId: "hotel-9"
    }
  })

  const hotel = run.result.livingService.hotels[0]
  assert.equal(hotel.name, "Азия Плюс")
  assert.equal(hotel.peopleCount, 7)
  assert.equal(hotel.address, "г. Абакан, ул. Ленина, 2")
  assert.equal(hotel.link, "https://example.test/azia")
  assert.equal(hotel.hotelId, "hotel-9")
  assert.equal(hotel.itemId, "bbbbbbbb-0000-4000-8000-000000000001")
  assert.equal(hotel.people.length, 1)
  assert.equal(hotel.people[0].fullName, "Иванов Иван")
  // Соседняя гостиница уносится как есть.
  assert.equal(run.result.livingService.hotels[1].name, "Чаплан")
})

test("updatePassengerRequestHotel: лог, отсутствие статусных правок, уведомление и публикация", async () => {
  const run = await runMutation("updatePassengerRequestHotel", {
    requestId: "req-1",
    hotelIndex: 0,
    hotel: { name: "Азия Плюс" }
  })

  assert.deepEqual(Object.keys(run.written[0]), ["livingService"])
  // Статус и отметки услуги уносятся из prev без пересчёта.
  assert.equal(run.written[0].livingService.status, "IN_PROGRESS")
  assert.deepEqual(run.written[0].livingService.times, { createdAt: "<DATE>" })

  assert.equal(run.logged.length, 1)
  assert.equal(run.logged[0].action, "update_passenger_request_hotel")
  assert.equal(run.notified.length, 1)
  assert.equal(
    run.notified[0].description.action,
    "update_hotel_chess_passenger_request"
  )
  assert.deepEqual(run.published, ["PASSENGER_REQUEST_UPDATED", "NOTIFICATION"])
})

test("updatePassengerRequestHotel: вместимость ниже числа заселённых отбивается", async () => {
  const run = await runRaw("updatePassengerRequestHotel", {
    requestId: "req-1",
    hotelIndex: 0,
    hotel: { peopleCount: 0 }
  })

  assert.match(
    run.error.message,
    /Нельзя задать меньше количества уже размещённых гостей \(1\)/
  )
  assert.equal(run.double.callsTo("passengerRequest", "update").length, 0)
  assert.equal(run.published.length, 0)
})

test("updatePassengerRequestHotel НЕ прогоняет ensureHotelPerson", async () => {
  const run = await runRaw(
    "updatePassengerRequestHotel",
    { requestId: "req-1", hotelIndex: 0, hotel: { name: "Азия Плюс" } },
    { request: requestWithLegacyInSecondHotel() }
  )

  assert.deepEqual(run.result.livingService.hotels[1].people[0], {
    fullName: "Легаси Гость"
  })
})

// ───────────────────── addPassengerRequestHotelPerson ─────────────────────

test("addPassengerRequestHotelPerson: гость записан, ростер дополнен, лог и публикация", async () => {
  const run = await runMutation("addPassengerRequestHotelPerson", {
    requestId: "req-1",
    hotelIndex: 1,
    person: newGuest()
  })

  assert.equal(run.written.length, 1)
  assert.deepEqual(Object.keys(run.written[0]), [
    "livingService",
    "savedPassengers"
  ])

  const hotel = run.written[0].livingService.hotels[1]
  assert.equal(hotel.people.length, 1)
  assert.deepEqual(hotel.people[0], {
    accommodationChesses: [
      {
        endAt: null,
        hotelIndex: 1,
        hotelName: "Чаплан",
        reason: null,
        startAt: "<DATE>"
      }
    ],
    airlinePersonalId: null,
    arrival: null,
    departure: null,
    fullName: "Новый Гость",
    personCategory: "ADULT",
    personId: "<UUID>",
    personType: "PASSENGER",
    roomCategory: null,
    roomKind: null
  })
  // Людей в услуге стало 2 при плане 4 — автозавершения нет.
  assert.equal(run.written[0].livingService.status, "IN_PROGRESS")
  assert.equal(run.written[0].savedPassengers.length, 3)

  assert.equal(run.logged.length, 1)
  assert.equal(run.logged[0].action, "add_passenger_request_hotel_person")
  assert.equal(run.notified.length, 0, "без перебора сайтового уведомления нет")
  assert.deepEqual(run.published, ["PASSENGER_REQUEST_UPDATED"])
})

test("addPassengerRequestHotelPerson: заселение до плана автозавершает услугу", async () => {
  const request = makeRequest()
  request.livingService.plan = { enabled: true, peopleCount: 2 }

  const run = await runMutation(
    "addPassengerRequestHotelPerson",
    { requestId: "req-1", hotelIndex: 1, person: newGuest() },
    { request }
  )

  assert.equal(run.written[0].livingService.status, "COMPLETED")
  assert.equal(run.written[0].livingService.times.finishedAt, "<DATE>")
})

test("СКРЫТАЯ МИГРАЦИЯ: ensureHotelPerson проходит по людям ВСЕХ гостиниц, а не только затронутой", async () => {
  // Заселяем в первую гостиницу, а нормализованным оказывается и легаси-гость
  // второй: mapping идёт по всему массиву hotels. Побочная запись данных, о
  // которой мутация нигде не сообщает.
  const run = await runRaw(
    "addPassengerRequestHotelPerson",
    { requestId: "req-1", hotelIndex: 0, person: newGuest() },
    { request: requestWithLegacyInSecondHotel() }
  )

  const migrated = run.result.livingService.hotels[1].people[0]
  assert.equal(migrated.personType, "PASSENGER")
  assert.equal(migrated.personCategory, "ADULT")
  assert.equal(migrated.arrival, null)
  assert.equal(migrated.departure, null)
  assert.equal(migrated.roomCategory, null)
  assert.equal(migrated.roomKind, null)
  assert.equal(migrated.airlinePersonalId, null)
  assert.equal(migrated.accommodationChesses.length, 1)
  assert.equal(migrated.accommodationChesses[0].hotelIndex, 1)
  assert.equal(migrated.accommodationChesses[0].hotelName, "Чаплан")
})

test("ensureHotelPerson НЕ проставляет personId: легаси-гость его так и не получает", async () => {
  // Важно для будущего перехода на адресацию по id: пройдя через нормализатор
  // сколько угодно раз, гость остаётся без идентификатора, и в ростере его нет.
  const run = await runRaw(
    "addPassengerRequestHotelPerson",
    { requestId: "req-1", hotelIndex: 0, person: newGuest() },
    { request: requestWithLegacyInSecondHotel() }
  )

  const migrated = run.result.livingService.hotels[1].people[0]
  assert.equal("personId" in migrated, false)
  // Новому гостю id выдаётся, но отдельным хелпером ensurePersonId, не этим.
  assert.equal(typeof run.result.livingService.hotels[0].people[1].personId, "string")
})

test("peopleCount: 0 у гостиницы — «вместимость не задана»: заселение проходит без предупреждения", async () => {
  const run = await runMutation(
    "addPassengerRequestHotelPerson",
    { requestId: "req-1", hotelIndex: 0, person: newGuest() },
    { request: requestWithPlaced({ capacity: 0, placed: 3 }) }
  )

  assert.equal(run.written[0].livingService.hotels[0].people.length, 4)
  assert.equal(run.notified.length, 0)
  assert.deepEqual(run.published, ["PASSENGER_REQUEST_UPDATED"])
})

test("перебор: уведомление шлётся ТОЛЬКО на переходе через порог", async () => {
  // Порог — «заселённых стало больше вместимости». При вместимости 2 переход
  // случается на ТРЕТЬЕМ госте (2 → 3), а не на втором.
  const atCapacity = await runMutation(
    "addPassengerRequestHotelPerson",
    { requestId: "req-1", hotelIndex: 0, person: newGuest() },
    { request: requestWithPlaced({ capacity: 2, placed: 2 }) }
  )
  assert.equal(atCapacity.notified.length, 1)
  assert.equal(
    atCapacity.notified[0].description.action,
    "passenger_request_hotel_overbooked"
  )
  assert.deepEqual(atCapacity.published, [
    "PASSENGER_REQUEST_UPDATED",
    "NOTIFICATION"
  ])

  // Следующий гость сверх заявки уведомления уже не плодит.
  const beyond = await runMutation(
    "addPassengerRequestHotelPerson",
    { requestId: "req-1", hotelIndex: 0, person: newGuest() },
    { request: requestWithPlaced({ capacity: 2, placed: 3 }) }
  )
  assert.equal(beyond.notified.length, 0)
  assert.deepEqual(beyond.published, ["PASSENGER_REQUEST_UPDATED"])
})

test("перебор: заполнение последнего свободного места уведомления НЕ даёт", async () => {
  // При вместимости 2 и одном заселённом добавление одного доводит до 2 —
  // это ровно вместимость, а не превышение.
  const run = await runMutation(
    "addPassengerRequestHotelPerson",
    { requestId: "req-1", hotelIndex: 0, person: newGuest() },
    { request: requestWithPlaced({ capacity: 2, placed: 1 }) }
  )

  assert.equal(run.notified.length, 0)
  assert.deepEqual(run.published, ["PASSENGER_REQUEST_UPDATED"])
})

test("гейт по scope: внешняя гостиница может заселять только в свою", async () => {
  const foreign = await runRaw(
    "addPassengerRequestHotelPerson",
    { requestId: "req-1", hotelIndex: 0, person: newGuest() },
    { context: makeHotelContext("hotel-2") }
  )
  assert.equal(foreign.error.extensions.code, "FORBIDDEN")
  assert.match(
    foreign.error.message,
    /you can only add bookings to your hotel/
  )
  assert.equal(foreign.double.callsTo("passengerRequest", "update").length, 0)
  assert.equal(foreign.published.length, 0)

  const own = await runMutation(
    "addPassengerRequestHotelPerson",
    { requestId: "req-1", hotelIndex: 0, person: newGuest() },
    { context: makeHotelContext("hotel-1") }
  )
  assert.equal(own.written[0].livingService.hotels[0].people.length, 2)
  // ДЕФЕКТ №22: автора у записи истории нет — logAction берёт только
  // context.user.id, которого у EXTERNAL_USER не бывает.
  assert.equal(own.logged[0].userId, null)
})

test("addPassengerRequestHotelPerson: гость без ФИО роняет мутацию до записи", async () => {
  // Падает не валидация мутации, а сборка снимка для ростера
  // (normalizeSavedPerson) — уже внутри аргумента prisma.update.
  const run = await runRaw("addPassengerRequestHotelPerson", {
    requestId: "req-1",
    hotelIndex: 0,
    person: { fullName: "   " }
  })

  assert.match(run.error.message, /fullName is required/)
  assert.equal(run.double.callsTo("passengerRequest", "update").length, 0)
  assert.equal(run.published.length, 0)
})

// ───────────────────── addPassengerRequestHotelPeople ─────────────────────

test("addPassengerRequestHotelPeople: пачка дописывается целиком, ростер дополнен, лог", async () => {
  const run = await runMutation("addPassengerRequestHotelPeople", {
    requestId: "req-1",
    hotelIndex: 1,
    people: [newGuest("Первый Гость"), newGuest("Второй Гость")]
  })

  assert.deepEqual(Object.keys(run.written[0]), [
    "livingService",
    "savedPassengers"
  ])
  const people = run.written[0].livingService.hotels[1].people
  assert.equal(people.length, 2)
  assert.deepEqual(
    people.map((p) => p.fullName),
    ["Первый Гость", "Второй Гость"]
  )
  assert.equal(people[0].accommodationChesses[0].hotelIndex, 1)
  assert.equal(run.written[0].savedPassengers.length, 4)
  // Три человека при плане 4 — статус не меняется.
  assert.equal(run.written[0].livingService.status, "IN_PROGRESS")

  assert.equal(run.logged.length, 1)
  assert.equal(run.logged[0].action, "add_passenger_request_hotel_people")
  assert.equal(
    run.logged[0].description,
    "Пакетно добавлены пассажиры в гостиницу ФАП (2)"
  )
  assert.equal(run.notified.length, 0)
  assert.deepEqual(run.published, ["PASSENGER_REQUEST_UPDATED"])
})

test("addPassengerRequestHotelPeople: пустая пачка отбивается ДО чтения заявки", async () => {
  const run = await runRaw("addPassengerRequestHotelPeople", {
    requestId: "req-1",
    hotelIndex: 0,
    people: []
  })

  assert.match(run.error.message, /people must be a non-empty array/)
  assert.equal(run.double.calls.length, 0, "заявка даже не читалась")
  assert.equal(run.published.length, 0)
})

test("addPassengerRequestHotelPeople: перебор пачкой даёт одно уведомление", async () => {
  const run = await runMutation(
    "addPassengerRequestHotelPeople",
    {
      requestId: "req-1",
      hotelIndex: 0,
      people: [newGuest("A"), newGuest("B"), newGuest("C")]
    },
    { request: requestWithPlaced({ capacity: 2, placed: 0 }) }
  )

  assert.equal(run.notified.length, 1)
  assert.equal(
    run.notified[0].description.action,
    "passenger_request_hotel_overbooked"
  )
  assert.deepEqual(run.published, ["PASSENGER_REQUEST_UPDATED", "NOTIFICATION"])
})

test("addPassengerRequestHotelPeople: тот же гейт по scope", async () => {
  const foreign = await runRaw(
    "addPassengerRequestHotelPeople",
    { requestId: "req-1", hotelIndex: 0, people: [newGuest()] },
    { context: makeHotelContext("hotel-2") }
  )
  assert.equal(foreign.error.extensions.code, "FORBIDDEN")

  const own = await runMutation(
    "addPassengerRequestHotelPeople",
    { requestId: "req-1", hotelIndex: 0, people: [newGuest()] },
    { context: makeHotelContext("hotel-1") }
  )
  assert.equal(own.written[0].livingService.hotels[0].people.length, 2)
})

// ──────────────────── updatePassengerRequestHotelPerson ────────────────────

test("updatePassengerRequestHotelPerson: прежний гость — база, инпут поверх", async () => {
  const request = makeRequest()
  const person = request.livingService.hotels[0].people[0]
  person.arrival = "2026-08-04T14:00:00.000Z"
  person.departure = "2026-08-06T12:00:00.000Z"
  person.roomCategory = "Стандарт"
  person.roomKind = "Одноместный"
  person.airlinePersonalId = "AP-9"

  const run = await runRaw(
    "updatePassengerRequestHotelPerson",
    {
      requestId: "req-1",
      hotelIndex: 0,
      personIndex: 0,
      person: { fullName: "Иванов Иван Иванович", phone: "+79000000000" }
    },
    { request }
  )

  const updated = run.result.livingService.hotels[0].people[0]
  assert.equal(updated.fullName, "Иванов Иван Иванович")
  assert.equal(updated.phone, "+79000000000")
  // Ничего из того, чего нет в инпуте, не потерялось.
  assert.equal(updated.arrival, "2026-08-04T14:00:00.000Z")
  assert.equal(updated.departure, "2026-08-06T12:00:00.000Z")
  assert.equal(updated.roomCategory, "Стандарт")
  assert.equal(updated.roomKind, "Одноместный")
  assert.equal(updated.roomNumber, "101")
  assert.equal(updated.personId, "aaaaaaaa-0000-4000-8000-000000000001")
  // Размещение берётся у ПРЕЖНЕГО гостя, инпутом его не переписать.
  assert.equal(updated.accommodationChesses.length, 1)
  assert.equal(updated.accommodationChesses[0].hotelName, "Азия")
})

test("updatePassengerRequestHotelPerson: явный null НЕ обнуляет airlinePersonalId", async () => {
  const request = makeRequest()
  request.livingService.hotels[0].people[0].airlinePersonalId = "AP-9"

  const run = await runRaw(
    "updatePassengerRequestHotelPerson",
    {
      requestId: "req-1",
      hotelIndex: 0,
      personIndex: 0,
      person: { fullName: "Иванов Иван", airlinePersonalId: null }
    },
    { request }
  )

  assert.equal(
    run.result.livingService.hotels[0].people[0].airlinePersonalId,
    "AP-9",
    "нормализованный null проваливается на прежнее значение"
  )
})

test("updatePassengerRequestHotelPerson: входное размещение игнорируется", async () => {
  const run = await runRaw("updatePassengerRequestHotelPerson", {
    requestId: "req-1",
    hotelIndex: 0,
    personIndex: 0,
    person: {
      fullName: "Иванов Иван",
      accommodationChesses: [
        { hotelIndex: 1, hotelName: "Чаплан", startAt: null, endAt: null, reason: null }
      ]
    }
  })

  const chesses = run.result.livingService.hotels[0].people[0].accommodationChesses
  assert.equal(chesses.length, 1)
  assert.equal(chesses[0].hotelIndex, 0)
  assert.equal(chesses[0].hotelName, "Азия")
})

test("updatePassengerRequestHotelPerson: ростер, лог, публикация, без уведомления", async () => {
  const run = await runMutation("updatePassengerRequestHotelPerson", {
    requestId: "req-1",
    hotelIndex: 0,
    personIndex: 0,
    person: { fullName: "Иванов Иван Иванович" }
  })

  assert.deepEqual(Object.keys(run.written[0]), [
    "livingService",
    "savedPassengers"
  ])
  assert.equal(run.written[0].savedPassengers.length, 2, "новых записей не появилось")
  assert.equal(run.written[0].savedPassengers[0].fullName, "Иванов Иван Иванович")
  // Статус услуги эта мутация не пересчитывает вовсе.
  assert.equal(run.written[0].livingService.status, "IN_PROGRESS")

  assert.equal(run.logged.length, 1)
  assert.equal(run.logged[0].action, "update_passenger_request_hotel_person")
  assert.equal(run.notified.length, 0)
  assert.deepEqual(run.published, ["PASSENGER_REQUEST_UPDATED"])
})

// ───────────────────── assignPassengerRequestHotelRoom ─────────────────────

test("assignPassengerRequestHotelRoom меняет только номер комнаты", async () => {
  const request = makeRequest()
  request.livingService.hotels[0].people[0].roomCategory = "Стандарт"

  const run = await runRaw(
    "assignPassengerRequestHotelRoom",
    {
      requestId: "req-1",
      hotelIndex: 0,
      personIndexes: [0],
      roomNumber: "  205  "
    },
    { request }
  )

  const person = run.result.livingService.hotels[0].people[0]
  assert.equal(person.roomNumber, "205", "строка обрезается")
  assert.equal(person.roomCategory, "Стандарт")
  assert.equal(person.fullName, "Иванов Иван")
  assert.equal(person.accommodationChesses.length, 1)
})

test("assignPassengerRequestHotelRoom: индексы дедуплицируются, лог и публикация", async () => {
  const run = await runMutation("assignPassengerRequestHotelRoom", {
    requestId: "req-1",
    hotelIndex: 0,
    personIndexes: [0, 0],
    roomNumber: "205"
  })

  assert.deepEqual(Object.keys(run.written[0]), ["livingService"])
  assert.equal(run.logged.length, 1)
  assert.equal(run.logged[0].action, "assign_passenger_request_hotel_room")
  assert.equal(
    run.logged[0].fulldescription,
    "Пользователь Диспетчер Тестовый присвоил номер «205» гостям (1) в гостинице Азия ФАП TEST001"
  )
  assert.equal(run.notified.length, 0)
  assert.deepEqual(run.published, ["PASSENGER_REQUEST_UPDATED"])
})

test("assignPassengerRequestHotelRoom: пустой номер очищает поле", async () => {
  const run = await runRaw("assignPassengerRequestHotelRoom", {
    requestId: "req-1",
    hotelIndex: 0,
    personIndexes: [0],
    roomNumber: "   "
  })

  assert.equal(run.result.livingService.hotels[0].people[0].roomNumber, null)
})

test("assignPassengerRequestHotelRoom: пустой набор гостей отбивается до записи", async () => {
  const run = await runRaw("assignPassengerRequestHotelRoom", {
    requestId: "req-1",
    hotelIndex: 0,
    personIndexes: [],
    roomNumber: "205"
  })

  assert.match(run.error.message, /Не выбран ни один гость/)
  assert.equal(run.double.callsTo("passengerRequest", "update").length, 0)
  assert.equal(run.published.length, 0)
})

// ──────────────────── removePassengerRequestHotelPerson ────────────────────

test("removePassengerRequestHotelPerson: гость вырезается, ростер не трогается", async () => {
  const run = await runMutation("removePassengerRequestHotelPerson", {
    requestId: "req-1",
    hotelIndex: 0,
    personIndex: 0
  })

  assert.deepEqual(Object.keys(run.written[0]), ["livingService"])
  assert.deepEqual(run.written[0].livingService.hotels[0].people, [])
  // Людей стало 0 при плане 4, статус остаётся IN_PROGRESS.
  assert.equal(run.written[0].livingService.status, "IN_PROGRESS")

  assert.equal(run.logged.length, 1)
  assert.equal(run.logged[0].action, "remove_passenger_request_hotel_person")
  assert.equal(run.notified.length, 0)
  assert.deepEqual(run.published, ["PASSENGER_REQUEST_UPDATED"])
})

test("removePassengerRequestHotelPerson: падение факта ниже плана переоткрывает завершённую услугу", async () => {
  const request = makeRequest()
  request.livingService.plan = { enabled: true, peopleCount: 1 }
  request.livingService.status = "COMPLETED"
  request.livingService.times = {
    createdAt: "2026-08-01T10:00:00.000Z",
    finishedAt: "2026-08-04T12:00:00.000Z"
  }

  const run = await runMutation(
    "removePassengerRequestHotelPerson",
    { requestId: "req-1", hotelIndex: 0, personIndex: 0 },
    { request }
  )

  const living = run.written[0].livingService
  assert.equal(living.status, "IN_PROGRESS")
  assert.equal(living.times.finishedAt, null)
  assert.equal(living.times.inProgressAt, "<DATE>")
})

test("removePassengerRequestHotelPerson: индекс гостя вне диапазона отбивается до записи", async () => {
  const run = await runRaw("removePassengerRequestHotelPerson", {
    requestId: "req-1",
    hotelIndex: 0,
    personIndex: 3
  })

  assert.match(run.error.message, /Invalid personIndex/)
  assert.equal(run.double.callsTo("passengerRequest", "update").length, 0)
  assert.equal(run.published.length, 0)
})

// ─────────────────────────── гейт по scope: разрыв ───────────────────────────

test("гейт по scope ОТСУТСТВУЕТ у пяти мутаций: внешняя гостиница проходит насквозь", async () => {
  // Проверка «только своя гостиница» стоит ровно у двух add-мутаций. Остальные
  // пять её не имеют: makeHotelContext("hotel-2") правит и удаляет содержимое
  // гостиницы hotel-1. Это будущая работа по авторизации, а не дефект к
  // починке сейчас, — закрепляем как есть.
  const context = makeHotelContext("hotel-2")

  const cases = [
    [
      "updatePassengerRequestHotel",
      { requestId: "req-1", hotelIndex: 0, hotel: { name: "Азия Плюс" } }
    ],
    [
      "updatePassengerRequestHotelPerson",
      {
        requestId: "req-1",
        hotelIndex: 0,
        personIndex: 0,
        person: { fullName: "Иванов Иван Иванович" }
      }
    ],
    [
      "assignPassengerRequestHotelRoom",
      { requestId: "req-1", hotelIndex: 0, personIndexes: [0], roomNumber: "205" }
    ],
    [
      "removePassengerRequestHotelPerson",
      { requestId: "req-1", hotelIndex: 0, personIndex: 0 }
    ],
    ["removePassengerRequestHotel", { requestId: "req-1", hotelIndex: 0 }]
  ]

  for (const [name, args] of cases) {
    const run = await runMutation(name, args, { context })
    assert.equal(run.written.length, 1, `${name}: запись состоялась`)
    assert.deepEqual(
      run.published.slice(0, 1),
      ["PASSENGER_REQUEST_UPDATED"],
      `${name}: подписчики уведомлены`
    )
    // ДЕФЕКТ №22: автор записи истории пустой для любого EXTERNAL_USER.
    assert.equal(run.logged[0].userId, null, `${name}: автор лога пустой`)
  }
})

// ───────────────────────── маршрутизация писем ─────────────────────────

test("маршрутизация писем: два из восьми действий группы уходят как обычное обновление", async () => {
  // Письма через двойник не видны (почтовая ветка в try/catch), поэтому
  // маршрутизацию закрепляем на чистой функции. Пакетное заселение раньше в
  // набор «шахматки гостиниц» не входило и уходило общей веткой: не тот шаблон
  // и, что существеннее, не тот флаг меню при фильтрации получателей — отдел,
  // отключивший обновления, но оставивший изменение размещения, писем о нём не
  // получал вовсе. Теперь входит наравне с одиночным. Правка гостиницы и
  // присвоение номера комнаты в набор по-прежнему не входят, хотя по смыслу
  // это то же заселение, — закрепляем как есть.
  const chess = [
    "add_passenger_request_hotel",
    "remove_passenger_request_hotel",
    "add_passenger_request_hotel_person",
    "add_passenger_request_hotel_people",
    "update_passenger_request_hotel_person",
    "remove_passenger_request_hotel_person"
  ]
  for (const action of chess) {
    assert.equal(
      resolveEmailActionForLog(action),
      "update_hotel_chess_passenger_request",
      action
    )
  }

  const generic = [
    "update_passenger_request_hotel",
    "assign_passenger_request_hotel_room"
  ]
  for (const action of generic) {
    assert.equal(
      resolveEmailActionForLog(action),
      "update_passenger_request",
      action
    )
  }
})

// ───────────────────────────── аутентификация ─────────────────────────────

test("аутентификация: без субъекта ни одна мутация группы не выполняется", async () => {
  const cases = [
    ["addPassengerRequestHotel", { requestId: "req-1", hotel: { name: "Сибирь" } }],
    ["removePassengerRequestHotel", { requestId: "req-1", hotelIndex: 0 }],
    [
      "updatePassengerRequestHotel",
      { requestId: "req-1", hotelIndex: 0, hotel: { name: "Азия" } }
    ],
    [
      "addPassengerRequestHotelPerson",
      { requestId: "req-1", hotelIndex: 0, person: newGuest() }
    ],
    [
      "addPassengerRequestHotelPeople",
      { requestId: "req-1", hotelIndex: 0, people: [newGuest()] }
    ],
    [
      "updatePassengerRequestHotelPerson",
      { requestId: "req-1", hotelIndex: 0, personIndex: 0, person: {} }
    ],
    [
      "assignPassengerRequestHotelRoom",
      { requestId: "req-1", hotelIndex: 0, personIndexes: [0], roomNumber: "1" }
    ],
    [
      "removePassengerRequestHotelPerson",
      { requestId: "req-1", hotelIndex: 0, personIndex: 0 }
    ]
  ]

  for (const [name, args] of cases) {
    await assert.rejects(
      () => runMutation(name, args, { context: {} }),
      /Unauthorized/,
      name
    )
  }
})

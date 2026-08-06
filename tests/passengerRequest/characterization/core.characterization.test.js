// Характеризационные тесты группы «Каркас заявки»: создание, обновление,
// файлы, удаление, статусы, ростер экипажа, отмена, статус услуги и
// распознавание документа.
//
// Фиксируют поведение КАК ЕСТЬ, включая дефекты. Тест, закрепляющий дефект,
// помечен номером из реестра спеки — при починке дефекта обязан измениться
// именно он.

import test from "node:test"
import assert from "node:assert/strict"
import resolvers from "../../../resolvers/passengerRequest/passengerRequest.resolver.js"
import { installPrismaDouble } from "../../helpers/prismaDouble.js"
import { installPubsubSpy, releasePubsubAfterTests } from "../../helpers/fapHarness.js"
import { runFapMutation } from "../../helpers/runFapMutation.js"
import { recognitionRateLimiter } from "../../../services/docRecognition/recognitionRateLimit.js"
import {
  makeRequest,
  makeContext,
  makeHotelContext
} from "../fixtures/passengerRequest.js"

// Обязательно в каждом файле, импортирующем резолвер: иначе при заданном
// REDIS_URL клиенты Redis удержат процесс и раннер не завершится.
releasePubsubAfterTests()

// Общий хелпер отдаёт срез, которого хватает почти всем тестам. Части тестов
// этой группы нужен более сырой доступ: аргументы create/delete, полезная
// нагрузка публикации и следы УПАВШЕЙ мутации. Форму runFapMutation ради них
// не расширяем — она общая на все группы, поэтому стенд ставим здесь.
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

// ─────────────────────────── createPassengerRequest ───────────────────────────

test("createPassengerRequest: один create, один апдейт ссылок, лог, уведомление, публикация", async () => {
  const run = await runFapMutation("createPassengerRequest", {
    input: {
      airlineId: "airline-1",
      airportId: "airport-1",
      flightNumber: "TEST001"
    }
  })

  // Документ пишется в два приёма: create, затем апдейт представительских ссылок.
  assert.deepEqual(run.order.slice(0, 3), [
    "passengerRequest.findFirst",
    "airport.findUnique",
    "passengerRequest.create"
  ])
  assert.equal(run.written.length, 1)
  assert.deepEqual(Object.keys(run.written[0]), ["representativeLinks"])
  assert.equal(run.written[0].representativeLinks.length, 1)

  assert.equal(run.logged.length, 1)
  assert.equal(run.logged[0].action, "create_passenger_request")
  assert.equal(run.notified.length, 1)
  assert.equal(
    run.notified[0].description.action,
    "create_passenger_request"
  )
  assert.deepEqual(run.published, ["PASSENGER_REQUEST_CREATED", "NOTIFICATION"])

  // Номер: {seq+1}{код аэропорта или XXX}{MM}{YY}f. Аэропорта в стенде нет,
  // поэтому код — заглушка; порядковый берётся из последней заявки (0001).
  assert.match(run.result.requestNumber, /^0002XXX\d{4}f$/)
})

test("createPassengerRequest публикует СЫРУЮ заявку, а подписка обновления — гидрированную", async () => {
  // Ростер savedPassengers — источник истины идентичности, гидрация накладывает
  // его на сервис-персон. В PASSENGER_REQUEST_CREATED уходит документ до
  // гидрации, поэтому подписчик видит устаревшее имя.
  const request = makeRequest()
  request.waterService.people[0].fullName = "Старое Имя"

  const created = await runRaw(
    "createPassengerRequest",
    {
      input: {
        airlineId: "airline-1",
        airportId: "airport-1",
        flightNumber: "TEST001"
      }
    },
    { request }
  )
  assert.equal(created.published[0].topic, "PASSENGER_REQUEST_CREATED")
  assert.equal(
    created.published[0].payload.passengerRequestCreated.waterService.people[0]
      .fullName,
    "Старое Имя"
  )

  const updated = await runRaw(
    "setPassengerRequestStatus",
    { id: "req-1", status: "ACCEPTED" },
    { request: makeRequest({ waterService: request.waterService }) }
  )
  assert.equal(updated.published[0].topic, "PASSENGER_REQUEST_UPDATED")
  assert.equal(
    updated.published[0].payload.passengerRequestUpdated.waterService.people[0]
      .fullName,
    "Иванов Иван"
  )
})

test("createPassengerRequest штампует statusTimes вместе со статусом", async () => {
  // Дефект №5 реестра починен: из пяти путей к статусу заявки штамповали
  // только три, а createPassengerRequest и updatePassengerRequest писали
  // status и оставляли отметки пустыми.
  const run = await runRaw("createPassengerRequest", {
    input: {
      airlineId: "airline-1",
      airportId: "airport-1",
      flightNumber: "TEST001",
      status: "ACCEPTED"
    }
  })

  const created = run.double.callsTo("passengerRequest", "create")
  assert.equal(created.length, 1)
  assert.equal(created[0].args.data.status, "ACCEPTED")
  assert.ok(created[0].args.data.statusTimes.acceptedAt instanceof Date)
})

test("createPassengerRequest без статуса и в CREATED пустой composite не пишет", async () => {
  // Обратная проверка к №5. У CREATED отметки нет по построению — в
  // updateTimes для него ветки нет, и класть в документ пустой composite
  // незачем. Заявка без статуса во входе ведёт себя как раньше.
  const created = await runRaw("createPassengerRequest", {
    input: {
      airlineId: "airline-1",
      airportId: "airport-1",
      flightNumber: "TEST001",
      status: "CREATED"
    }
  })
  const withCreated = created.double.callsTo("passengerRequest", "create")[0]
  assert.equal(withCreated.args.data.status, "CREATED")
  assert.equal("statusTimes" in withCreated.args.data, false)

  const none = await runRaw("createPassengerRequest", {
    input: {
      airlineId: "airline-1",
      airportId: "airport-1",
      flightNumber: "TEST001"
    }
  })
  const withoutStatus = none.double.callsTo("passengerRequest", "create")[0]
  assert.equal("status" in withoutStatus.args.data, false)
  assert.equal("statusTimes" in withoutStatus.args.data, false)
})

// ─────────────────────────── updatePassengerRequest ───────────────────────────

test("updatePassengerRequest: семь блоков услуг дают одну и ту же форму { ...prev, plan, status, times }", async () => {
  // Это ровно тот код, который в рефакторе схлопнут в таблицу, — отпечаток
  // подробный. План (6 человек) выше факта во всех семи услугах, поэтому
  // автозавершения нет и статус ведёт только число людей.
  const plan = { enabled: true, peopleCount: 6 }
  const run = await runFapMutation("updatePassengerRequest", {
    id: "req-1",
    input: {
      waterService: { plan },
      mealService: { plan },
      livingService: { plan },
      transferService: { plan },
      departureTransferService: { plan },
      intercityTransferService: { plan },
      baggageDeliveryService: { plan }
    }
  })

  assert.equal(run.written.length, 1, "все семь блоков уходят одним апдейтом")
  const data = run.written[0]

  const expected = [
    // поле, статус, отметки времени, ключ факта, есть ли drivers
    ["waterService", "IN_PROGRESS", { acceptedAt: "<DATE>" }, "people", false],
    ["mealService", "NEW", {}, "people", false],
    ["livingService", "IN_PROGRESS", { acceptedAt: "<DATE>" }, "hotels", false],
    ["transferService", "NEW", {}, "drivers", true],
    ["departureTransferService", "NEW", {}, "drivers", true],
    ["intercityTransferService", "NEW", {}, "drivers", true],
    ["baggageDeliveryService", "NEW", {}, "drivers", true]
  ]

  for (const [field, status, times, factKey, hasDrivers] of expected) {
    const service = data[field]
    assert.ok(service, `${field} записан`)
    assert.deepEqual(service.plan, plan, `${field}: план перезаписан`)
    assert.equal(service.status, status, `${field}: статус`)
    assert.deepEqual(service.times, times, `${field}: времена`)
    assert.ok(factKey in service, `${field}: поле факта сохранено из prev`)
    assert.equal(
      Array.isArray(service.drivers),
      hasDrivers,
      `${field}: drivers есть только у водительских услуг`
    )
  }

  // Вода, питание и проживание своих людей через нормализатор НЕ прогоняют —
  // просто уносят prev как есть.
  assert.equal(data.waterService.drivers, undefined)
  assert.equal(data.mealService.drivers, undefined)
  assert.equal(data.livingService.drivers, undefined)
  assert.deepEqual(data.livingService.evictions, [])

  assert.equal(run.logged.length, 1)
  assert.equal(run.logged[0].action, "update_passenger_request")
  assert.equal(run.notified.length, 1)
  assert.deepEqual(run.published, ["NOTIFICATION", "PASSENGER_REQUEST_UPDATED"])
})

test("updatePassengerRequest: только водительские блоки чинят пассажиров через normalizeDriversForWrite", async () => {
  const request = makeRequest()
  const brokenPerson = {
    personId: "aaaaaaaa-0000-4000-8000-000000000001",
    fullName: "Иванов Иван",
    baggageTags: null,
    reportCost: -5,
    addressTo: "  ул. Мира  "
  }
  request.transferService.drivers = [
    { fullName: "Водитель", people: [structuredClone(brokenPerson)] }
  ]
  // Тот же «сломанный» набор полей у воды — чтобы разница была видна.
  request.waterService.people = [structuredClone(brokenPerson)]

  const run = await runFapMutation(
    "updatePassengerRequest",
    {
      id: "req-1",
      input: {
        transferService: { plan: { enabled: true, peopleCount: 6 } },
        waterService: { plan: { enabled: true, peopleCount: 6 } }
      }
    },
    { request }
  )

  const driverPerson = run.written[0].transferService.drivers[0].people[0]
  assert.deepEqual(driverPerson.baggageTags, [], "null → пустой список")
  assert.equal(driverPerson.reportCost, null, "отрицательная цена → null")
  assert.equal(driverPerson.addressTo, "ул. Мира", "адрес обрезан")

  const waterPerson = run.written[0].waterService.people[0]
  assert.equal(waterPerson.baggageTags, null, "у воды пассажир уходит как есть")
  assert.equal(waterPerson.reportCost, -5)
  assert.equal(waterPerson.addressTo, "  ул. Мира  ")

  // Появившийся факт поездки поднимает статус услуги трансфера.
  assert.equal(run.written[0].transferService.status, "IN_PROGRESS")
  assert.equal(run.written[0].transferService.times.inProgressAt, "<DATE>")
})

test("ловушка именования: движок статусов видит только plan.peopleCount, ключ count игнорирует", async () => {
  // Это не дефект продукта, а ловушка для тестов: recomputeServiceStatus
  // читает plan.peopleCount, и план с любым другим ключом для него всё равно
  // что отсутствует. Вход обеих половин собран здесь явно, а план документа
  // берётся из фикстуры — чтобы патч отличался от документа и запись случилась.
  const byPeopleCount = await runFapMutation("updatePassengerRequest", {
    id: "req-1",
    input: { waterService: { plan: { enabled: true, peopleCount: 1 } } }
  })
  // Факт (1 человек) достиг плана — услуга автозавершилась.
  assert.equal(byPeopleCount.written[0].waterService.status, "COMPLETED")
  assert.equal(byPeopleCount.written[0].waterService.times.finishedAt, "<DATE>")

  // Тот же план по смыслу, но ключом count. План в документе оставлен
  // фикстурный (peopleCount: 4) намеренно: патч обязан отличаться от документа,
  // иначе мутация справедливо сочтёт его пустым и не запишет ничего.
  // ⚠️ План теперь СЛИВАЕТСЯ с документом, а не заменяет его: присланный
  // мусорный ключ `count` в документ попадает, но настоящий `peopleCount: 4`
  // из фикстуры уцелевает. Раньше вход заменял план целиком и peopleCount
  // терялся — из-за этого выключение услуги (`{ enabled: false }`) обнуляло
  // количество и плановые даты безвозвратно.
  // Различающая сила теста от этого только выросла: движок идёт за
  // peopleCount (4), а не за count (1). Читай он count, факт 1 достиг бы плана
  // 1 и услуга завершилась бы — она осталась IN_PROGRESS.
  const byCount = await runFapMutation("updatePassengerRequest", {
    id: "req-1",
    input: { waterService: { plan: { enabled: true, count: 1 } } }
  })
  assert.deepEqual(byCount.written[0].waterService.plan, {
    enabled: true,
    peopleCount: 4,
    count: 1
  })
  assert.equal(byCount.written[0].waterService.status, "IN_PROGRESS")
  assert.equal(byCount.written[0].waterService.times.finishedAt, undefined)
})

test("выключение услуги сохраняет количество и плановые даты", async () => {
  // Обратная проверка к слиянию плана: клиент шлёт `{ enabled: false }` и
  // ничего больше, и всё остальное обязано уцелеть. Прежняя семантика замены
  // оставляла в документе ровно `{ enabled: false }`.
  const run = await runFapMutation("updatePassengerRequest", {
    id: "req-1",
    input: { waterService: { plan: { enabled: false } } }
  })

  assert.deepEqual(run.written[0].waterService.plan, {
    enabled: false,
    peopleCount: 4
  })
})

test("updatePassengerRequest штампует statusTimes при смене статуса", async () => {
  // Дефект №5 реестра починен: статус правится здесь как обычное поле шапки,
  // и раньше отметки времени не пересчитывались вовсе — один и тот же переход
  // давал разный документ в зависимости от выбранной мутации.
  const run = await runFapMutation("updatePassengerRequest", {
    id: "req-1",
    input: { status: "COMPLETED" }
  })

  assert.equal(run.written[0].status, "COMPLETED")
  assert.equal(run.written[0].statusTimes.finishedAt, "<DATE>")
})

test("updatePassengerRequest: тот же статус отметок не трогает", async () => {
  // Обратная проверка к №5, и одновременно страж защиты от пустого сохранения:
  // statusTimes в патче не приходит никогда, поэтому штамп обязан стоять ПОСЛЕ
  // patchIsNoop и только при РЕАЛЬНОЙ смене. Иначе повтор текущего статуса
  // выглядел бы изменением и воскресил бы письмо на каждое «Сохранить».
  const request = makeRequest({ status: "ACCEPTED" })
  const run = await runFapMutation(
    "updatePassengerRequest",
    { id: "req-1", input: { status: "ACCEPTED", flightNumber: "TEST002" } },
    { request }
  )

  assert.equal(run.written[0].flightNumber, "TEST002")
  assert.equal("statusTimes" in run.written[0], false)
})

test("updatePassengerRequest: патч, ничего не меняющий, не пишет, не логирует и не рассылает", async () => {
  // Раньше запись, история и письмо участникам случались безусловно, а условие
  // стояло только на уведомлении — и толку от него не было: форма CRM собирает
  // input из всех пяти сервисных блоков без единого if, поэтому ключи в патче
  // есть ВСЕГДА. «Сохранить», не изменив ничего, писало строку в историю заявки
  // и рассылало участникам письмо об обновлении, которого не было. Теперь
  // совпадение патча с документом ловится сравнением (patchIsNoop), и мутация
  // выходит, не тронув ни один канал.
  //
  // Патч здесь намеренно НЕ пустой: три ключа, и каждый повторяет то, что уже
  // лежит в заявке, — ровно тот случай, который прежнее условие пропускало.
  const unchanged = await runFapMutation("updatePassengerRequest", {
    id: "req-1",
    input: {
      flightNumber: "TEST001",
      status: "CREATED",
      waterService: { plan: { enabled: true, peopleCount: 4 } }
    }
  })

  assert.deepEqual(unchanged.order, ["passengerRequest.findUnique"])
  assert.deepEqual(unchanged.written, [], "ни записи")
  assert.deepEqual(unchanged.logged, [], "ни истории")
  assert.deepEqual(unchanged.notified, [], "ни уведомления")
  assert.deepEqual(unchanged.published, [], "ни публикации")
  // Мутация всё равно обязана вернуть заявку — клиент читает ответ.
  assert.equal(unchanged.result.id, "req-1")
  assert.equal(unchanged.result.flightNumber, "TEST001")

  // Обратная половина: настоящая правка по-прежнему доходит до всех каналов.
  // Без неё тест доказывал бы только то, что мутация перестала работать.
  const changed = await runFapMutation("updatePassengerRequest", {
    id: "req-1",
    input: { flightNumber: "TEST002" }
  })

  assert.deepEqual(changed.written, [{ flightNumber: "TEST002" }])
  assert.equal(changed.logged.length, 1)
  assert.equal(changed.logged[0].action, "update_passenger_request")
  assert.equal(changed.notified.length, 1)
  assert.deepEqual(changed.published, [
    "NOTIFICATION",
    "PASSENGER_REQUEST_UPDATED"
  ])
})

test("ДЕФЕКТ №20: в updatePassengerRequest сначала уведомление, потом публикация", async () => {
  // Порядок побочных каналов у двух соседних мутаций противоположный.
  // Реестр дефектов спеки, №20. Вторая половина — в следующем тесте.
  const run = await runFapMutation("updatePassengerRequest", {
    id: "req-1",
    input: { flightNumber: "TEST002" }
  })

  assert.deepEqual(run.published, ["NOTIFICATION", "PASSENGER_REQUEST_UPDATED"])
  assert.ok(
    run.order.indexOf("notification.create") <
      run.order.indexOf("publish:PASSENGER_REQUEST_UPDATED")
  )
})

test("ДЕФЕКТ №20: в cancelPassengerRequest наоборот — сначала публикация, потом уведомление", async () => {
  const run = await runFapMutation("cancelPassengerRequest", {
    id: "req-1",
    cancelReason: "рейс отменён"
  })

  assert.deepEqual(run.published, ["PASSENGER_REQUEST_UPDATED", "NOTIFICATION"])
  assert.ok(
    run.order.indexOf("publish:PASSENGER_REQUEST_UPDATED") <
      run.order.indexOf("notification.create")
  )
})

// ─────────────────────── файлы заявки ───────────────────────
// Обе файловые мутации ходят на диск через services/passengerRequest/files.js.
// Реальных файлов тесты не создают: addPassengerRequestFiles покрыт только
// путями, на которых загрузка до диска не доходит.

test("addPassengerRequestFiles: пустой список отбивается после чтения заявки и до записи", async () => {
  const run = await runRaw("addPassengerRequestFiles", {
    requestId: "req-1",
    files: []
  })

  assert.match(run.error.message, /At least one file is required/)
  // Заявка успела прочитаться — проверка списка стоит ПОСЛЕ загрузки документа.
  assert.equal(run.double.callsTo("passengerRequest", "findUnique").length, 1)
  assert.equal(run.double.callsTo("passengerRequest", "update").length, 0)
  assert.equal(run.double.callsTo("log", "create").length, 0)
  assert.equal(run.published.length, 0)
})

test("addPassengerRequestFiles: сбой загрузки не оставляет следов — записи, лога и публикации нет", async () => {
  // Загрузка идёт ДО апдейта документа и без транзакции: упавший файл просто
  // роняет мутацию. Поток обрывается раньше, чем uploadFiles создаёт каталог,
  // поэтому диск не затрагивается.
  const brokenUpload = {
    filename: "manifest.pdf",
    createReadStream: () => {
      throw new Error("stream failed")
    }
  }

  const run = await runRaw("addPassengerRequestFiles", {
    requestId: "req-1",
    files: [brokenUpload]
  })

  assert.equal(run.error.message, "stream failed")
  assert.equal(run.double.callsTo("passengerRequest", "update").length, 0)
  assert.equal(run.double.callsTo("log", "create").length, 0)
  assert.equal(run.published.length, 0)
})

test("removePassengerRequestFile: чужой путь отбивается до диска и до записи", async () => {
  const request = makeRequest({
    files: ["/files/uploads/passenger-requests/__characterization__/a.pdf"]
  })

  const run = await runRaw(
    "removePassengerRequestFile",
    {
      requestId: "req-1",
      filePath: "/files/uploads/passenger-requests/__characterization__/b.pdf"
    },
    { request }
  )

  assert.match(run.error.message, /File not found on this passenger request/)
  assert.equal(run.double.callsTo("passengerRequest", "update").length, 0)
  assert.equal(run.double.callsTo("log", "create").length, 0)
  assert.equal(run.published.length, 0)
})

test("removePassengerRequestFile: путь сравнивается канонически, удаляется из списка, пишется лог", async () => {
  // Пути ведут в заведомо несуществующий каталог: deleteFiles глотает ENOENT,
  // так что с диска ничего не удаляется, а поведение мутации видно целиком.
  const kept = "/files/uploads/passenger-requests/__characterization__/kept.pdf"
  const request = makeRequest({
    files: [
      "/files/uploads/passenger-requests/__characterization__/gone.pdf",
      kept
    ]
  })

  const run = await runFapMutation(
    "removePassengerRequestFile",
    {
      requestId: "req-1",
      // Без префикса /files — canonicalFilePath приводит обе стороны к одному виду.
      filePath: "uploads/passenger-requests/__characterization__/gone.pdf"
    },
    { request }
  )

  assert.deepEqual(run.written, [{ files: [kept] }])
  assert.equal(run.logged.length, 1)
  assert.equal(run.logged[0].action, "remove_passenger_request_file")
  assert.equal(run.notified.length, 0, "сайтового уведомления по файлам нет")
  assert.deepEqual(run.published, ["PASSENGER_REQUEST_UPDATED"])
})

// ─────────────────────────── deletePassengerRequest ───────────────────────────

test("deletePassengerRequest удаляет документ, пишет лог и не уведомляет", async () => {
  const run = await runFapMutation("deletePassengerRequest", { id: "req-1" })

  assert.equal(run.result, true)
  assert.equal(run.written.length, 0, "апдейта нет — только delete")
  assert.ok(run.order.includes("passengerRequest.delete"))
  assert.equal(run.logged.length, 1)
  assert.equal(run.logged[0].action, "delete_passenger_request")
  assert.equal(run.notified.length, 0)
})

test("ДЕФЕКТ №8: deletePassengerRequest публикует удалённый документ в топик обновления", async () => {
  // Топика PASSENGER_REQUEST_DELETED не существует, поэтому удаление уезжает
  // подписчикам как очередное обновление. Реестр дефектов спеки, №8.
  const run = await runRaw("deletePassengerRequest", { id: "req-1" })

  assert.equal(run.published.length, 1)
  assert.equal(run.published[0].topic, "PASSENGER_REQUEST_UPDATED")
  assert.equal(run.published[0].payload.passengerRequestUpdated.id, "req-1")
})

// ────────────────────── setPassengerRequestStatus / cancel ─────────────────────

test("setPassengerRequestStatus пишет статус и отметку времени статуса", async () => {
  const run = await runFapMutation("setPassengerRequestStatus", {
    id: "req-1",
    status: "ACCEPTED"
  })

  assert.deepEqual(run.written, [
    {
      status: "ACCEPTED",
      statusTimes: { acceptedAt: "<DATE>" }
    }
  ])
  assert.equal(run.logged.length, 1)
  assert.equal(run.logged[0].action, "update_passenger_request_status")
  assert.equal(run.notified.length, 0, "сайтового уведомления о смене статуса нет")
  assert.deepEqual(run.published, ["PASSENGER_REQUEST_UPDATED"])
})

test("setPassengerRequestStatus отбивает CANCELLED и отправляет к cancelPassengerRequest", async () => {
  // Дефект №6 реестра починен. Было: общий сеттер принимал CANCELLED, писал
  // статус, НЕ писал cancelReason, слал письмо «Обновлён ФАП» вместо письма об
  // отмене и не создавал сайтового уведомления. Своего аргумента под причину у
  // сеттера в схеме нет, поэтому единственная честная форма — отказ.
  // Обратная проверка — соседний тест «пишет статус и отметку времени статуса»:
  // на любом другом статусе сеттер работает как раньше.
  // ⚠️ Дверь закрыта не вся: updatePassengerRequest пропускает status в патч и
  // остаётся вторым путём к CANCELLED без причины — дефект №5.
  const run = await runRaw("setPassengerRequestStatus", {
    id: "req-1",
    status: "CANCELLED"
  })

  assert.ok(run.error, "мутация отбита")
  assert.match(run.error.message, /cancelPassengerRequest/)
  assert.equal(run.error.extensions?.code, "BAD_USER_INPUT")
  // Проверка стоит до конверта, поэтому в базу не ходили вовсе — ни чтения,
  // ни записи, ни истории.
  assert.deepEqual(run.double.calls, [])
  assert.deepEqual(run.published, [])
})

test("cancelPassengerRequest пишет причину, статус, лог с reason и уведомление", async () => {
  const run = await runFapMutation("cancelPassengerRequest", {
    id: "req-1",
    cancelReason: "рейс отменён"
  })

  assert.deepEqual(run.written, [
    {
      cancelReason: "рейс отменён",
      status: "CANCELLED",
      statusTimes: { cancelledAt: "<DATE>" }
    }
  ])
  assert.equal(run.logged.length, 1)
  // Слаг лога тот же, что у обычной смены статуса: различить отмену можно
  // только по description и reason.
  assert.equal(run.logged[0].action, "update_passenger_request_status")
  assert.equal(run.logged[0].description, "Заявка по ФАП отменена")
  assert.equal(run.logged[0].reason, "рейс отменён")
  assert.equal(run.notified.length, 1)
  assert.equal(run.notified[0].description.action, "cancel_passenger_request")
})

test("cancelPassengerRequest НЕ требует причину: без неё мутация проходит", async () => {
  // ДЕФЕКТ №23: assertReason здесь не вызывается (в отличие от мутаций
  // *Early), а в схеме аргумент необязательный — заявка отменяется без
  // объяснения, в лог уходит reason: null. Вместе с дефектом №6 это два
  // разных пути отмены заявки без причины. При починке этот тест обязан
  // измениться.
  const run = await runFapMutation("cancelPassengerRequest", { id: "req-1" })

  assert.equal(run.written[0].status, "CANCELLED")
  assert.equal(run.written[0].cancelReason, undefined)
  assert.equal(run.logged[0].reason, null)
  assert.equal(run.notified.length, 1)
})

// ─────────────────────── updatePassengerRequestCrew ───────────────────────

test("updatePassengerRequestCrew пишет нормализованный ростер", async () => {
  const run = await runFapMutation("updatePassengerRequestCrew", {
    requestId: "req-1",
    crewMembers: [
      {
        airlinePersonalId: "  ap-1  ",
        fullName: "  Сидоров Сидор  ",
        position: "   ",
        phone: " +7900 ",
        extraFieldIgnored: "нет в белом списке"
      }
    ]
  })

  assert.deepEqual(run.written, [
    {
      crewMembers: [
        {
          airlinePersonalId: "ap-1",
          fullName: "Сидоров Сидор",
          gender: null,
          phone: "+7900",
          position: null
        }
      ]
    }
  ])
  assert.equal(run.logged.length, 1)
  assert.equal(run.logged[0].action, "update_passenger_request_crew")
  assert.equal(run.notified.length, 0)
  assert.deepEqual(run.published, ["PASSENGER_REQUEST_UPDATED"])
})

test("updatePassengerRequestCrew: не массив стирает ростер", async () => {
  const run = await runFapMutation("updatePassengerRequestCrew", {
    requestId: "req-1",
    crewMembers: null
  })

  assert.deepEqual(run.written, [{ crewMembers: [] }])
})

// ─────────────────── setPassengerRequestServiceStatus ───────────────────

test("setPassengerRequestServiceStatus пишет статус ровно в одно поле услуги", async () => {
  const cases = [
    ["WATER", "waterService"],
    ["MEAL", "mealService"],
    ["LIVING", "livingService"],
    ["TRANSFER", "transferService"],
    ["DEPARTURE_TRANSFER", "departureTransferService"],
    ["INTERCITY_TRANSFER", "intercityTransferService"],
    ["BAGGAGE_DELIVERY", "baggageDeliveryService"]
  ]

  for (const [service, field] of cases) {
    const run = await runFapMutation("setPassengerRequestServiceStatus", {
      id: "req-1",
      service,
      status: "ACCEPTED"
    })

    assert.deepEqual(Object.keys(run.written[0]), [field], `${service}: одно поле`)
    assert.equal(run.written[0][field].status, "ACCEPTED", `${service}: статус`)
    assert.equal(
      run.written[0][field].times.acceptedAt,
      "<DATE>",
      `${service}: отметка времени`
    )
    assert.equal(run.logged[0].action, "update_passenger_request_service_status")
    assert.deepEqual(run.published, ["PASSENGER_REQUEST_UPDATED"])
    assert.equal(run.notified.length, 0)
  }
})

test("setPassengerRequestServiceStatus: неизвестная услуга даёт пустой апдейт, но лог и публикацию — нет", async () => {
  // Валидации имени услуги нет: ни одна ветка не сработала, апдейт ушёл с
  // пустым data, лог и публикация всё равно случились.
  const run = await runFapMutation("setPassengerRequestServiceStatus", {
    id: "req-1",
    service: "UNKNOWN_SERVICE",
    status: "ACCEPTED"
  })

  assert.deepEqual(run.written, [{}])
  assert.equal(run.logged.length, 1)
  assert.equal(
    run.logged[0].description,
    "Статус сервиса обновлен: UNKNOWN_SERVICE"
  )
  assert.deepEqual(run.published, ["PASSENGER_REQUEST_UPDATED"])
})

test("setPassengerRequestServiceStatus подписывает автора через getSubjectName", async () => {
  // Дефект №17 реестра починен: здесь была единственная в модуле подстановка
  // context?.user?.name вместо getSubjectName, а у внешнего пользователя (PWA
  // гостиницы) user отсутствует — в логе оставался безымянный «Пользователь»,
  // причём соседняя мутация на том же экране писала осмысленное имя.
  // ⚠️ Наблюдаемого последствия у этого не было: fulldescription не читает ни
  // UI (PassengerRequestLogs рендерит description), ни почта (description ||
  // fulldescription, а description непустой всегда). Правка — согласованность.
  const context = makeHotelContext()

  const service = await runFapMutation(
    "setPassengerRequestServiceStatus",
    { id: "req-1", service: "WATER", status: "ACCEPTED" },
    { context }
  )
  assert.equal(
    service.logged[0].fulldescription,
    "Пользователь Гостиница Азия сменил статус сервиса WATER в ФАП TEST001 на ACCEPTED"
  )

  // Тот же контекст в соседней мутации даёт осмысленное имя.
  const request = await runFapMutation(
    "setPassengerRequestStatus",
    { id: "req-1", status: "ACCEPTED" },
    { context }
  )
  assert.equal(
    request.logged[0].fulldescription,
    "Пользователь Гостиница Азия сменил статус ФАП TEST001 на ACCEPTED"
  )

  // ДЕФЕКТ №22: автор лога в обоих случаях пустой — logAction берёт только
  // context.user.id, которого у EXTERNAL_USER нет. Это шире дефекта №17:
  // у истории заявок нет автора для всего PWA-сценария ФАП, а не только для
  // этой мутации. При починке этот тест обязан измениться.
  assert.equal(service.logged[0].userId, null)
  assert.equal(request.logged[0].userId, null)
})

test("setPassengerRequestServiceStatus: у диспетчера подпись не изменилась", async () => {
  // Обратная проверка к №17: getSubjectName первой веткой отдаёт
  // context.user.name, поэтому для subjectType USER строка байт в байт та же,
  // что была до правки. Расходятся только внешние субъекты.
  const run = await runFapMutation("setPassengerRequestServiceStatus", {
    id: "req-1",
    service: "WATER",
    status: "ACCEPTED"
  })
  assert.equal(
    run.logged[0].fulldescription,
    "Пользователь Диспетчер Тестовый сменил статус сервиса WATER в ФАП TEST001 на ACCEPTED"
  )
})

// ─────────────────────── recognizePassengerDocument ───────────────────────

test("recognizePassengerDocument: превышение лимита даёт TOO_MANY_REQUESTS", async () => {
  // Ограничитель — модульный синглтон, состояние общее на процесс. Чтобы тест
  // не зависел от порядка выполнения, субъект уникальный, а окно выбирается
  // прямыми вызовами check() — через мутацию это стоило бы 40 обращений в
  // Yandex Cloud.
  const subjectId = `characterization-recognize-${process.pid}-${Date.now()}`
  for (let i = 0; i < 40; i += 1) {
    assert.equal(recognitionRateLimiter.check(subjectId), true, `попытка ${i + 1}`)
  }

  const run = await runRaw(
    "recognizePassengerDocument",
    { image: { filename: "doc.jpg" } },
    { context: makeContext({ subject: { id: subjectId, name: "Диспетчер" } }) }
  )

  assert.equal(run.error.extensions.code, "TOO_MANY_REQUESTS")
  assert.match(run.error.message, /Слишком много запросов на распознавание/)
  // Отказ случается до всего остального: ни чтения заявки, ни публикаций.
  assert.equal(run.double.calls.length, 0)
  assert.equal(run.published.length, 0)
})

test("recognizePassengerDocument: субъект без id получает тот же TOO_MANY_REQUESTS", async () => {
  // check(undefined) возвращает false, и безымянный субъект получает отказ
  // «слишком много запросов», а не отказ аутентификации.
  const run = await runRaw(
    "recognizePassengerDocument",
    { image: { filename: "doc.jpg" } },
    { context: makeContext({ subject: { name: "Без идентификатора" } }) }
  )

  assert.equal(run.error.extensions.code, "TOO_MANY_REQUESTS")
})

// Характеризационные тесты группы «Отчёт по проживанию»:
// savePassengerRequestHotelReport, submitPassengerRequestHotelReport,
// hidePassengerRequestHotelReport.
//
// Фиксируют поведение КАК ЕСТЬ, включая дефекты. Тест, закрепляющий дефект,
// помечен номером из реестра спеки — при починке дефекта обязан измениться
// именно он.

import test from "node:test"
import assert from "node:assert/strict"
import resolvers from "../../../resolvers/passengerRequest/passengerRequest.resolver.js"
import { installPrismaDouble } from "../../helpers/prismaDouble.js"
import {
  normalizeSnapshot,
  installPubsubSpy,
  releasePubsubAfterTests
} from "../../helpers/fapHarness.js"
import { resolveEmailActionForLog } from "../../../services/notification/passengerRequestEmailActions.js"
import { hydratePassengerRequest } from "../../../services/passengerRequest/hydratePassengerRequest.js"
import {
  makeRequest,
  makeContext,
  makeHotelContext
} from "../fixtures/passengerRequest.js"

// Обязательно в каждом файле, импортирующем резолвер: иначе при заданном
// REDIS_URL клиенты Redis удержат процесс и раннер не завершится.
releasePubsubAfterTests()

// Отчёт живёт в ОТДЕЛЬНОЙ модели passengerRequestHotelReport, а общий
// runFapMutation сеет только заявку и снимает следы с passengerRequest.update,
// которых у этой группы нет вовсе. Поэтому стенд свой: сеем ещё и запись
// отчёта, следы снимаем с её findUnique/upsert/update и держим сырые аргументы
// (порядок ключей строки — предмет отдельного теста, а normalizeSnapshot ключи
// сортирует). Форму общего хелпера ради одной группы не расширяем.
async function runReport(
  name,
  args,
  { request = makeRequest(), report, context = makeContext() } = {}
) {
  const documents = { passengerRequest: request }
  if (report !== undefined) documents.passengerRequestHotelReport = report

  const double = installPrismaDouble({ documents })
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

  return {
    result,
    error,
    double,
    // Сырые аргументы записи отчёта: в upsert важны обе ветки (create/update),
    // в update — только data.
    upserted: double
      .callsTo("passengerRequestHotelReport", "upsert")
      .map((c) => c.args),
    updated: double
      .callsTo("passengerRequestHotelReport", "update")
      .map((c) => c.args),
    logged: double.callsTo("log", "create").map((c) => normalizeSnapshot(c.args.data)),
    notified: double
      .callsTo("notification", "create")
      .map((c) => normalizeSnapshot(c.args.data)),
    // Кого искали в passengerRequest.findUnique: первый вызов — загрузка
    // заявки, последующие приходят из почтовой ветки.
    requestLookups: double
      .callsTo("passengerRequest", "findUnique")
      .map((c) => c.args?.where?.id),
    published: spy.published,
    topics: spy.published.map((p) => p.topic),
    order: [
      ...double.calls.map((c) => ({ at: c.seq, event: `${c.model}.${c.method}` })),
      ...spy.published.map((p) => ({ at: p.seq, event: `publish:${p.topic}` }))
    ]
      .sort((a, b) => a.at - b.at)
      .map((e) => e.event)
  }
}

// Белый список полей строки отчёта — ровно то, что перечислено в маппере
// резолвера, в его порядке. По этому списку добавляются все будущие поля
// отчёта: не дописанное сюда поле молча теряется при сохранении.
const MAPPED_ROW_FIELDS = [
  "fullName",
  "personId",
  "roomNumber",
  "roomCategory",
  "roomKind",
  "daysCount",
  "breakfast",
  "lunch",
  "dinner",
  "breakfastCount",
  "lunchCount",
  "dinnerCount",
  "breakfastLunchbox",
  "lunchLunchbox",
  "dinnerLunchbox",
  "lunchboxPrice",
  "lunchboxCount",
  "foodCost",
  "accommodationCost",
  "tariffName",
  "pricePerDay",
  "placementKind",
  "accommodationDiscount",
  "placementKindOverride"
]

const saveArgs = (reportRows, hotelIndex = 0) => ({
  requestId: "req-1",
  hotelIndex,
  reportRows
})

const makeSavedReport = (overrides = {}) => ({
  id: "report-1",
  passengerRequestId: "req-1",
  hotelIndex: 0,
  reportRows: [],
  submittedAt: null,
  ...overrides
})

// ───────────────────── маппер строки: белый список и дефолты ─────────────────

test("savePassengerRequestHotelReport: строка проходит белый список маппера с дефолтами", async () => {
  const run = await runReport(
    "savePassengerRequestHotelReport",
    saveArgs([{ fullName: "Иванов Иван" }])
  )

  const rows = run.upserted[0].create.reportRows
  assert.equal(rows.length, 1)
  assert.deepEqual(
    Object.keys(rows[0]),
    MAPPED_ROW_FIELDS,
    "порядок ключей фиксирован маппером — на нём стоит сравнение reportRowsEqual"
  )
  assert.deepEqual(rows[0], {
    fullName: "Иванов Иван",
    personId: "",
    roomNumber: "",
    roomCategory: "",
    roomKind: "",
    daysCount: 0,
    breakfast: 0,
    lunch: 0,
    dinner: 0,
    breakfastCount: null,
    lunchCount: null,
    dinnerCount: null,
    breakfastLunchbox: false,
    lunchLunchbox: false,
    dinnerLunchbox: false,
    lunchboxPrice: 0,
    lunchboxCount: null,
    foodCost: 0,
    accommodationCost: 0,
    tariffName: "",
    pricePerDay: 0,
    placementKind: 0,
    accommodationDiscount: null,
    placementKindOverride: null
  })

  // Ключ уникальности отчёта — пара (заявка, индекс гостиницы).
  assert.deepEqual(run.upserted[0].where, {
    passengerRequestId_hotelIndex: { passengerRequestId: "req-1", hotelIndex: 0 }
  })
})

test("savePassengerRequestHotelReport: поле вне белого списка не попадает в сохранённую строку", async () => {
  // Резолвер вызывается напрямую, минуя валидацию схемы, — ровно так, как это
  // увидит рефакторинг: маппер перечисляет поля поимённо и всё прочее роняет.
  // Именно поэтому новое поле отчёта, добавленное только во входной тип,
  // сохранится молчаливым нулём.
  const run = await runReport(
    "savePassengerRequestHotelReport",
    saveArgs([
      {
        fullName: "Иванов Иван",
        // есть в маппере
        pricePerDay: 3500,
        // нет в маппере — ни одного из этих полей в строке не окажется
        reportCost: 999,
        airlinePersonalId: "ap-1",
        totalCost: 12345,
        comment: "оплачено наличными"
      }
    ])
  )

  const row = run.upserted[0].create.reportRows[0]
  assert.equal(row.pricePerDay, 3500)
  assert.deepEqual(Object.keys(row), MAPPED_ROW_FIELDS)
  for (const lost of ["reportCost", "airlinePersonalId", "totalCost", "comment"]) {
    assert.equal(lost in row, false, `${lost} потеряно маппером`)
  }
})

test("savePassengerRequestHotelReport: roomCategory склеивается из категории и вида, roomKind уходит сырым", async () => {
  const run = await runReport(
    "savePassengerRequestHotelReport",
    saveArgs([
      { fullName: "Полный", roomCategory: " Одноместный ", roomKind: " Стандарт " },
      { fullName: "Только вид", roomKind: "Люкс" },
      { fullName: "Только категория", roomCategory: "Двухместный" },
      { fullName: "Пусто" }
    ])
  )

  const rows = run.upserted[0].create.reportRows
  assert.equal(rows[0].roomCategory, "Одноместный / Стандарт")
  // Ярлык обрезает пробелы, а само поле вида сохраняется как пришло.
  assert.equal(rows[0].roomKind, " Стандарт ")
  assert.equal(rows[1].roomCategory, "Люкс")
  assert.equal(rows[2].roomCategory, "Двухместный")
  assert.equal(rows[3].roomCategory, "")
})

test("маппер строки НЕ идемпотентен: повторное сохранение той же строки удваивает вид номера", async () => {
  // Не из реестра дефектов спеки — обнаружено этим тестом. roomCategory на
  // выходе маппера уже содержит вид номера, и если клиент вернёт сохранённую
  // строку как есть, вид приклеится второй раз. Следствие для reportRowsEqual:
  // «холостое» пересохранение выглядит изменением и сбрасывает submittedAt.
  const first = await runReport(
    "savePassengerRequestHotelReport",
    saveArgs([{ fullName: "Иванов Иван", roomCategory: "Одноместный", roomKind: "Стандарт" }])
  )
  const stored = first.upserted[0].create.reportRows[0]
  assert.equal(stored.roomCategory, "Одноместный / Стандарт")

  const second = await runReport(
    "savePassengerRequestHotelReport",
    saveArgs([stored]),
    { report: makeSavedReport({ reportRows: [stored], submittedAt: new Date() }) }
  )
  const restored = second.upserted[0].create.reportRows[0]
  assert.equal(restored.roomCategory, "Одноместный / Стандарт / Стандарт")
  assert.equal(
    second.upserted[0].update.submittedAt,
    null,
    "круговое сохранение считается изменением и снимает отчёт с проверки"
  )
})

// ───────────────────── save: побочные каналы ─────────────────────

test("savePassengerRequestHotelReport: один лог, публикация обновления, сайтового уведомления нет", async () => {
  const run = await runReport(
    "savePassengerRequestHotelReport",
    saveArgs([{ fullName: "Иванов Иван" }])
  )

  assert.equal(run.logged.length, 1)
  assert.equal(run.logged[0].action, "save_passenger_request_hotel_report")
  assert.equal(run.logged[0].description, "Отчёт по гостинице ФАП сохранён")
  assert.equal(
    run.logged[0].fulldescription,
    "Пользователь Диспетчер Тестовый сохранил отчёт по гостинице Азия для ФАП TEST001"
  )
  assert.equal(run.logged[0].passengerRequestId, "req-1")
  assert.equal(run.logged[0].airlineId, "airline-1")

  assert.equal(run.notified.length, 0, "у сохранения отчёта сайтового уведомления нет")
  assert.deepEqual(run.topics, ["PASSENGER_REQUEST_UPDATED"])
  // Запись отчёта идёт до лога, лог — до публикации.
  assert.ok(
    run.order.indexOf("passengerRequestHotelReport.upsert") <
      run.order.indexOf("log.create")
  )
  assert.ok(
    run.order.indexOf("log.create") <
      run.order.indexOf("publish:PASSENGER_REQUEST_UPDATED")
  )
})

test("в лог сохранения отчёта осознанно уходит запись отчёта, а не заявка", async () => {
  // Это НЕ дефект, вопреки первоначальной записи №2 в реестре. У слага
  // save_passenger_request_hotel_report есть собственная ветка в
  // services/infra/logaction.js: она ждёт именно запись отчёта и достаёт из неё
  // rowsCount, а стоит раньше общей ветки passenger_request. Передача заявки
  // дала бы вырожденную сводку с нулями вместо числа строк.
  //
  // Почтовое последствие, из-за которого №2 и завели, у сохранения устранено
  // отдельно: лог зовётся со skipEmail, в почту оно не идёт.
  const run = await runReport(
    "savePassengerRequestHotelReport",
    saveArgs([{ fullName: "Иванов Иван" }])
  )

  const newData = JSON.parse(run.logged[0].newData)
  assert.deepEqual(newData, {
    id: run.result.id,
    passengerRequestId: "req-1",
    hotelIndex: 0,
    rowsCount: 1
  })
  assert.notEqual(run.result.id, "req-1", "id отчёта заведомо не id заявки")

  // Раньше здесь наблюдался второй поиск заявки — из почтовой ветки, и искал он
  // по идентификатору ОТЧЁТА. После починки дефекта №3 сохранение в почту не
  // идёт, поэтому следствие больше не наблюдаемо на save. Сам дефект №2 никуда
  // не делся: он виден выше по newData, а его почтовое последствие по-прежнему
  // закреплено соседним тестом на submit и hide.
  assert.deepEqual(run.requestLookups, ["req-1"], "почтовой ветки у save больше нет")
})

test("submit и hide логируют ЗАЯВКУ: сводка заполнена, письмо ищет по её id", async () => {
  // Было дефектом №2 реестра: в newData уходила запись отчёта. Своей ветки в
  // logaction у этих слагов нет, поэтому они попадали в общую, где
  // summarizePassengerRequest получал чужой документ и выдавал сводку из одних
  // null — при том что в тексте лога номер рейса присутствовал. Заодно
  // почтовая ветка брала passengerRequest = newData и искала заявку по
  // идентификатору ОТЧЁТА.
  //
  // У savePassengerRequestHotelReport поведение другое и НЕ дефектное: у её
  // слага в logaction есть собственная ветка, которая ждёт именно запись
  // отчёта и достаёт из неё rowsCount.
  for (const name of [
    "submitPassengerRequestHotelReport",
    "hidePassengerRequestHotelReport"
  ]) {
    const run = await runReport(
      name,
      { requestId: "req-1", hotelIndex: 0 },
      { report: makeSavedReport() }
    )

    const newData = JSON.parse(run.logged[0].newData)
    assert.equal(newData.id, "req-1", `${name}: в логе id заявки`)
    assert.equal(newData.flightNumber, "TEST001", `${name}: рейс в сводке есть`)
    assert.equal(newData.status, "CREATED", `${name}: статус заявки в сводке есть`)
    assert.equal(newData.airlineId, "airline-1", `${name}: авиакомпания в сводке есть`)
    assert.equal(newData.hotelsCount, 2, `${name}: гостиницы в сводке есть`)
    assert.match(
      run.logged[0].fulldescription,
      /ФАП TEST001/,
      `${name}: текст лога по-прежнему про заявку`
    )

    assert.deepEqual(
      run.requestLookups,
      ["req-1", "req-1"],
      `${name}: почтовая ветка ищет заявку по ЕЁ идентификатору, а не по id отчёта`
    )
  }
})

test("сохранение отчёта НЕ идёт в почту: автосейв не рассылает писем", async () => {
  // Было дефектом №3 реестра: skipEmail не передавался, и каждое сохранение
  // доходило до сборки и отправки письма. Автосохранение дёргается флашем при
  // уходе со страницы и перед выгрузкой Excel, то есть многократно, а своего
  // почтового действия у слага нет — маршрут общий, «обновление заявки».
  // Осмысленное событие здесь submit, он письмо и шлёт.
  //
  // Вход в почтовую ветку виден по ВТОРОМУ чтению заявки: его делает
  // resolveCreatorAirlineDepartment внутри sendRequestPartyEmail.
  const first = await runReport(
    "savePassengerRequestHotelReport",
    saveArgs([{ fullName: "Иванов Иван" }])
  )
  const second = await runReport(
    "savePassengerRequestHotelReport",
    saveArgs([{ fullName: "Иванов Иван" }])
  )

  assert.deepEqual(first.requestLookups, ["req-1"], "первое сохранение в почту не идёт")
  assert.deepEqual(second.requestLookups, ["req-1"], "и второе тоже")

  // Маршрут письма как таковой не менялся: у отчёта своего действия нет.
  // Именно поэтому письмо здесь и было бессмысленным.
  assert.equal(
    resolveEmailActionForLog("save_passenger_request_hotel_report"),
    "update_passenger_request"
  )

  // Запись в историю при этом остаётся: скипается почта, а не журнал.
  assert.equal(first.logged.length, 1, "история пишется по-прежнему")
})

test("сохранение отчёта отбивает hotelIndex вне диапазона", async () => {
  // Раньше assertIndex в этой мутации не вызывался вовсе, хотя в соседних
  // мутациях проживания он стоит. Индекс приходит из URL страницы отчёта и на
  // фронте не проверяется, поэтому чужое число доходило до базы: составной ключ
  // принимал что угодно, запись отчёта создавалась для несуществующей
  // гостиницы, а в тексте истории гостиница вырождалась в «без названия».
  // Проверка стоит ПОСЛЕ проверки доступа: субъект, которому заявка не видна,
  // не должен по коду ошибки узнавать, сколько в ней гостиниц.
  // В фикстуре две гостиницы, значит валидны только индексы 0 и 1.
  for (const index of [99, -1]) {
    const run = await runReport(
      "savePassengerRequestHotelReport",
      saveArgs([{ fullName: "Иванов Иван" }], index)
    )

    assert.match(run.error.message, /Invalid hotelIndex/, `индекс ${index}: текст ошибки`)
    assert.equal(run.upserted.length, 0, `индекс ${index}: записи отчёта нет`)
    assert.equal(run.logged.length, 0, `индекс ${index}: в историю ничего не пишется`)
    assert.equal(run.notified.length, 0, `индекс ${index}: уведомления нет`)
    assert.equal(run.published.length, 0, `индекс ${index}: публикации нет`)
    // Заявка при этом уже прочитана: проверка индекса стоит после её загрузки.
    assert.deepEqual(
      run.requestLookups,
      ["req-1"],
      `индекс ${index}: заявку успели прочитать`
    )
  }

  // Обратная проверка: валидные индексы по-прежнему сохраняются. Без неё тест
  // доказывал бы только то, что мутация перестала работать вообще.
  for (const index of [0, 1]) {
    const run = await runReport(
      "savePassengerRequestHotelReport",
      saveArgs([{ fullName: "Иванов Иван" }], index)
    )

    assert.equal(run.error, null, `индекс ${index}: ошибки нет`)
    assert.deepEqual(run.upserted[0].where, {
      passengerRequestId_hotelIndex: { passengerRequestId: "req-1", hotelIndex: index }
    })
    assert.equal(run.upserted[0].create.hotelIndex, index)
    assert.equal(run.logged.length, 1, `индекс ${index}: история пишется`)
  }
})

// ───────────────────── submit / hide ─────────────────────

test("submitPassengerRequestHotelReport ставит submittedAt, пишет лог, уведомление и публикацию", async () => {
  const run = await runReport(
    "submitPassengerRequestHotelReport",
    { requestId: "req-1", hotelIndex: 0 },
    { report: makeSavedReport() }
  )

  assert.deepEqual(normalizeSnapshot(run.updated), [
    { data: { submittedAt: "<DATE>" }, where: { id: "report-1" } }
  ])
  assert.ok(run.updated[0].data.submittedAt instanceof Date, "проставлено время отправки")

  assert.equal(run.logged.length, 1)
  assert.equal(run.logged[0].action, "submit_passenger_request_hotel_report")
  assert.equal(
    run.logged[0].fulldescription,
    "Пользователь Диспетчер Тестовый отправил отчёт по гостинице Азия на проверку в ФАП TEST001"
  )

  assert.equal(run.notified.length, 1)
  assert.deepEqual(run.notified[0], {
    airline: { connect: { id: "airline-1" } },
    description: {
      action: "submit_passenger_request_hotel_report",
      description:
        "В ФАП <span style='color:#545873'>TEST001</span> отчёт по гостинице <span style='color:#545873'>Азия</span> отправлен на проверку"
    },
    hotel: { connect: { id: "hotel-1" } },
    passengerRequest: { connect: { id: "req-1" } }
  })

  // Сначала обновление заявки, потом уведомление — как в cancelPassengerRequest.
  assert.deepEqual(run.topics, ["PASSENGER_REQUEST_UPDATED", "NOTIFICATION"])
  assert.ok(
    run.order.indexOf("publish:PASSENGER_REQUEST_UPDATED") <
      run.order.indexOf("notification.create")
  )
})

test("hidePassengerRequestHotelReport ставит submittedAt = null и НЕ уведомляет сайт", async () => {
  const run = await runReport(
    "hidePassengerRequestHotelReport",
    { requestId: "req-1", hotelIndex: 0 },
    { report: makeSavedReport({ submittedAt: new Date("2026-08-02T09:00:00.000Z") }) }
  )

  assert.deepEqual(run.updated, [
    { where: { id: "report-1" }, data: { submittedAt: null } }
  ])
  assert.equal(run.logged.length, 1)
  assert.equal(run.logged[0].action, "hide_passenger_request_hotel_report")
  assert.equal(
    run.logged[0].fulldescription,
    "Пользователь Диспетчер Тестовый скрыл отчёт по гостинице Азия от авиакомпании в ФАП TEST001"
  )

  // Асимметрия каналов: авиакомпания узнаёт об открытии отчёта, но не о том,
  // что отчёт у неё забрали.
  assert.equal(run.notified.length, 0)
  assert.deepEqual(run.topics, ["PASSENGER_REQUEST_UPDATED"])
})

test("submit и hide без сохранённого отчёта падают и не оставляют следов", async () => {
  for (const name of [
    "submitPassengerRequestHotelReport",
    "hidePassengerRequestHotelReport"
  ]) {
    const run = await runReport(name, { requestId: "req-1", hotelIndex: 0 })

    assert.match(run.error.message, /Отчёт ещё не сохранён/, `${name}: текст ошибки`)
    assert.equal(run.updated.length, 0, `${name}: записи нет`)
    assert.equal(run.logged.length, 0, `${name}: лога нет`)
    assert.equal(run.notified.length, 0, `${name}: уведомления нет`)
    assert.equal(run.published.length, 0, `${name}: публикации нет`)
    // Заявка при этом уже прочитана — проверка отчёта стоит после загрузки.
    assert.deepEqual(run.requestLookups, ["req-1"], `${name}: заявку успели прочитать`)
  }
})

// ───────────────────── подписка ─────────────────────

test("все три мутации публикуют ЗАЯВКУ в до-состоянии, а не результат мутации", async () => {
  // publishPassengerRequestUpdated получает existing — снимок, снятый
  // loadRequestOrThrow ДО записи отчёта. Сам отчёт в полезную нагрузку не
  // попадает вовсе: подписчик обязан перечитать заявку, событие только будит.
  // Заявка этими мутациями не меняется, поэтому «до» и «после» совпадают по
  // значению — наблюдаемое здесь именно то, ЧТО публикуется.
  // В подписку уходит гидрированная заявка (ростер savedPassengers наложен на
  // сервис-персон), поэтому эталон собираем той же чистой функцией.
  const expected = normalizeSnapshot(hydratePassengerRequest(makeRequest()))

  const save = await runReport(
    "savePassengerRequestHotelReport",
    saveArgs([{ fullName: "Иванов Иван" }])
  )
  const submit = await runReport(
    "submitPassengerRequestHotelReport",
    { requestId: "req-1", hotelIndex: 0 },
    { report: makeSavedReport() }
  )
  const hide = await runReport(
    "hidePassengerRequestHotelReport",
    { requestId: "req-1", hotelIndex: 0 },
    { report: makeSavedReport({ submittedAt: new Date() }) }
  )

  for (const [label, run] of [["save", save], ["submit", submit], ["hide", hide]]) {
    const payload = run.published[0].payload.passengerRequestUpdated
    assert.equal(run.published[0].topic, "PASSENGER_REQUEST_UPDATED", label)
    assert.deepEqual(normalizeSnapshot(payload), expected, `${label}: публикуется заявка`)
    assert.equal("reportRows" in payload, false, `${label}: строк отчёта в событии нет`)
    assert.equal("submittedAt" in payload, false, `${label}: флага отправки в событии нет`)
    assert.notEqual(
      payload.id,
      run.result.id,
      `${label}: возвращается отчёт, а публикуется заявка`
    )
    // Публикация случается ПОСЛЕ записи отчёта — то есть уходит заведомо
    // устаревший снимок, а не то, что мутация только что вернула.
    const write = run.order.findIndex((e) =>
      e.startsWith("passengerRequestHotelReport.up")
    )
    assert.ok(
      write < run.order.indexOf("publish:PASSENGER_REQUEST_UPDATED"),
      `${label}: сначала запись, потом публикация`
    )
  }
})

// ───────────────────── reportRowsEqual и сброс submittedAt ─────────────────────

test("reportRowsEqual: совпавшие строки не сбрасывают submittedAt, изменившиеся — сбрасывают", async () => {
  // Эталон берём с выхода самого маппера: сравнение идёт по сериализации, и
  // повторять маппер в тесте нельзя — тест начал бы проверять свою копию.
  const input = { fullName: "Иванов Иван", daysCount: 2, pricePerDay: 3500 }
  const first = await runReport(
    "savePassengerRequestHotelReport",
    saveArgs([input])
  )
  const stored = first.upserted[0].create.reportRows

  const same = await runReport(
    "savePassengerRequestHotelReport",
    saveArgs([input]),
    { report: makeSavedReport({ reportRows: stored, submittedAt: new Date() }) }
  )
  assert.equal(
    "submittedAt" in same.upserted[0].update,
    false,
    "холостой автосейв не снимает отчёт с проверки"
  )
  assert.deepEqual(Object.keys(same.upserted[0].update), ["reportRows"])

  const changed = await runReport(
    "savePassengerRequestHotelReport",
    saveArgs([{ ...input, daysCount: 3 }]),
    { report: makeSavedReport({ reportRows: stored, submittedAt: new Date() }) }
  )
  assert.equal(changed.upserted[0].update.submittedAt, null, "правка снимает с проверки")
})

test("reportRowsEqual сравнивает сериализации: тот же набор значений в другом порядке ключей считается изменением", async () => {
  // JSON.stringify чувствителен к порядку ключей, поэтому равенство здесь —
  // равенство БАЙТОВ, а не значений. Любая запись, сохранённая маппером иной
  // редакции (другой порядок или лишнее поле), при первом же автосейве
  // «изменится» и снимет отчёт с проверки, хотя пользователь ничего не трогал.
  const first = await runReport(
    "savePassengerRequestHotelReport",
    saveArgs([{ fullName: "Иванов Иван", daysCount: 2 }])
  )
  const stored = first.upserted[0].create.reportRows[0]

  const reordered = {}
  for (const key of Object.keys(stored).reverse()) reordered[key] = stored[key]
  assert.deepEqual(reordered, stored, "значения те же — отличается только порядок")

  const run = await runReport(
    "savePassengerRequestHotelReport",
    saveArgs([{ fullName: "Иванов Иван", daysCount: 2 }]),
    { report: makeSavedReport({ reportRows: [reordered], submittedAt: new Date() }) }
  )
  assert.equal(run.upserted[0].update.submittedAt, null)

  // Отсутствующая запись отчёта приравнивается к пустому списку: сохранение
  // пустой таблицы поверх «ничего» изменением не считается.
  const empty = await runReport("savePassengerRequestHotelReport", saveArgs([]))
  assert.equal("submittedAt" in empty.upserted[0].update, false)
  // А непустая таблица поверх «ничего» — считается, хотя применится ветка create.
  assert.equal(first.upserted[0].update.submittedAt, null)
})

// ───────────────────── гейт по scope гостиницы ─────────────────────

// Аргументы всех трёх мутаций для одного индекса гостиницы.
const reportCases = (hotelIndex) => [
  ["savePassengerRequestHotelReport", saveArgs([{ fullName: "Иванов Иван" }], hotelIndex)],
  ["submitPassengerRequestHotelReport", { requestId: "req-1", hotelIndex }],
  ["hidePassengerRequestHotelReport", { requestId: "req-1", hotelIndex }]
]

test("гейт по scope: отчёт соседней гостиницы недоступен ни на запись, ни на отправку", async () => {
  // Отчёт — деньги конкретной гостиницы, а заявка общая: hotel-2 её участник и
  // проверку уровня заявки проходит. Режет именно проверка по индексу.
  const context = makeHotelContext("hotel-2")

  for (const [name, args] of reportCases(0)) {
    const run = await runReport(name, args, {
      report: makeSavedReport({ submittedAt: new Date() }),
      context
    })
    assert.equal(run.error?.extensions?.code, "FORBIDDEN", `${name}: код отказа`)
    assert.equal(run.error.extensions.http.status, 403, `${name}: статус 403`)
    assert.equal(
      run.double.callsTo("passengerRequestHotelReport").length,
      0,
      `${name}: до записи отчёта дело не дошло`
    )
    assert.equal(run.published.length, 0, `${name}: публикации не было`)
  }
})

test("гейт по scope: свой отчёт гостиница пишет, отправляет и скрывает", async () => {
  // hotel-2 стоит вторым в фикстуре, значит свой для него индекс — 1.
  const context = makeHotelContext("hotel-2")

  for (const [name, args] of reportCases(1)) {
    const run = await runReport(name, args, {
      report: makeSavedReport({ hotelIndex: 1, submittedAt: new Date() }),
      context
    })
    assert.equal(run.error, null, `${name}: отказа нет`)
    assert.ok(
      run.double.callsTo("passengerRequestHotelReport").length > 0,
      `${name}: запись отчёта тронута`
    )
  }
})

test("гейт по scope: у отправки и скрытия он же заменяет отсутствующий assertIndex", async () => {
  // У submit/hide проверки индекса нет вовсе: несуществующий индекс упирается
  // в «Отчёт ещё не сохранён». Для гостиничного субъекта тот же индекс теперь
  // даёт FORBIDDEN — своей гостиницы под ним нет. Диспетчер прежнюю ошибку
  // видит как видел.
  const hotel = await runReport(
    "submitPassengerRequestHotelReport",
    { requestId: "req-1", hotelIndex: 99 },
    { context: makeHotelContext("hotel-1") }
  )
  assert.equal(hotel.error?.extensions?.code, "FORBIDDEN")

  const dispatcher = await runReport("submitPassengerRequestHotelReport", {
    requestId: "req-1",
    hotelIndex: 99
  })
  assert.match(dispatcher.error.message, /Отчёт ещё не сохранён/)
})

// ───────────────────── аутентификация ─────────────────────

test("аутентификация: без субъекта ни одна из трёх мутаций не выполняется", async () => {
  for (const [name, args] of [
    ["savePassengerRequestHotelReport", saveArgs([{ fullName: "Иванов Иван" }])],
    ["submitPassengerRequestHotelReport", { requestId: "req-1", hotelIndex: 0 }],
    ["hidePassengerRequestHotelReport", { requestId: "req-1", hotelIndex: 0 }]
  ]) {
    const run = await runReport(name, args, {
      report: makeSavedReport(),
      context: {}
    })
    assert.match(run.error.message, /Unauthorized/, name)
    assert.equal(run.double.calls.length, 0, `${name}: до prisma дело не дошло`)
  }
})

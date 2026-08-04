// Характеризационные тесты группы «Запросы»: passengerRequests (список) и
// passengerRequest (одна заявка).
//
// Фиксируют поведение КАК ЕСТЬ, включая дефекты. Главная ценность файла —
// отпечаток сборки where в passengerRequests: она несёт всю серверную
// фильтрацию списка и будет вынесена в отдельный сервис. Ассерции ниже держат
// where целиком, а не по кусочкам: при выносе обязана совпасть форма, а не
// только набор ключей.

import test from "node:test"
import assert from "node:assert/strict"
import resolvers from "../../../resolvers/passengerRequest/passengerRequest.resolver.js"
import { installPrismaDouble } from "../../helpers/prismaDouble.js"
import { releasePubsubAfterTests } from "../../helpers/fapHarness.js"
import { makeContext } from "../fixtures/passengerRequest.js"

// Обязательно в каждом файле, импортирующем резолвер: иначе при заданном
// REDIS_URL клиенты Redis удержат процесс и раннер не завершится.
releasePubsubAfterTests()

// У Query нет ни записи, ни лога, ни публикации, поэтому общий runFapMutation
// не подходит: он сеет только documents.passengerRequest и снимает следы с
// passengerRequest.update, которых здесь нет вовсе. Стенд свой — сеем
// passengerRequestMany (двойник отдаёт его на findMany) и держим СЫРЫЕ
// аргументы вызова: в диапазонах дат лежат объекты Date, а normalizeSnapshot
// заменил бы их маркером и стёр ровно то, что проверяется.
async function runList(args, { documents = {}, context = makeContext() } = {}) {
  const double = installPrismaDouble({ documents })
  let result = null
  let error = null
  try {
    result = await resolvers.Query.passengerRequests(null, args, context)
  } catch (e) {
    error = e
  } finally {
    double.restore()
  }

  const call = double.callsTo("passengerRequest", "findMany")[0]
  return {
    result,
    error,
    args: call?.args ?? null,
    where: call?.args?.where ?? null,
    touched: double.calls.map((c) => `${c.model}.${c.method}`)
  }
}

async function runOne(args, { documents = {}, context = makeContext() } = {}) {
  const double = installPrismaDouble({ documents })
  let result = null
  let error = null
  try {
    result = await resolvers.Query.passengerRequest(null, args, context)
  } catch (e) {
    error = e
  } finally {
    double.restore()
  }

  return {
    result,
    error,
    args: double.callsTo("passengerRequest", "findUnique")[0]?.args ?? null,
    touched: double.calls.map((c) => `${c.model}.${c.method}`)
  }
}

// Ветка «заявка без даты рейса»: в Mongo null и unset — разные вещи, резолвер
// ловит обе. Форма повторяется в каждом тесте периода, поэтому вынесена.
const FLIGHT_DATE_MISSING = {
  OR: [{ flightDate: null }, { flightDate: { isSet: false } }]
}

const searchClause = (value) => ({
  OR: [
    { requestNumber: { contains: value, mode: "insensitive" } },
    { flightNumber: { contains: value, mode: "insensitive" } },
    { routeFrom: { contains: value, mode: "insensitive" } },
    { routeTo: { contains: value, mode: "insensitive" } }
  ]
})

const rangeClause = (range) => ({
  OR: [
    { flightDate: range },
    { AND: [FLIGHT_DATE_MISSING, { createdAt: range }] }
  ]
})

// --------- passengerRequests: сборка where ---------

test("passengerRequests без фильтра уходит с пустым where", async () => {
  const run = await runList({})
  assert.deepEqual(run.where, {})
  // Ключи skip/take присутствуют всегда — резолвер присваивает их безусловно.
  assert.deepEqual(Object.keys(run.args), ["where", "orderBy", "skip", "take"])
  assert.equal(run.args.skip, undefined)
  assert.equal(run.args.take, undefined)
})

test("passengerRequests переживает полностью отсутствующие args", async () => {
  // args || {} — вызов без переменных не должен падать.
  const run = await runList(undefined)
  assert.equal(run.error, null)
  assert.deepEqual(run.where, {})
})

test("airlineId, airportId и status кладутся в where плоскими равенствами", async () => {
  const run = await runList({
    filter: { airlineId: "airline-7", airportId: "airport-9", status: "CREATED" }
  })
  assert.deepEqual(run.where, {
    airlineId: "airline-7",
    airportId: "airport-9",
    status: "CREATED"
  })
})

test("плоские фильтры гейтятся истинностью, а не наличием ключа", async () => {
  // Пустая строка и null отбрасываются молча: сбросить фильтр «в пустое
  // значение» и отфильтровать по пустому значению — неразличимые запросы.
  const run = await runList({
    filter: { airlineId: "", airportId: null, status: undefined }
  })
  assert.deepEqual(run.where, {})
})

test("search разворачивается в OR по четырём полям с mode insensitive", async () => {
  const run = await runList({ filter: { search: "TS001" } })
  assert.deepEqual(run.where, { AND: [searchClause("TS001")] })
})

test("поиск регистронезависим за счёт mode insensitive, а не приведения строки", async () => {
  // Резолвер НЕ понижает регистр — строка уходит в базу как введена,
  // регистронезависимость целиком на mode: "insensitive".
  const upper = await runList({ filter: { search: "TS001" } })
  const lower = await runList({ filter: { search: "ts001" } })
  assert.equal(
    upper.where.AND[0].OR[0].requestNumber.contains,
    "TS001",
    "регистр введённой строки сохраняется"
  )
  assert.equal(lower.where.AND[0].OR[0].requestNumber.contains, "ts001")
  for (const clause of upper.where.AND[0].OR) {
    assert.equal(Object.values(clause)[0].mode, "insensitive")
  }
})

test("search обрезается по краям, а состоящий из пробелов исчезает", async () => {
  const trimmed = await runList({ filter: { search: "  TS001  " } })
  assert.deepEqual(trimmed.where, { AND: [searchClause("TS001")] })

  const blank = await runList({ filter: { search: "   " } })
  assert.deepEqual(blank.where, {}, "пустой после trim поиск не добавляет AND")
})

test("dateFrom даёт gte по flightDate и запасную ветку по createdAt", async () => {
  const run = await runList({ filter: { dateFrom: "2026-08-01T00:00:00.000Z" } })
  assert.deepEqual(run.where, {
    AND: [rangeClause({ gte: new Date("2026-08-01T00:00:00.000Z") })]
  })
})

test("dateTo даёт lte по flightDate и запасную ветку по createdAt", async () => {
  const run = await runList({ filter: { dateTo: "2026-08-31T23:59:59.000Z" } })
  assert.deepEqual(run.where, {
    AND: [rangeClause({ lte: new Date("2026-08-31T23:59:59.000Z") })]
  })
})

test("обе границы схлопываются в ОДИН диапазон, а не в два условия", async () => {
  const run = await runList({
    filter: { dateFrom: "2026-08-01T00:00:00.000Z", dateTo: "2026-08-31T00:00:00.000Z" }
  })
  const range = {
    gte: new Date("2026-08-01T00:00:00.000Z"),
    lte: new Date("2026-08-31T00:00:00.000Z")
  }
  assert.equal(run.where.AND.length, 1)
  assert.deepEqual(run.where, { AND: [rangeClause(range)] })
})

test("границы периода превращаются в Date, а не остаются строками", async () => {
  const run = await runList({ filter: { dateFrom: "2026-08-01T00:00:00.000Z" } })
  const gte = run.where.AND[0].OR[0].flightDate.gte
  assert.ok(gte instanceof Date)
  assert.equal(gte.toISOString(), "2026-08-01T00:00:00.000Z")
})

test("нечитаемая дата не валидируется и уходит в базу как Invalid Date", async () => {
  const run = await runList({ filter: { dateFrom: "не дата" } })
  const gte = run.where.AND[0].OR[0].flightDate.gte
  assert.ok(gte instanceof Date)
  assert.ok(Number.isNaN(gte.getTime()), "проверки корректности даты нет")
})

test("search и период попадают в AND по одному, поиск первым", async () => {
  // Оба используют внутренний OR — общий where.OR они бы затёрли друг друга,
  // поэтому лежат в AND отдельными элементами. Порядок фиксирован кодом.
  const run = await runList({
    filter: { search: "TS", dateFrom: "2026-08-01T00:00:00.000Z" }
  })
  assert.equal(run.where.AND.length, 2)
  assert.deepEqual(run.where.AND[0], searchClause("TS"))
  assert.deepEqual(
    run.where.AND[1],
    rangeClause({ gte: new Date("2026-08-01T00:00:00.000Z") })
  )
})

test("плоские фильтры и AND сосуществуют в одном where", async () => {
  const run = await runList({
    filter: { airlineId: "airline-7", status: "CREATED", search: "TS" }
  })
  assert.deepEqual(run.where, {
    airlineId: "airline-7",
    status: "CREATED",
    AND: [searchClause("TS")]
  })
})

test("ключ AND не появляется, когда ни поиска, ни периода нет", async () => {
  const run = await runList({ filter: { airlineId: "airline-7" } })
  assert.deepEqual(Object.keys(run.where), ["airlineId"])
})

// --------- passengerRequests: сортировка, пагинация, гидрация ---------

test("сортировка всегда createdAt desc и не настраивается", async () => {
  const plain = await runList({})
  const filtered = await runList({ filter: { search: "TS" }, skip: 5, take: 5 })
  assert.deepEqual(plain.args.orderBy, { createdAt: "desc" })
  assert.deepEqual(filtered.args.orderBy, { createdAt: "desc" })
})

test("skip и take уходят как есть, потолка страницы нет", async () => {
  const run = await runList({ skip: 10, take: 5 })
  assert.equal(run.args.skip, 10)
  assert.equal(run.args.take, 5)

  // Ни верхней границы take, ни защиты от отрицательного skip: любой клиент
  // может вытянуть весь реестр одним запросом.
  const huge = await runList({ skip: -5, take: 1000000 })
  assert.equal(huge.args.take, 1000000)
  assert.equal(huge.args.skip, -5)
})

test("нули пагинации доживают до базы, а null превращается в undefined", async () => {
  // Гейт — ?? (нулевое слияние), а не ||, поэтому take: 0 остаётся нулём,
  // то есть просит пустую страницу, а не «сколько дадут».
  const zeros = await runList({ skip: 0, take: 0 })
  assert.equal(zeros.args.skip, 0)
  assert.equal(zeros.args.take, 0)

  const nulls = await runList({ skip: null, take: null })
  assert.equal(nulls.args.skip, undefined)
  assert.equal(nulls.args.take, undefined)
})

test("выдача списка проходит через hydratePassengerRequest", async () => {
  // Ростер savedPassengers побеждает при чтении: устаревшая идентичность
  // сервис-персоны перекрывается, документ в базе при этом не меняется.
  const documents = {
    passengerRequestMany: [
      {
        id: "req-1",
        savedPassengers: [
          { personId: "p-1", fullName: "Ростер Ростерович", phone: "+70000000001" }
        ],
        waterService: { people: [{ personId: "p-1", fullName: "Устаревшее Имя" }] }
      }
    ]
  }
  const run = await runList({}, { documents })
  const person = run.result[0].waterService.people[0]
  assert.equal(person.fullName, "Ростер Ростерович")
  assert.equal(person.phone, "+70000000001")
  // Гидрация досыпает недостающие ключи идентичности нулями.
  assert.equal(person.seat, null)
  assert.equal(person.airlinePersonalId, null)
})

test("гидрируется каждый элемент списка, а не только первый", async () => {
  const documents = {
    passengerRequestMany: [
      {
        id: "req-1",
        savedPassengers: [{ personId: "p-1", fullName: "Первый Ростер" }],
        mealService: { people: [{ personId: "p-1", fullName: "Старое" }] }
      },
      {
        id: "req-2",
        savedPassengers: [{ personId: "p-2", fullName: "Второй Ростер" }],
        mealService: { people: [{ personId: "p-2", fullName: "Старое" }] }
      }
    ]
  }
  const run = await runList({}, { documents })
  assert.deepEqual(
    run.result.map((r) => r.mealService.people[0].fullName),
    ["Первый Ростер", "Второй Ростер"]
  )
})

test("пустая выдача возвращает массив, а не null", async () => {
  const run = await runList({})
  assert.deepEqual(run.result, [])
})

// --------- passengerRequest: одна заявка ---------

test("passengerRequest ищет строго по id и гидрирует найденное", async () => {
  const documents = {
    passengerRequest: {
      id: "req-1",
      savedPassengers: [{ personId: "p-1", fullName: "Ростер Ростерович" }],
      waterService: { people: [{ personId: "p-1", fullName: "Устаревшее Имя" }] }
    }
  }
  const run = await runOne({ id: "req-1" }, { documents })
  assert.deepEqual(run.args, { where: { id: "req-1" } })
  assert.deepEqual(run.touched, ["passengerRequest.findUnique"])
  assert.equal(run.result.waterService.people[0].fullName, "Ростер Ростерович")
})

test("passengerRequest отдаёт null, когда заявки нет", async () => {
  const run = await runOne({ id: "нет-такой" })
  assert.equal(run.result, null)
  assert.equal(run.error, null)
})

// --------- границы модуля ---------

test("ни одна Query не скоупится по субъекту вызывающего", async () => {
  // ЗАКРЕПЛЕНО КАК ЕСТЬ, НЕ ДЕФЕКТ К ПОЧИНКЕ ЗДЕСЬ. Обе Query читают только
  // args: context объявлен в сигнатуре и не используется. Администратор одной
  // авиакомпании без filter.airlineId получает заявки ВСЕХ авиакомпаний, а по
  // чужому airlineId — чужие. Межорганизационной изоляции в модуле нет вовсе;
  // это отдельная запланированная работа по авторизации (см. fapAccess.js:
  // там сознательно стоит только аутентификация). При её появлении этот тест
  // обязан измениться.
  const foreign = makeContext({
    subject: { id: "u-2", name: "Админ АК", role: "AIRLINEADMIN", airlineId: "airline-999" },
    user: { id: "u-2", name: "Админ АК", role: "AIRLINEADMIN", airlineId: "airline-999" }
  })

  const list = await runList({}, { context: foreign })
  assert.deepEqual(list.where, {}, "airlineId субъекта в where не подмешивается")
  assert.deepEqual(
    list.touched,
    ["passengerRequest.findMany"],
    "принадлежность субъекта нигде не выясняется"
  )

  const alien = await runList({ filter: { airlineId: "airline-1" } }, { context: foreign })
  assert.deepEqual(alien.where, { airlineId: "airline-1" }, "чужой airlineId проходит")

  const one = await runOne({ id: "req-1" }, { context: foreign })
  assert.deepEqual(one.args, { where: { id: "req-1" } }, "заявка читается без сверки владельца")
})

test("аутентификация: обе Query без субъекта отбиваются", async () => {
  const list = await runList({}, { context: {} })
  assert.match(list.error.message, /Unauthorized/)
  assert.equal(list.error.extensions.code, "UNAUTHENTICATED")
  assert.deepEqual(list.touched, [], "до базы запрос не доходит")

  const one = await runOne({ id: "req-1" }, { context: {} })
  assert.match(one.error.message, /Unauthorized/)
  assert.equal(one.error.extensions.code, "UNAUTHENTICATED")
  assert.deepEqual(one.touched, [])
})

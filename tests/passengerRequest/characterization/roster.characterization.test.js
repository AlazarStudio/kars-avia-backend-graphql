// Характеризационные тесты группы «Реестр пассажиров и группы»:
// добавление/правка/удаление записи реестра, пакетный импорт манифеста,
// сохранение и расформирование групп.
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
import { resolveEmailActionForLog } from "../../../services/notification/passengerRequestEmailActions.js"
import { makeRequest, makeContext } from "../fixtures/passengerRequest.js"

// Обязательно в каждом файле, импортирующем резолвер: иначе при заданном
// REDIS_URL клиенты Redis удержат процесс и раннер не завершится.
releasePubsubAfterTests()

// Часть тестов группы смотрит на СЫРЬЁ: personId фикстуры — валидные uuid, и
// normalizeSnapshot схлопывает их в «<UUID>», после чего двух разных людей в
// снимке не различить. Плюс нужны следы УПАВШЕЙ мутации и итоговое состояние
// документа. Форму runFapMutation ради этого не расширяем — она общая на все
// группы, поэтому стенд ставим здесь.
async function runRaw(
  name,
  args,
  { request = makeRequest(), context = makeContext(), documents = {} } = {}
) {
  const double = installPrismaDouble({
    documents: { passengerRequest: request, ...documents }
  })
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

const IVAN = "aaaaaaaa-0000-4000-8000-000000000001"
const PETR = "aaaaaaaa-0000-4000-8000-000000000002"

// Ростер с читаемыми (не-uuid) идентификаторами: normalizeSnapshot их не
// маскирует, поэтому состав групп виден в снимке как есть.
const plainPerson = (personId, fullName) => ({
  personId,
  fullName,
  personType: "PASSENGER",
  personCategory: "ADULT"
})

const requestWithGroups = (savedPassengers, passengerGroups) =>
  makeRequest({ savedPassengers, passengerGroups })

// ───────────────────── addPassengerRequestSavedPerson ─────────────────────

test("addPassengerRequestSavedPerson дописывает нормализованную запись, пишет лог и публикацию", async () => {
  const run = await runFapMutation("addPassengerRequestSavedPerson", {
    requestId: "req-1",
    person: {
      fullName: "  Сидоров Сидор  ",
      phone: " +7900 ",
      seat: "   ",
      personType: "CREW",
      personCategory: "CHILD",
      airlinePersonalId: "  ap-1  ",
      placementRequirement: 2,
      extraFieldIgnored: "нет в белом списке"
    }
  })

  assert.equal(run.written.length, 1)
  assert.deepEqual(Object.keys(run.written[0]), ["savedPassengers"])

  const roster = run.written[0].savedPassengers
  assert.equal(roster.length, 3, "две записи фикстуры + новая")

  // Прежние записи уносятся как есть: нормализатор трогает только входящую.
  assert.deepEqual(roster[0], {
    personId: "<UUID>",
    fullName: "Иванов Иван",
    personType: "PASSENGER",
    personCategory: "ADULT"
  })

  // Белый список: неизвестное поле входа в composite-тип не утекает,
  // пустая строка становится null, пробелы обрезаются.
  assert.deepEqual(roster[2], {
    personId: "<UUID>",
    fullName: "Сидоров Сидор",
    phone: "+7900",
    seat: null,
    personType: "CREW",
    personCategory: "CHILD",
    airlinePersonalId: "ap-1",
    placementRequirement: 2,
    addedAt: "<DATE>"
  })

  assert.equal(run.logged.length, 1)
  assert.equal(run.logged[0].action, "add_passenger_request_saved_person")
  assert.equal(run.logged[0].description, "Пассажир добавлен в реестр ФАП")
  assert.equal(
    run.logged[0].fulldescription,
    "Пользователь Диспетчер Тестовый добавил пассажира в реестр ФАП TEST001"
  )
  assert.equal(run.notified.length, 0, "сайтового уведомления по реестру нет")
  assert.deepEqual(run.published, ["PASSENGER_REQUEST_UPDATED"])
})

test("addPassengerRequestSavedPerson с существующим ФИО обновляет запись, а не плодит дубль", async () => {
  // Раньше инпут без personId штамповал новый uuid, и upsert по id вырождался
  // в append (дефект №10). Теперь одиночное добавление идёт через
  // mergeManifestPeopleIntoRoster: матч по нормализованному ФИО, existing-wins.
  const run = await runRaw("addPassengerRequestSavedPerson", {
    requestId: "req-1",
    person: { fullName: "Иванов Иван", phone: "+70000000000" }
  })

  const roster = run.double.callsTo("passengerRequest", "update")[0].args.data
    .savedPassengers

  assert.equal(roster.length, 2)
  const ivans = roster.filter((p) => p.fullName === "Иванов Иван")
  assert.equal(ivans.length, 1)
  assert.equal(ivans[0].personId, IVAN)
  assert.equal(ivans[0].phone, "+70000000000")
})

test("addPassengerRequestSavedPerson: пустое ФИО отбивается до записи, лога и публикации", async () => {
  const run = await runRaw("addPassengerRequestSavedPerson", {
    requestId: "req-1",
    person: { fullName: "   " }
  })

  assert.match(run.error.message, /fullName is required/)
  assert.equal(run.double.callsTo("passengerRequest", "update").length, 0)
  assert.equal(run.double.callsTo("log", "create").length, 0)
  assert.equal(run.published.length, 0)
})

// ──────────────────── updatePassengerRequestSavedPerson ────────────────────

test("updatePassengerRequestSavedPerson сливает патч поверх записи и штампует addedAt", async () => {
  // Слияние — полный спред патча поверх записи, а не mergeSavedPerson: любое
  // переданное поле побеждает, в том числе понижение категории. Легаси-записи
  // без addedAt получают текущее время именно в момент правки.
  const run = await runFapMutation("updatePassengerRequestSavedPerson", {
    requestId: "req-1",
    personId: PETR,
    person: {
      phone: "  +7 999  ",
      seat: "12A",
      personCategory: "ADULT",
      placementRequirement: 3
    }
  })

  assert.deepEqual(Object.keys(run.written[0]), ["savedPassengers"])
  const roster = run.written[0].savedPassengers
  assert.equal(roster.length, 2, "правка не меняет длину реестра")

  assert.deepEqual(roster[1], {
    personId: "<UUID>",
    fullName: "Петров Пётр",
    phone: "+7 999",
    seat: "12A",
    personType: "PASSENGER",
    personCategory: "ADULT",
    airlinePersonalId: null,
    placementRequirement: 3,
    addedAt: "<DATE>"
  })
  // Соседняя запись не пересобиралась — она без addedAt и без null-полей.
  assert.deepEqual(roster[0], {
    personId: "<UUID>",
    fullName: "Иванов Иван",
    personType: "PASSENGER",
    personCategory: "ADULT"
  })

  assert.equal(run.logged.length, 1)
  assert.equal(run.logged[0].action, "update_passenger_request_saved_person")
  assert.equal(run.notified.length, 0)
  assert.deepEqual(run.published, ["PASSENGER_REQUEST_UPDATED"])
})

test("updatePassengerRequestSavedPerson: чужой personId отбивается до записи, лога и публикации", async () => {
  const run = await runRaw("updatePassengerRequestSavedPerson", {
    requestId: "req-1",
    personId: "нет-такого",
    person: { phone: "+7000" }
  })

  assert.match(run.error.message, /Saved passenger not found/)
  assert.equal(run.double.callsTo("passengerRequest", "update").length, 0)
  assert.equal(run.double.callsTo("log", "create").length, 0)
  assert.equal(run.published.length, 0)
})

test("страж «дублей идентичности» сравнивает personId, а не ФИО: переименование в тёзку проходит", async () => {
  // updateSavedPersonInRoster ищет конфликт по rosterMatchKey (= personId), а
  // personId в merged принудительно равен правимому — совпасть может только с
  // уже существующим дублем personId. Проверка ФИО не участвует, поэтому
  // переименование в тёзку оставляет две записи; схлопывать их — мутация merge.
  const run = await runRaw("updatePassengerRequestSavedPerson", {
    requestId: "req-1",
    personId: PETR,
    person: { fullName: "Иванов Иван" }
  })

  assert.equal(run.error, null)
  const roster = run.double.callsTo("passengerRequest", "update")[0].args.data
    .savedPassengers
  assert.deepEqual(
    roster.map((p) => p.fullName),
    ["Иванов Иван", "Иванов Иван"]
  )

  // А вот реестр с двумя одинаковыми personId (легаси до бэкфила) страж ловит.
  const broken = await runRaw(
    "updatePassengerRequestSavedPerson",
    { requestId: "req-1", personId: IVAN, person: { phone: "+7000" } },
    {
      request: makeRequest({
        savedPassengers: [
          plainPerson(IVAN, "Иванов Иван"),
          plainPerson(IVAN, "Иванов Иван (дубль)")
        ]
      })
    }
  )
  assert.match(broken.error.message, /same identity already exists/)
})

// ──────────────────── removePassengerRequestSavedPerson ────────────────────

test("removePassengerRequestSavedPerson вычищает человека из реестра И из групп", async () => {
  // stripPersonFromGroups убирает участника из всех групп и удаляет те, что
  // после этого опустели.
  const request = requestWithGroups(
    [
      plainPerson("p-1", "Первый"),
      plainPerson("p-2", "Второй"),
      plainPerson("p-3", "Третий")
    ],
    [
      { groupId: "g-1", kind: "FAMILY", memberPersonIds: ["p-1"] },
      { groupId: "g-2", kind: "ESCORT", memberPersonIds: ["p-1", "p-3"] },
      { groupId: "g-3", kind: "OTHER", memberPersonIds: ["p-2"] }
    ]
  )

  const run = await runFapMutation(
    "removePassengerRequestSavedPerson",
    { requestId: "req-1", personId: "p-1" },
    { request }
  )

  assert.deepEqual(Object.keys(run.written[0]).sort(), [
    "passengerGroups",
    "savedPassengers"
  ])
  assert.deepEqual(
    run.written[0].savedPassengers.map((p) => p.personId),
    ["p-2", "p-3"]
  )
  // g-1 состояла только из удалённого — исчезла целиком; g-2 потеряла участника.
  assert.deepEqual(
    run.written[0].passengerGroups.map((g) => [g.groupId, g.memberPersonIds]),
    [
      ["g-2", ["p-3"]],
      ["g-3", ["p-2"]]
    ]
  )

  assert.equal(run.logged.length, 1)
  assert.equal(run.logged[0].action, "remove_passenger_request_saved_person")
  assert.equal(run.notified.length, 0)
  assert.deepEqual(run.published, ["PASSENGER_REQUEST_UPDATED"])
})

test("removePassengerRequestSavedPerson НЕ трогает услуги: сервис-персона остаётся сиротой", async () => {
  // Из групп человек уходит, из waterService/livingService — нет. После
  // удаления гидрация уже не находит его в ростере, и услуга показывает
  // собственный, ничем не поддержанный снимок имени.
  const run = await runRaw("removePassengerRequestSavedPerson", {
    requestId: "req-1",
    personId: IVAN
  })

  const data = run.double.callsTo("passengerRequest", "update")[0].args.data
  assert.deepEqual(Object.keys(data).sort(), ["passengerGroups", "savedPassengers"])

  const after = run.double.state.passengerRequest
  assert.deepEqual(
    after.savedPassengers.map((p) => p.personId),
    [PETR]
  )
  assert.equal(after.waterService.people[0].personId, IVAN)
  assert.equal(after.livingService.hotels[0].people[0].personId, IVAN)
})

test("removePassengerRequestSavedPerson: чужой personId отбивается до записи, лога и публикации", async () => {
  const run = await runRaw("removePassengerRequestSavedPerson", {
    requestId: "req-1",
    personId: "нет-такого"
  })

  assert.match(run.error.message, /Saved passenger not found/)
  assert.equal(run.double.callsTo("passengerRequest", "update").length, 0)
  assert.equal(run.double.callsTo("log", "create").length, 0)
  assert.equal(run.published.length, 0)
})

// ───────────────────── addPassengerRequestSavedPeople ─────────────────────

test("addPassengerRequestSavedPeople: матч по нормализованному ФИО, existing-wins, счётчики в логе", async () => {
  const run = await runFapMutation("addPassengerRequestSavedPeople", {
    requestId: "req-1",
    people: [
      // Тот же человек другим регистром и с лишними пробелами — совпадение.
      { fullName: "  иванов   иван  ", phone: "+79001112233", seat: "1A", personCategory: "CHILD" },
      { fullName: "Новиков Новик", seat: "2B" }
    ]
  })

  const roster = run.written[0].savedPassengers
  assert.equal(roster.length, 3)

  // Совпадение: телефон и место дозаполняются (их не было), категория
  // повышается ADULT → CHILD, но запись НЕ пересобирается нормализатором —
  // addedAt так и не появляется.
  assert.deepEqual(roster[0], {
    personId: "<UUID>",
    fullName: "Иванов Иван",
    phone: "+79001112233",
    seat: "1A",
    personType: "PASSENGER",
    personCategory: "CHILD"
  })
  assert.equal(roster[1].fullName, "Петров Пётр", "несматченные не трогаются")
  assert.deepEqual(roster[2], {
    personId: "<UUID>",
    fullName: "Новиков Новик",
    phone: null,
    seat: "2B",
    personType: "PASSENGER",
    personCategory: "ADULT",
    airlinePersonalId: null,
    placementRequirement: null,
    addedAt: "<DATE>"
  })

  assert.equal(run.logged.length, 1)
  assert.equal(run.logged[0].action, "add_passenger_request_saved_people")
  assert.equal(
    run.logged[0].description,
    "Импорт манифеста в реестр ФАП: добавлено 1, пропущено 1"
  )
  assert.equal(run.notified.length, 0)
  assert.deepEqual(run.published, ["PASSENGER_REQUEST_UPDATED"])
})

test("addPassengerRequestSavedPeople: записи с пустым ФИО молча пропускаются", async () => {
  const run = await runFapMutation("addPassengerRequestSavedPeople", {
    requestId: "req-1",
    people: [{ fullName: "   " }, { fullName: "Новиков Новик" }]
  })

  assert.equal(run.written[0].savedPassengers.length, 3, "добавлен только один")
  assert.equal(
    run.logged[0].description,
    "Импорт манифеста в реестр ФАП: добавлено 1, пропущено 0"
  )
})

test("addPassengerRequestSavedPeople: близнецы дают две записи, повторный импорт идемпотентен", async () => {
  // Матчинг жадный 1:1 — каждая входная персона поглощает максимум одну
  // ещё-не-сматченную запись реестра, поэтому два одинаковых ФИО в файле дают
  // две записи, а прогон того же файла второй раз не добавляет ничего.
  const twins = [{ fullName: "Смирнов Смирн" }, { fullName: "Смирнов Смирн" }]

  const first = await runRaw("addPassengerRequestSavedPeople", {
    requestId: "req-1",
    people: twins
  })
  const afterFirst = first.double.state.passengerRequest.savedPassengers
  assert.equal(afterFirst.filter((p) => p.fullName === "Смирнов Смирн").length, 2)
  assert.equal(
    first.double.callsTo("log", "create")[0].args.data.description,
    "Импорт манифеста в реестр ФАП: добавлено 2, пропущено 0"
  )

  const second = await runFapMutation(
    "addPassengerRequestSavedPeople",
    { requestId: "req-1", people: twins },
    { request: makeRequest({ savedPassengers: afterFirst }) }
  )
  assert.equal(second.written[0].savedPassengers.length, afterFirst.length)
  assert.equal(
    second.logged[0].description,
    "Импорт манифеста в реестр ФАП: добавлено 0, пропущено 2"
  )
})

test("placementRequirement принимает только целое ≥ 1, остальное молча становится null", async () => {
  for (const [given, expected] of [
    [3, 3],
    [1, 1],
    [0, null],
    [-2, null],
    [1.5, null],
    ["2", null],
    [null, null],
    [undefined, null]
  ]) {
    const run = await runFapMutation("addPassengerRequestSavedPerson", {
      requestId: "req-1",
      person: { fullName: "Новиков Новик", placementRequirement: given }
    })
    const added = run.written[0].savedPassengers.at(-1)
    assert.equal(added.placementRequirement, expected, `вход ${String(given)}`)
  }
})

test("addPassengerRequestSavedPeople идёт со skipEmail: true — почтовой ветки нет", async () => {
  // Почта в двойник не видна напрямую, но её ветка сама читает prisma
  // (buildPassengerRequestEmail → airline/airport, сборка получателей → user и
  // отделы). У импорта манифеста между записью лога и публикацией НЕТ ни
  // одного обращения к prisma; у соседней одиночной мутации — есть.
  const imported = await runFapMutation("addPassengerRequestSavedPeople", {
    requestId: "req-1",
    people: [{ fullName: "Новиков Новик" }]
  })
  assert.deepEqual(imported.order, [
    "passengerRequest.findUnique",
    "passengerRequest.update",
    "log.create",
    "publish:PASSENGER_REQUEST_UPDATED"
  ])

  const single = await runFapMutation("addPassengerRequestSavedPerson", {
    requestId: "req-1",
    person: { fullName: "Новиков Новик" }
  })
  const emailReads = single.order.slice(
    single.order.indexOf("log.create") + 1,
    single.order.indexOf("publish:PASSENGER_REQUEST_UPDATED")
  )
  assert.deepEqual(
    emailReads,
    ["passengerRequest.findUnique", "dispatcherDepartment.findMany"],
    "у одиночного добавления та же ветка читает prisma — значит письмо собиралось"
  )
})

// ──────────────────── mergePassengerRequestSavedPeople ────────────────────

const DUP = "aaaaaaaa-0000-4000-8000-000000000099"

const requestWithScanManifestDupes = () => {
  const request = makeRequest()
  request.savedPassengers = [
    ...request.savedPassengers,
    {
      personId: DUP,
      fullName: "Иванов Иван",
      personType: "PASSENGER",
      personCategory: "CHILD",
      phone: "+7111"
    }
  ]
  request.livingService.hotels[0].people.push({
    personId: DUP,
    fullName: "Иванов Иван",
    personType: "PASSENGER",
    personCategory: "CHILD"
  })
  request.passengerGroups = [
    { groupId: "g-1", kind: "FAMILY", memberPersonIds: [DUP, PETR] }
  ]
  return request
}

test("mergePassengerRequestSavedPeople: keep-wins, ребинд услуг, групп и строк отчёта", async () => {
  const run = await runRaw(
    "mergePassengerRequestSavedPeople",
    { requestId: "req-1", keepPersonId: IVAN, mergePersonIds: [DUP] },
    {
      request: requestWithScanManifestDupes(),
      documents: {
        passengerRequestHotelReportMany: [
          {
            id: "rep-0",
            passengerRequestId: "req-1",
            hotelIndex: 0,
            reportRows: [
              {
                personId: DUP,
                fullName: "Иванов Иван",
                accommodationCost: 100
              }
            ]
          }
        ]
      }
    }
  )

  assert.equal(run.error, null)
  const data = run.double.callsTo("passengerRequest", "update")[0].args.data
  assert.equal(data.savedPassengers.length, 2)
  const kept = data.savedPassengers.find((p) => p.personId === IVAN)
  assert.equal(kept.phone, "+7111")
  assert.equal(kept.personCategory, "CHILD")
  assert.equal(
    data.savedPassengers.some((p) => p.personId === DUP),
    false
  )
  assert.deepEqual(
    data.livingService.hotels[0].people.map((p) => p.personId),
    [IVAN]
  )
  assert.deepEqual(data.passengerGroups[0].memberPersonIds, [IVAN, PETR])
  assert.deepEqual(
    run.double.callsTo("passengerRequestHotelReport", "updateMany")[0].args.data,
    { submittedAt: null, pricingApprovedAt: null }
  )
  assert.deepEqual(
    run.double.callsTo("passengerRequestHotelReport", "update")[0].args.data
      .reportRows,
    [{ personId: IVAN, fullName: "Иванов Иван", accommodationCost: 100 }]
  )
})

test("mergePassengerRequestSavedPeople: нет дублей или чужой id — отказ до записи", async () => {
  const empty = await runRaw("mergePassengerRequestSavedPeople", {
    requestId: "req-1",
    keepPersonId: IVAN,
    mergePersonIds: []
  })
  assert.match(empty.error.message, /No duplicate passengers to merge/)
  assert.equal(empty.double.callsTo("passengerRequest", "update").length, 0)

  const missing = await runRaw("mergePassengerRequestSavedPeople", {
    requestId: "req-1",
    keepPersonId: IVAN,
    mergePersonIds: ["нет-такого"]
  })
  assert.match(missing.error.message, /Saved passenger to merge not found/)
  assert.equal(missing.double.callsTo("passengerRequest", "update").length, 0)
})

// ───────────────────────── setPassengerRequestGroup ─────────────────────────

test("setPassengerRequestGroup создаёт группу с дефолтами и дедуплицирует состав", async () => {
  const request = requestWithGroups(
    [plainPerson("p-1", "Первый"), plainPerson("p-2", "Второй")],
    []
  )

  const run = await runFapMutation(
    "setPassengerRequestGroup",
    {
      requestId: "req-1",
      group: { memberPersonIds: ["p-1", "p-2", "p-1"] }
    },
    { request }
  )

  assert.deepEqual(Object.keys(run.written[0]), ["passengerGroups"])
  assert.equal(run.written[0].passengerGroups.length, 1)
  assert.deepEqual(run.written[0].passengerGroups[0], {
    groupId: "<UUID>",
    label: null,
    kind: "OTHER",
    togetherLevel: null,
    color: null,
    memberPersonIds: ["p-1", "p-2"],
    createdAt: "<DATE>"
  })

  assert.equal(run.logged.length, 1)
  assert.equal(run.logged[0].action, "set_passenger_request_group")
  assert.equal(run.logged[0].description, "Группа пассажиров сохранена")
  assert.equal(run.notified.length, 0)
  assert.deepEqual(run.published, ["PASSENGER_REQUEST_UPDATED"])
})

test("setPassengerRequestGroup: «один человек — одна группа», опустевшие группы удаляются", async () => {
  const request = requestWithGroups(
    [
      plainPerson("p-1", "Первый"),
      plainPerson("p-2", "Второй"),
      plainPerson("p-3", "Третий")
    ],
    [
      { groupId: "g-1", kind: "FAMILY", memberPersonIds: ["p-1"] },
      { groupId: "g-2", kind: "ESCORT", memberPersonIds: ["p-2", "p-3"] }
    ]
  )

  const run = await runFapMutation(
    "setPassengerRequestGroup",
    {
      requestId: "req-1",
      group: {
        groupId: "g-3",
        label: "  Семья Ивановых  ",
        kind: "FAMILY",
        togetherLevel: "ROOM",
        color: "#ff0000",
        memberPersonIds: ["p-1", "p-2"]
      }
    },
    { request }
  )

  // g-1 состояла только из p-1 → исчезла; g-2 отдала p-2 и осталась с p-3.
  assert.deepEqual(
    run.written[0].passengerGroups.map((g) => [g.groupId, g.memberPersonIds]),
    [
      ["g-2", ["p-3"]],
      ["g-3", ["p-1", "p-2"]]
    ]
  )
  assert.equal(run.written[0].passengerGroups[1].label, "Семья Ивановых")
  assert.equal(run.written[0].passengerGroups[1].togetherLevel, "ROOM")
  assert.equal(run.written[0].passengerGroups[1].color, "#ff0000")
})

test("setPassengerRequestGroup при правке существующей группы сохраняет createdAt и переносит её в конец списка", async () => {
  // Возврат — [...cleaned, next], поэтому редактируемая группа всегда уезжает
  // в хвост: порядок групп в документе непостоянен и от правки к правке
  // меняется, хотя ничего, кроме одной группы, не редактировалось.
  const request = requestWithGroups(
    [plainPerson("p-1", "Первый"), plainPerson("p-2", "Второй")],
    [
      {
        groupId: "g-1",
        label: "Старое",
        kind: "FAMILY",
        togetherLevel: "HOTEL",
        color: "#00ff00",
        memberPersonIds: ["p-1"],
        createdAt: "2026-01-01T00:00:00.000Z"
      },
      { groupId: "g-2", kind: "OTHER", memberPersonIds: ["p-2"] }
    ]
  )

  const run = await runRaw(
    "setPassengerRequestGroup",
    { requestId: "req-1", group: { groupId: "g-1", memberPersonIds: ["p-1"] } },
    { request }
  )

  const groups = run.double.callsTo("passengerRequest", "update")[0].args.data
    .passengerGroups
  assert.deepEqual(
    groups.map((g) => g.groupId),
    ["g-2", "g-1"],
    "правленая группа уехала в конец"
  )
  const edited = groups[1]
  assert.equal(edited.createdAt, "2026-01-01T00:00:00.000Z", "createdAt сохранён")
  // Непереданные поля берутся из существующей группы, а не сбрасываются.
  assert.equal(edited.label, "Старое")
  assert.equal(edited.kind, "FAMILY")
  assert.equal(edited.togetherLevel, "HOTEL")
  assert.equal(edited.color, "#00ff00")
})

test("setPassengerRequestGroup с участниками вне реестра создаёт ПУСТУЮ группу", async () => {
  // Состав мягко фильтруется по ростеру (cleaned), а next дописывается
  // безусловно — при том что остальной код старательно вычищает опустевшие
  // группы (stripPersonFromGroups и сам cleaned здесь же). Единственный путь,
  // которым в документ попадает группа без участников.
  const request = requestWithGroups([plainPerson("p-1", "Первый")], [])

  const run = await runFapMutation(
    "setPassengerRequestGroup",
    {
      requestId: "req-1",
      group: { label: "Призраки", memberPersonIds: ["нет-в-реестре"] }
    },
    { request }
  )

  assert.equal(run.written[0].passengerGroups.length, 1)
  assert.deepEqual(run.written[0].passengerGroups[0].memberPersonIds, [])
  assert.equal(run.written[0].passengerGroups[0].label, "Призраки")
  // Мутация считает это успехом: лог и публикация как при обычном сохранении.
  assert.equal(run.logged[0].action, "set_passenger_request_group")
  assert.deepEqual(run.published, ["PASSENGER_REQUEST_UPDATED"])
})

test("setPassengerRequestGroup: неизвестный kind и togetherLevel молча падают на дефолты", async () => {
  const request = requestWithGroups([plainPerson("p-1", "Первый")], [])

  const run = await runFapMutation(
    "setPassengerRequestGroup",
    {
      requestId: "req-1",
      group: { kind: "НЕТ_ТАКОГО", togetherLevel: "НЕТ_ТАКОГО", memberPersonIds: ["p-1"] }
    },
    { request }
  )

  assert.equal(run.written[0].passengerGroups[0].kind, "OTHER")
  assert.equal(run.written[0].passengerGroups[0].togetherLevel, null)
})

// ─────────────────────── removePassengerRequestGroup ───────────────────────

test("removePassengerRequestGroup убирает группу, пишет лог и публикацию", async () => {
  const request = requestWithGroups(
    [plainPerson("p-1", "Первый"), plainPerson("p-2", "Второй")],
    [
      { groupId: "g-1", kind: "FAMILY", memberPersonIds: ["p-1"] },
      { groupId: "g-2", kind: "OTHER", memberPersonIds: ["p-2"] }
    ]
  )

  const run = await runFapMutation(
    "removePassengerRequestGroup",
    { requestId: "req-1", groupId: "g-1" },
    { request }
  )

  assert.deepEqual(Object.keys(run.written[0]), ["passengerGroups"])
  assert.deepEqual(
    run.written[0].passengerGroups.map((g) => g.groupId),
    ["g-2"]
  )
  assert.equal(run.logged.length, 1)
  assert.equal(run.logged[0].action, "remove_passenger_request_group")
  assert.equal(run.logged[0].description, "Группа пассажиров расформирована")
  assert.equal(run.notified.length, 0)
  assert.deepEqual(run.published, ["PASSENGER_REQUEST_UPDATED"])
})

test("removePassengerRequestGroup с несуществующим groupId: апдейт, лог и публикация всё равно случаются", async () => {
  // Проверки существования группы нет: расформирование «ничего» неотличимо от
  // настоящего по логу и по подписке.
  const request = requestWithGroups(
    [plainPerson("p-1", "Первый")],
    [{ groupId: "g-1", kind: "FAMILY", memberPersonIds: ["p-1"] }]
  )

  const run = await runFapMutation(
    "removePassengerRequestGroup",
    { requestId: "req-1", groupId: "нет-такой" },
    { request }
  )

  assert.deepEqual(
    run.written[0].passengerGroups.map((g) => g.groupId),
    ["g-1"],
    "состав групп не изменился"
  )
  assert.equal(run.logged.length, 1)
  assert.equal(run.logged[0].action, "remove_passenger_request_group")
  assert.deepEqual(run.published, ["PASSENGER_REQUEST_UPDATED"])
})

// ─────────────────────── чтение реестра: dedupeSavedPassengers ───────────────────────

test("dedupeSavedPassengers на чтении схлопывает дубли по personId и НЕ схлопывает по ФИО", async () => {
  // Поле-резолвер PassengerRequest.savedPassengers чистит реестр при отдаче.
  // Ключ — personId: тёзки с разными id уезжают клиенту обоими; схлопывать
  // их должна мутация merge, а не чтение.
  const rosterWithNameDupes = [
    plainPerson(IVAN, "Иванов Иван"),
    plainPerson("aaaaaaaa-0000-4000-8000-000000000099", "Иванов Иван"),
    plainPerson(PETR, "Петров Пётр")
  ]

  const read = resolvers.PassengerRequest.savedPassengers({
    savedPassengers: rosterWithNameDupes
  })
  assert.equal(read.length, 3, "дубль по ФИО остаётся видимым клиенту")
  assert.equal(
    read.filter((p) => p.fullName === "Иванов Иван").length,
    2
  )

  // А дубли с одинаковым personId (легаси до бэкфила) схлопываются в первый.
  const collapsed = resolvers.PassengerRequest.savedPassengers({
    savedPassengers: [
      plainPerson(IVAN, "Иванов Иван"),
      plainPerson(IVAN, "Иванов Иван (дубль)"),
      plainPerson(PETR, "Петров Пётр")
    ]
  })
  assert.deepEqual(
    collapsed.map((p) => p.fullName),
    ["Иванов Иван", "Петров Пётр"]
  )

  // Записи без personId (легаси) под ключ не попадают и проходят все.
  const noIds = resolvers.PassengerRequest.savedPassengers({
    savedPassengers: [{ fullName: "Без id" }, { fullName: "Без id" }]
  })
  assert.equal(noIds.length, 2)
})

// ─────────────────────── маршрутизация писем и охрана ───────────────────────

test("все семь слагов группы маршрутизируются в письмо update_passenger_request", async () => {
  // Отдельного почтового действия у реестра и групп нет: получатели и шаблон
  // те же, что у любой правки заявки.
  const actions = [
    "add_passenger_request_saved_person",
    "update_passenger_request_saved_person",
    "remove_passenger_request_saved_person",
    "add_passenger_request_saved_people",
    "merge_passenger_request_saved_people",
    "set_passenger_request_group",
    "remove_passenger_request_group"
  ]
  for (const action of actions) {
    assert.equal(
      resolveEmailActionForLog(action),
      "update_passenger_request",
      action
    )
  }
})

test("аутентификация: без субъекта ни одна мутация группы не выполняется", async () => {
  const cases = [
    ["addPassengerRequestSavedPerson", { requestId: "req-1", person: { fullName: "X" } }],
    [
      "updatePassengerRequestSavedPerson",
      { requestId: "req-1", personId: IVAN, person: { phone: "+7" } }
    ],
    ["removePassengerRequestSavedPerson", { requestId: "req-1", personId: IVAN }],
    ["addPassengerRequestSavedPeople", { requestId: "req-1", people: [] }],
    [
      "mergePassengerRequestSavedPeople",
      { requestId: "req-1", keepPersonId: IVAN, mergePersonIds: [PETR] }
    ],
    [
      "setPassengerRequestGroup",
      { requestId: "req-1", group: { memberPersonIds: [] } }
    ],
    ["removePassengerRequestGroup", { requestId: "req-1", groupId: "g-1" }]
  ]

  for (const [name, args] of cases) {
    await assert.rejects(
      () => runFapMutation(name, args, { context: {} }),
      /Unauthorized/,
      name
    )
  }
})

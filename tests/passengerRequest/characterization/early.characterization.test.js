// Характеризационные тесты: фиксируют поведение КАК ЕСТЬ, включая дефекты.
// Тест, закрепляющий дефект, помечен номером из реестра спеки —
// при починке дефекта обязан измениться именно он.

import test from "node:test"
import assert from "node:assert/strict"
import { releasePubsubAfterTests } from "../../helpers/fapHarness.js"
import { runFapMutation as runMutation } from "../../helpers/runFapMutation.js"
import { makeRequest } from "../fixtures/passengerRequest.js"

// Обязательно в каждом файле, импортирующем резолвер: иначе при заданном
// REDIS_URL клиенты Redis удержат процесс и раннер не завершится.
releasePubsubAfterTests()

test("completePassengerRequestWaterEarly пишет статус, время, причину и дату", async () => {
  const run = await runMutation("completePassengerRequestWaterEarly", {
    requestId: "req-1",
    reason: "рейс вылетел"
  })

  assert.equal(run.written.length, 1)
  const water = run.written[0].waterService
  assert.equal(water.status, "COMPLETED")
  assert.equal(water.earlyCompletionReason, "рейс вылетел")
  assert.equal(water.earlyCompletedAt, "<DATE>")
  assert.deepEqual(
    water.plan,
    { enabled: true, peopleCount: 4 },
    "план услуги не трогается"
  )
  assert.equal(water.people.length, 1, "список получателей не трогается")
  // updateTimes только дописывает finishedAt, ранее проставленное не переписывает.
  assert.deepEqual(water.times, { createdAt: "<DATE>", finishedAt: "<DATE>" })
})

test("completePassengerRequestWaterEarly пишет один лог и одну публикацию", async () => {
  const run = await runMutation("completePassengerRequestWaterEarly", {
    requestId: "req-1",
    reason: "рейс вылетел"
  })

  assert.equal(run.logged.length, 1)
  assert.equal(run.logged[0].action, "complete_passenger_request_water_early")
  assert.deepEqual(run.published, ["PASSENGER_REQUEST_UPDATED"])
  assert.equal(run.notified.length, 0, "сайтового уведомления у *Early нет")
})

test("completePassengerRequestBaggageEarly пишет статус, время, причину и дату", async () => {
  // Дефект №1 реестра починен: багаж писал в документ только статус и времена,
  // а причину и дату терял — в отличие от остальных четырёх *Early.
  // ⚠️ Причина в ПИСЬМО не попадает и никогда не попадала: у слага
  // complete_passenger_request_baggage_early нет своего почтового действия,
  // resolveEmailActionForLog отдаёт общее "update_passenger_request", а тело
  // письма строится как `description || fulldescription` — description
  // непустой всегда, поэтому строку «Причина: …» из fulldescription никто не
  // читает. Пользователю причина видна через Log.reason в истории заявки.
  const run = await runMutation("completePassengerRequestBaggageEarly", {
    requestId: "req-1",
    reason: "багаж выдан"
  })

  const baggage = run.written[0].baggageDeliveryService
  assert.equal(baggage.status, "COMPLETED")
  assert.equal(baggage.earlyCompletionReason, "багаж выдан")
  assert.equal(baggage.earlyCompletedAt, "<DATE>")
  // Обратная проверка: правка добавила два поля и не задела остальные —
  // список поездок, план и времена остаются такими же, как до починки.
  assert.deepEqual(baggage.drivers, [])
  // У багажной фикстуры, в отличие от водяной, createdAt в times нет —
  // updateTimes только дописывает finishedAt и ничего не выдумывает.
  assert.deepEqual(baggage.times, { finishedAt: "<DATE>" })
  assert.equal(run.logged[0].action, "complete_passenger_request_baggage_early")
  assert.equal(run.logged[0].reason, "багаж выдан")
})

test("completePassengerRequestTransferEarly пишет в поле по direction", async () => {
  const arrival = await runMutation("completePassengerRequestTransferEarly", {
    requestId: "req-1",
    reason: "перевезены"
  })
  assert.equal(arrival.written[0].transferService.status, "COMPLETED")
  assert.equal(arrival.written[0].departureTransferService, undefined)

  const departure = await runMutation("completePassengerRequestTransferEarly", {
    requestId: "req-1",
    reason: "перевезены",
    direction: "DEPARTURE"
  })
  assert.equal(departure.written[0].departureTransferService.status, "COMPLETED")
  assert.equal(departure.written[0].transferService, undefined)
})

test("у трансфера слаг лога не различает направление", async () => {
  // direction пишет в разные поля, но action и оба текста одинаковы —
  // по логу нельзя понять, какой именно трансфер завершили.
  const arrival = await runMutation("completePassengerRequestTransferEarly", {
    requestId: "req-1",
    reason: "перевезены"
  })
  const departure = await runMutation("completePassengerRequestTransferEarly", {
    requestId: "req-1",
    reason: "перевезены",
    direction: "DEPARTURE"
  })
  assert.equal(arrival.logged[0].action, departure.logged[0].action)
  assert.equal(arrival.logged[0].description, departure.logged[0].description)
  assert.equal(arrival.logged[0].fulldescription, departure.logged[0].fulldescription)
})

test("completePassengerRequestEarly правит корень заявки, а не услугу", async () => {
  const run = await runMutation("completePassengerRequestEarly", {
    id: "req-1",
    reason: "всё закрыто"
  })
  assert.equal(run.written[0].status, "COMPLETED")
  assert.equal(run.written[0].earlyCompletionReason, "всё закрыто")
  assert.equal(run.written[0].waterService, undefined, "услуги не трогаются")
})

test("НЕТ проверки статуса: услугу можно завершить из CANCELLED", async () => {
  // Ни одна из шести *Early не читает prev.status. Весь остальной модуль
  // считает CANCELLED неприкасаемым (services/passengerRequest/serviceStatus.js).
  const request = makeRequest()
  request.waterService.status = "CANCELLED"
  const run = await runMutation(
    "completePassengerRequestWaterEarly",
    { requestId: "req-1", reason: "принудительно" },
    { request }
  )
  assert.equal(run.written[0].waterService.status, "COMPLETED")
})

test("пустая причина отбивается assertReason", async () => {
  await assert.rejects(() =>
    runMutation("completePassengerRequestWaterEarly", { requestId: "req-1", reason: "  " })
  )
})

test("аутентификация: без субъекта мутация не выполняется", async () => {
  await assert.rejects(
    () =>
      runMutation(
        "completePassengerRequestWaterEarly",
        { requestId: "req-1", reason: "x" },
        { context: {} }
      ),
    /Unauthorized/
  )
})

test("completePassengerRequestMealEarly пишет статус, время, причину и дату", async () => {
  const run = await runMutation("completePassengerRequestMealEarly", {
    requestId: "req-1",
    reason: "питание выдано"
  })

  assert.equal(run.written.length, 1)
  const meal = run.written[0].mealService
  assert.equal(meal.status, "COMPLETED")
  assert.equal(meal.earlyCompletionReason, "питание выдано")
  assert.equal(meal.earlyCompletedAt, "<DATE>")
  assert.deepEqual(
    meal.plan,
    { enabled: true, peopleCount: 4 },
    "план услуги не трогается"
  )
  assert.deepEqual(meal.people, [], "список получателей не трогается")
  // У питания в фикстуре times пустой — updateTimes дописывает только finishedAt.
  assert.deepEqual(meal.times, { finishedAt: "<DATE>" })
  // Соседние услуги в data не попадают: пишется ровно одно поле.
  assert.deepEqual(Object.keys(run.written[0]), ["mealService"])
})

test("completePassengerRequestMealEarly пишет один лог и одну публикацию", async () => {
  const run = await runMutation("completePassengerRequestMealEarly", {
    requestId: "req-1",
    reason: "питание выдано"
  })

  assert.equal(run.logged.length, 1)
  assert.equal(run.logged[0].action, "complete_passenger_request_meal_early")
  assert.deepEqual(run.published, ["PASSENGER_REQUEST_UPDATED"])
  assert.equal(run.notified.length, 0, "сайтового уведомления у *Early нет")
})

test("completePassengerRequestLivingEarly пишет статус, время, причину и дату", async () => {
  const run = await runMutation("completePassengerRequestLivingEarly", {
    requestId: "req-1",
    reason: "выселены раньше срока"
  })

  assert.equal(run.written.length, 1)
  const living = run.written[0].livingService
  assert.equal(living.status, "COMPLETED")
  assert.equal(living.earlyCompletionReason, "выселены раньше срока")
  assert.equal(living.earlyCompletedAt, "<DATE>")
  assert.deepEqual(
    living.plan,
    { enabled: true, peopleCount: 4 },
    "план услуги не трогается"
  )
  // updateTimes только дописывает finishedAt, ранее проставленное не переписывает.
  assert.deepEqual(living.times, { createdAt: "<DATE>", finishedAt: "<DATE>" })
  assert.deepEqual(Object.keys(run.written[0]), ["livingService"])
})

test("completePassengerRequestLivingEarly НЕ теряет hotels и evictions", async () => {
  // Гостиницы и выселения уносятся спредом ...prev — в data они не
  // перечислены явно. Именно это обязано сохраниться при схлопывании
  // пяти сервисных *Early в одну фабрику.
  const run = await runMutation("completePassengerRequestLivingEarly", {
    requestId: "req-1",
    reason: "выселены раньше срока"
  })

  const living = run.written[0].livingService
  assert.deepEqual(living.evictions, [])
  assert.deepEqual(living.hotels, [
    {
      address: "г. Абакан, ул. Ленина, 1",
      hotelId: "hotel-1",
      itemId: "<UUID>",
      name: "Азия",
      peopleCount: 2,
      people: [
        {
          accommodationChesses: [
            {
              endAt: null,
              hotelIndex: 0,
              hotelName: "Азия",
              reason: null,
              startAt: "<DATE>"
            }
          ],
          airlinePersonalId: null,
          arrival: null,
          departure: null,
          fullName: "Иванов Иван",
          personCategory: "ADULT",
          personId: "<UUID>",
          personType: "PASSENGER",
          roomCategory: null,
          roomKind: null,
          roomNumber: "101"
        }
      ]
    },
    {
      address: "г. Абакан, ул. Мира, 5",
      hotelId: "hotel-2",
      itemId: "<UUID>",
      name: "Чаплан",
      peopleCount: 2,
      people: []
    }
  ])
})

test("completePassengerRequestLivingEarly пишет один лог и одну публикацию", async () => {
  const run = await runMutation("completePassengerRequestLivingEarly", {
    requestId: "req-1",
    reason: "выселены раньше срока"
  })

  assert.equal(run.logged.length, 1)
  assert.equal(run.logged[0].action, "complete_passenger_request_living_early")
  assert.deepEqual(run.published, ["PASSENGER_REQUEST_UPDATED"])
  assert.equal(run.notified.length, 0, "сайтового уведомления у *Early нет")
})

// ─────────────────── reopenPassengerRequestService ───────────────────
// Не характеризация, а новое поведение: обратное действие к досрочному
// завершению. Живёт в этом файле, потому что обязано снимать ровно то, что
// ставят мутации выше, — расхождение будет видно в одном экране.
//
// ⚠️ Поведения не было вовсе. Тесты проверены КРАСНЫМИ со снятой правкой.

// Заявка с уже завершённой услугой: досрочное завершение и переоткрытие
// проверяются по одному и тому же документу.
const completedWater = () =>
  makeRequest({
    waterService: {
      plan: { enabled: true, peopleCount: 4 },
      status: "COMPLETED",
      times: { createdAt: "2026-08-01T10:00:00.000Z", finishedAt: "2026-08-02T10:00:00.000Z" },
      earlyCompletionReason: "рейс вылетел",
      earlyCompletedAt: "2026-08-02T10:00:00.000Z",
      people: []
    }
  })

test("reopenPassengerRequestService возвращает услугу в работу и гасит следы завершения", async () => {
  const run = await runMutation(
    "reopenPassengerRequestService",
    { requestId: "req-1", service: "WATER", reason: "закрыли по ошибке" },
    { request: completedWater() }
  )

  const water = run.written[0].waterService
  assert.equal(water.status, "IN_PROGRESS")
  assert.equal(water.earlyCompletionReason, null)
  assert.equal(water.earlyCompletedAt, null)
  // finishedAt снят: без этого карточка показывала бы дату завершения у
  // услуги «в работе». updateTimes сам его не трогает.
  assert.deepEqual(water.times, {
    createdAt: "<DATE>",
    finishedAt: null,
    inProgressAt: "<DATE>"
  })
  assert.deepEqual(water.plan, { enabled: true, peopleCount: 4 }, "план не тронут")
})

test("reopenPassengerRequestService пишет историю с причиной", async () => {
  const run = await runMutation(
    "reopenPassengerRequestService",
    { requestId: "req-1", service: "WATER", reason: "закрыли по ошибке" },
    { request: completedWater() }
  )

  assert.equal(run.logged.length, 1)
  assert.equal(run.logged[0].action, "reopen_passenger_request_service")
  assert.equal(run.logged[0].reason, "закрыли по ошибке")
  assert.deepEqual(run.published, ["PASSENGER_REQUEST_UPDATED"])
})

test("reopenPassengerRequestService отбивает незавершённую услугу", async () => {
  // Фикстура: вода в NEW. Переоткрывать нечего, и молча писать историю
  // об этом нельзя.
  await assert.rejects(() =>
    runMutation("reopenPassengerRequestService", {
      requestId: "req-1",
      service: "WATER",
      reason: "просто так"
    })
  )
})

test("reopenPassengerRequestService отбивает пустую причину и неизвестную услугу", async () => {
  await assert.rejects(() =>
    runMutation(
      "reopenPassengerRequestService",
      { requestId: "req-1", service: "WATER", reason: "   " },
      { request: completedWater() }
    )
  )
  await assert.rejects(() =>
    runMutation(
      "reopenPassengerRequestService",
      { requestId: "req-1", service: "НЕТ ТАКОЙ", reason: "закрыли по ошибке" },
      { request: completedWater() }
    )
  )
})

test("reopenPassengerRequestService работает для водительской услуги", async () => {
  // У трансфера и багажа своя ветка записи (drivers нормализуются), поэтому
  // одной проверки на воде мало.
  const request = makeRequest({
    transferService: {
      plan: { enabled: true, peopleCount: 4 },
      status: "COMPLETED",
      times: { finishedAt: "2026-08-02T10:00:00.000Z" },
      earlyCompletionReason: "ошибка",
      earlyCompletedAt: "2026-08-02T10:00:00.000Z",
      drivers: []
    }
  })

  const run = await runMutation(
    "reopenPassengerRequestService",
    { requestId: "req-1", service: "TRANSFER", reason: "вернуть в работу" },
    { request }
  )

  const transfer = run.written[0].transferService
  assert.equal(transfer.status, "IN_PROGRESS")
  assert.equal(transfer.times.finishedAt, null)
  assert.equal(transfer.earlyCompletionReason, null)
  assert.deepEqual(transfer.drivers, [], "список водителей не потерян")
})

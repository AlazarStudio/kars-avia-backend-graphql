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

test("ДЕФЕКТ №1: completePassengerRequestBaggageEarly НЕ сохраняет причину и дату", async () => {
  // Причина принимается, проходит assertReason, попадает в лог и письмо —
  // и теряется в документе. Остальные четыре *Early её пишут.
  // Реестр дефектов спеки, №1. При починке этот тест обязан измениться.
  const run = await runMutation("completePassengerRequestBaggageEarly", {
    requestId: "req-1",
    reason: "багаж выдан"
  })

  const baggage = run.written[0].baggageDeliveryService
  assert.equal(baggage.status, "COMPLETED")
  assert.equal(baggage.earlyCompletionReason, undefined)
  assert.equal(baggage.earlyCompletedAt, undefined)
  assert.equal(run.logged[0].action, "complete_passenger_request_baggage_early")
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

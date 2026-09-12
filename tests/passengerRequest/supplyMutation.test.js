// Факт поставки: патч меняет только переданные ключи, остальное на услуге (план,
// получатели, статус) остаётся; стоимость поставщику маскируется всем, кроме
// диспетчера.

import test from "node:test"
import assert from "node:assert/strict"
import resolvers from "../../resolvers/passengerRequest/passengerRequest.resolver.js"
import { installPrismaDouble } from "../helpers/prismaDouble.js"
import { releasePubsubAfterTests } from "../helpers/fapHarness.js"
import { makeContext, makeRequest } from "./fixtures/passengerRequest.js"

releasePubsubAfterTests()

const airlineContext = () => ({
  subjectType: "USER",
  subject: { id: "u-air", name: "АК Тестовая", role: "AIRLINEADMIN", airlineId: "airline-1" },
  user: { id: "u-air", name: "АК Тестовая", role: "AIRLINEADMIN", airlineId: "airline-1" }
})

async function runSupply(context, request, service, patch) {
  const double = installPrismaDouble({ documents: { passengerRequest: request } })
  try {
    await resolvers.Mutation.updatePassengerRequestSupply(
      null,
      { requestId: request.id, service, patch },
      context
    )
    return double
  } finally {
    double.restore()
  }
}

test("updatePassengerRequestSupply: пишет факт на waterService, не трогая план и людей", async () => {
  const request = makeRequest()
  const double = await runSupply(makeContext(), request, "WATER", {
    supplier: "Моя столовая",
    suppliedAt: "2026-08-22T08:01:00.000Z",
    quantity: 94,
    unitPrice: 60,
    deliveryCost: 800
  })
  const update = double.callsTo("passengerRequest", "update")[0]
  assert.ok(update, "запись заявки состоялась")
  const water = update.args.data.waterService
  assert.equal(water.supplier, "Моя столовая")
  assert.equal(water.quantity, 94)
  assert.equal(water.unitPrice, 60)
  assert.equal(water.deliveryCost, 800)
  assert.ok(water.suppliedAt instanceof Date)
  assert.deepEqual(water.plan, request.waterService.plan, "план не тронут")
  assert.equal(water.people.length, request.waterService.people.length, "получатели не тронуты")
  assert.equal(water.status, request.waterService.status, "статус не пересчитывается")
  assert.equal(update.args.data.mealService, undefined, "чужая услуга не пишется")
})

test("updatePassengerRequestSupply: null сбрасывает, отсутствующий ключ оставляет прежнее", async () => {
  const request = makeRequest()
  request.mealService = {
    ...request.mealService,
    supplier: "Вкусно и точка",
    quantity: 99,
    unitPrice: 380
  }
  const double = await runSupply(makeContext(), request, "MEAL", { quantity: null })
  const meal = double.callsTo("passengerRequest", "update")[0].args.data.mealService
  assert.equal(meal.quantity, null)
  assert.equal(meal.supplier, "Вкусно и точка")
  assert.equal(meal.unitPrice, 380)
})

test("updatePassengerRequestSupply: неизвестная услуга отбивается", async () => {
  await assert.rejects(
    runSupply(makeContext(), makeRequest(), "LIVING", { supplier: "X" }),
    /WATER or MEAL/
  )
})

test("updatePassengerRequestSupply: не-диспетчеру отказ", async () => {
  // Факт поставки и стоимость поставщику замаскированы всем, кроме диспетчера:
  // писать их вслепую бессмысленно, поэтому мутация отбивает чужой субъект
  // ещё до чтения заявки.
  await assert.rejects(
    runSupply(airlineContext(), makeRequest(), "WATER", { supplier: "X" }),
    (e) => e.extensions?.code === "FORBIDDEN"
  )
})

test("PassengerWaterFoodService.supplierCost: авиакомпании null, диспетчеру значение", () => {
  const parent = { supplierCost: 5000 }
  assert.equal(resolvers.PassengerWaterFoodService.supplierCost(parent, {}, airlineContext()), null)
  assert.equal(resolvers.PassengerWaterFoodService.supplierCost(parent, {}, makeContext()), 5000)
})

test("PassengerServiceDriver.driverCost/distanceKm: авиакомпании null, диспетчеру значение", () => {
  const parent = { driverCost: 5300, distanceKm: 126 }
  assert.equal(resolvers.PassengerServiceDriver.driverCost(parent, {}, airlineContext()), null)
  assert.equal(resolvers.PassengerServiceDriver.distanceKm(parent, {}, airlineContext()), null)
  assert.equal(resolvers.PassengerServiceDriver.driverCost(parent, {}, makeContext()), 5300)
  assert.equal(resolvers.PassengerServiceDriver.distanceKm(parent, {}, makeContext()), 126)
})

test("updatePassengerRequestPerson не теряет факт поставки (спред prev)", async () => {
  const request = makeRequest()
  request.waterService = { ...request.waterService, supplier: "Моя столовая", quantity: 94 }
  const double = installPrismaDouble({ documents: { passengerRequest: request } })
  try {
    await resolvers.Mutation.updatePassengerRequestPerson(
      null,
      { requestId: request.id, service: "WATER", personIndex: 0, person: { fullName: "Иванов Иван" } },
      makeContext()
    )
    const water = double.callsTo("passengerRequest", "update")[0].args.data.waterService
    assert.equal(water.supplier, "Моя столовая")
    assert.equal(water.quantity, 94)
  } finally {
    double.restore()
  }
})

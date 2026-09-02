// Бэкфилл согласования цен (services/migrations/approvePricingForSubmittedReports.js).
//
// После деплоя e724a77 авиакомпания видит суммы отчёта только при заполненном
// pricingApprovedAt. У всех отчётов, отправленных до деплоя, поле пустое, и без
// бэкфилла цены исчезли бы задним числом. Здесь закрепляются правило отбора и
// содержимое патча — то, чем скрипт отличается от «обнови всё подряд».
//
// Прогон скрипта целиком тесты не делают: сухой режим проверяется на двойнике
// prisma, до базы обращение не доходит.

import test from "node:test"
import assert from "node:assert/strict"
import {
  selectReportsToApprove,
  approvalDataFor,
  run
} from "../../services/migrations/approvePricingForSubmittedReports.js"
import { installPrismaDouble } from "../helpers/prismaDouble.js"

const SUBMITTED_AT = new Date("2026-08-01T10:00:00.000Z")

const SUBMITTED = {
  id: "rep-1",
  passengerRequestId: "req-1",
  hotelIndex: 0,
  submittedAt: SUBMITTED_AT,
  pricingApprovedAt: null
}
const APPROVED = {
  id: "rep-2",
  passengerRequestId: "req-1",
  hotelIndex: 1,
  submittedAt: SUBMITTED_AT,
  pricingApprovedAt: new Date("2026-08-02T09:00:00.000Z")
}
const DRAFT = {
  id: "rep-3",
  passengerRequestId: "req-2",
  hotelIndex: 0,
  submittedAt: null,
  pricingApprovedAt: null
}

test("отбираются только отправленные без согласования", () => {
  const selected = selectReportsToApprove([SUBMITTED, APPROVED, DRAFT])
  assert.deepEqual(selected.map((r) => r.id), ["rep-1"])
})

test("уже согласованный отчёт пропускается", () => {
  // Иначе повторный прогон переписал бы настоящую дату согласования на дату
  // отправки, то есть сдвинул бы её в прошлое.
  assert.deepEqual(selectReportsToApprove([APPROVED]), [])
})

test("неотправленный отчёт пропускается", () => {
  // Черновик авиакомпании не виден вовсе — согласовывать в нём нечего, а
  // pricingApprovedAt = null у него законный.
  assert.deepEqual(selectReportsToApprove([DRAFT]), [])
})

test("пустой и отсутствующий вход дают пустой список", () => {
  assert.deepEqual(selectReportsToApprove([]), [])
  assert.deepEqual(selectReportsToApprove(undefined), [])
  assert.deepEqual(selectReportsToApprove(null), [])
})

test("патч копирует дату отправки и ничего больше не содержит", () => {
  const data = approvalDataFor(SUBMITTED)
  assert.deepEqual(Object.keys(data), ["pricingApprovedAt"], "ровно одно поле")
  assert.equal(
    data.pricingApprovedAt,
    SUBMITTED_AT,
    "дата отправки переносится как есть, без new Date()"
  )
})

test("сухой прогон считает, но не пишет", async () => {
  const double = installPrismaDouble({
    documents: { passengerRequestHotelReportMany: [SUBMITTED, APPROVED, DRAFT] }
  })
  try {
    const result = await run({ dryRun: true, log: () => {} })
    assert.deepEqual(result, { found: 1, updated: 0 })
    assert.equal(
      double.callsTo("passengerRequestHotelReport", "update").length,
      0,
      "в режиме подсчёта записей не было"
    )
  } finally {
    double.restore()
  }
})

test("боевой прогон обновляет ровно отобранные записи", async () => {
  const double = installPrismaDouble({
    documents: { passengerRequestHotelReportMany: [SUBMITTED, APPROVED, DRAFT] }
  })
  try {
    const result = await run({ log: () => {} })
    assert.deepEqual(result, { found: 1, updated: 1 })

    const updates = double
      .callsTo("passengerRequestHotelReport", "update")
      .map((call) => call.args)
    assert.equal(updates.length, 1)
    assert.deepEqual(updates[0], {
      where: { id: "rep-1" },
      data: { pricingApprovedAt: SUBMITTED_AT }
    })
  } finally {
    double.restore()
  }
})

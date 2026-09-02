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
// Реальная форма документа до деплоя: поля pricingApprovedAt в Mongo нет
// вовсе, Prisma отдаёт его как undefined.
const LEGACY = {
  id: "rep-4",
  passengerRequestId: "req-3",
  hotelIndex: 0,
  submittedAt: SUBMITTED_AT
}

test("отбираются только отправленные без согласования", () => {
  const selected = selectReportsToApprove([SUBMITTED, APPROVED, DRAFT, LEGACY])
  assert.deepEqual(selected.map((r) => r.id), ["rep-1", "rep-4"])
})

test("документ без поля pricingApprovedAt считается несогласованным", () => {
  // Именно такие документы и есть цель бэкфилла: поле появилось деплоем,
  // в старых записях его нет. undefined == null, поэтому предикат их берёт.
  assert.deepEqual(selectReportsToApprove([LEGACY]).map((r) => r.id), ["rep-4"])
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

test("запрос ищет и отсутствующее поле, а не только явный null", async () => {
  // Регрессия, стоившая пустого прогона на dev: `{ pricingApprovedAt: null }`
  // в Mongo-коннекторе не видит документы, где поля НЕТ, — а до деплоя e724a77
  // его не было ни у одного отчёта. Ветку isSet: false убирать нельзя.
  const double = installPrismaDouble({
    documents: { passengerRequestHotelReportMany: [] }
  })
  try {
    await run({ dryRun: true, log: () => {} })
    const calls = double.callsTo("passengerRequestHotelReport", "findMany")
    assert.equal(calls.length, 1)
    assert.deepEqual(calls[0].args.where, {
      submittedAt: { not: null },
      OR: [{ pricingApprovedAt: null }, { pricingApprovedAt: { isSet: false } }]
    })
  } finally {
    double.restore()
  }
})

test("сухой прогон считает, но не пишет", async () => {
  const double = installPrismaDouble({
    documents: {
      passengerRequestHotelReportMany: [SUBMITTED, APPROVED, DRAFT, LEGACY]
    }
  })
  try {
    const result = await run({ dryRun: true, log: () => {} })
    assert.deepEqual(result, { found: 2, updated: 0 })
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
    documents: {
      passengerRequestHotelReportMany: [SUBMITTED, APPROVED, DRAFT, LEGACY]
    }
  })
  try {
    const result = await run({ log: () => {} })
    assert.deepEqual(result, { found: 2, updated: 2 })

    const updates = double
      .callsTo("passengerRequestHotelReport", "update")
      .map((call) => call.args)
    assert.deepEqual(updates, [
      { where: { id: "rep-1" }, data: { pricingApprovedAt: SUBMITTED_AT } },
      { where: { id: "rep-4" }, data: { pricingApprovedAt: SUBMITTED_AT } }
    ])
  } finally {
    double.restore()
  }
})

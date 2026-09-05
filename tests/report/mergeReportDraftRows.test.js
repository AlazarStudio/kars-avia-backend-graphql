import test from "node:test"
import assert from "node:assert/strict"
import {
  detectChangedKeys,
  mergeStickyRowOverrides,
  stripChangedKeys
} from "../../services/report/mergeReportDraftRows.js"

const computed = [
  {
    requestId: "r1",
    personName: "Иванов",
    personPosition: "КВС",
    totalDays: 2,
    totalLivingCost: 1000,
    totalMealCost: 200,
    totalDebt: 1200,
    arrival: "01.08.2026 10:00:00",
    hotelName: "A"
  }
]

test("detectChangedKeys отмечает только липкие поля", () => {
  const incoming = [
    {
      ...computed[0],
      totalDays: 3,
      shareNote: "правленый вид проживания — не липкое поле"
    }
  ]
  const [row] = detectChangedKeys(computed, incoming)
  assert.deepEqual(row.changedKeys, ["totalDays"])
  assert.equal(row.shareNote, "правленый вид проживания — не липкое поле")
})

test("правка ФИО и должности — липкая (редактируемые поля черновика)", () => {
  const incoming = [{ ...computed[0], personName: "Петров", personPosition: "БП2" }]
  const [row] = detectChangedKeys(computed, incoming)
  assert.deepEqual(row.changedKeys, ["personName", "personPosition"])
})

test("пересоздание сохраняет липкие правки и берёт ФИО из заявки", () => {
  const previous = [
    {
      requestId: "r1",
      personName: "Старое имя",
      personPosition: "Старая должность",
      totalDays: 3,
      totalLivingCost: 1500,
      totalMealCost: 200,
      totalDebt: 1700,
      arrival: "01.08.2026 10:00:00",
      hotelName: "A",
      changedKeys: ["totalDays", "totalLivingCost", "totalDebt"]
    }
  ]
  const live = [
    {
      requestId: "r1",
      personName: "Новое имя",
      personPosition: "БП",
      totalDays: 2,
      totalLivingCost: 1000,
      totalMealCost: 200,
      totalDebt: 1200,
      arrival: "01.08.2026 10:00:00",
      hotelName: "A"
    }
  ]
  const [row] = mergeStickyRowOverrides(live, previous)
  assert.equal(row.personName, "Новое имя")
  assert.equal(row.personPosition, "БП")
  assert.equal(row.totalDays, 3)
  assert.equal(row.totalLivingCost, 1500)
  assert.equal(row.totalDebt, 1700)
  assert.deepEqual(row.changedKeys, ["totalDays", "totalLivingCost", "totalDebt"])
})

test("stripChangedKeys убирает метки правок для computedRows", () => {
  const stripped = stripChangedKeys([
    { requestId: "r1", totalDays: 3, changedKeys: ["totalDays"] }
  ])
  assert.equal(stripped[0].changedKeys, undefined)
  assert.equal(stripped[0].totalDays, 3)
})

test("замороженная строка переживает пересоздание нетронутой", () => {
  const previous = [
    {
      requestId: "r1",
      personName: "Иванов",
      personPosition: "КВС",
      totalDays: 3,
      totalLivingCost: 1500,
      totalMealCost: 200,
      totalDebt: 1700,
      arrival: "01.08.2026 10:00:00",
      hotelName: "A",
      frozen: true,
      changedKeys: []
    }
  ]
  const [row] = mergeStickyRowOverrides(computed, previous)
  assert.equal(row.frozen, true)
  // Все значения — прежние, хотя свежий расчёт дал другие.
  assert.equal(row.totalDays, 3)
  assert.equal(row.totalLivingCost, 1500)
  assert.equal(row.totalDebt, 1700)
  // Подсветка честно показывает, чем удержанное отличается от расчёта.
  assert.deepEqual(
    row.changedKeys.sort(),
    ["totalDays", "totalDebt", "totalLivingCost"]
  )
})

test("замороженная строка не пропадает, даже если заявка ушла из расчёта", () => {
  const rows = mergeStickyRowOverrides(
    [{ requestId: "r2", personName: "Сидоров", totalDays: 1, index: 1 }],
    [
      { requestId: "r1", personName: "Иванов", totalDays: 9, frozen: true, index: 1 },
      { requestId: "r0", personName: "Нежилец", totalDays: 5, index: 2 }
    ]
  )
  // Незамороженная r0 пропала, замороженная r1 осталась в хвосте без index —
  // normalizeReportDraftRows дономерует её по позиции.
  assert.equal(rows.length, 2)
  assert.equal(rows[1].requestId, "r1")
  assert.equal(rows[1].frozen, true)
  assert.equal(rows[1].totalDays, 9)
  assert.equal(rows[1].index, null)
})

test("новая заявка при пересоздании появляется без changedKeys", () => {
  const [row] = mergeStickyRowOverrides(
    [{ requestId: "r2", personName: "Сидоров", totalDays: 1 }],
    [{ requestId: "r1", totalDays: 9, changedKeys: ["totalDays"] }]
  )
  assert.equal(row.requestId, "r2")
  assert.deepEqual(row.changedKeys, [])
  assert.equal(row.totalDays, 1)
})

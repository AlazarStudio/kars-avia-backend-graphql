import test from "node:test"
import assert from "node:assert/strict"
import {
  normalizeBaggageTags,
  collectBaggageDriverPatch,
  normalizeDriversBaggageTags
} from "../../services/passengerRequest/baggageDelivery.js"

test("normalizeBaggageTags: тримит, выкидывает пустые, схлопывает дубли без учёта регистра", () => {
  const out = normalizeBaggageTags([" FV640586 ", "", "fv640586", null, "SU358783", 42])
  assert.deepEqual(out, ["FV640586", "SU358783"])
})

test("normalizeBaggageTags: не массив → пустой массив", () => {
  assert.deepEqual(normalizeBaggageTags(undefined), [])
  assert.deepEqual(normalizeBaggageTags(null), [])
  assert.deepEqual(normalizeBaggageTags("FV1"), [])
})

test("collectBaggageDriverPatch: берёт только присутствующие ключи", () => {
  const applied = collectBaggageDriverPatch({ reportCost: 1500 })
  assert.deepEqual(applied, { reportCost: 1500 })
})

test("collectBaggageDriverPatch: явный null очищает сумму и дату", () => {
  const applied = collectBaggageDriverPatch({
    reportCost: null,
    deliveryCompletedAt: null
  })
  assert.equal(applied.reportCost, null)
  assert.equal(applied.deliveryCompletedAt, null)
})

test("collectBaggageDriverPatch: пустой тип ТС нормализуется в null", () => {
  assert.equal(collectBaggageDriverPatch({ vehicleType: "   " }).vehicleType, null)
  assert.equal(collectBaggageDriverPatch({ vehicleType: " легковая " }).vehicleType, "легковая")
})

test("collectBaggageDriverPatch: дата приходит строкой, уходит объектом Date", () => {
  const applied = collectBaggageDriverPatch({
    deliveryCompletedAt: "2026-06-24T06:00:00.000Z"
  })
  assert.ok(applied.deliveryCompletedAt instanceof Date)
  assert.equal(applied.deliveryCompletedAt.toISOString(), "2026-06-24T06:00:00.000Z")
})

test("collectBaggageDriverPatch: бирки прогоняются через нормализацию", () => {
  const applied = collectBaggageDriverPatch({ baggageTags: [" FV1 ", "fv1", "FV2"] })
  assert.deepEqual(applied.baggageTags, ["FV1", "FV2"])
})

test("collectBaggageDriverPatch: пустой патч → пустой объект", () => {
  assert.deepEqual(collectBaggageDriverPatch({}), {})
})

test("collectBaggageDriverPatch: мусорная строка в дате → null", () => {
  const applied = collectBaggageDriverPatch({ deliveryCompletedAt: "вчера" })
  assert.equal(applied.deliveryCompletedAt, null)
})

test("collectBaggageDriverPatch: нечисловая сумма → null", () => {
  const applied = collectBaggageDriverPatch({ reportCost: "abc" })
  assert.equal(applied.reportCost, null)
})

test("collectBaggageDriverPatch: null патч → пустой объект, не бросает", () => {
  assert.deepEqual(collectBaggageDriverPatch(null), {})
})

test("normalizeDriversBaggageTags: легаси-водитель с baggageTags: null → []", () => {
  // Prisma отдаёт скалярный список внутри composite-типа как null.
  // В data такой null уходить не должен — Mongo/Prisma не примет его в String[].
  const out = normalizeDriversBaggageTags([{ fullName: "Иванов", baggageTags: null }])
  assert.deepEqual(out[0].baggageTags, [])
})

test("normalizeDriversBaggageTags: водитель без ключа baggageTags → []", () => {
  const out = normalizeDriversBaggageTags([{ fullName: "Петров" }])
  assert.deepEqual(out[0].baggageTags, [])
  assert.ok("baggageTags" in out[0])
})

test("normalizeDriversBaggageTags: существующие бирки сохраняются и нормализуются", () => {
  const out = normalizeDriversBaggageTags([
    { fullName: "Сидоров", baggageTags: [" FV1 ", "fv1", "", "SU2"] }
  ])
  assert.deepEqual(out[0].baggageTags, ["FV1", "SU2"])
})

test("normalizeDriversBaggageTags: не массив на входе → пустой массив", () => {
  assert.deepEqual(normalizeDriversBaggageTags(undefined), [])
  assert.deepEqual(normalizeDriversBaggageTags(null), [])
  assert.deepEqual(normalizeDriversBaggageTags({ 0: "х" }), [])
})

test("normalizeDriversBaggageTags: остальные поля водителя не теряются", () => {
  const driver = {
    fullName: "Иванов",
    phone: "+79990000000",
    linkPWA: "https://pwa/x",
    pickupAt: new Date("2026-06-24T06:00:00.000Z"),
    vehicleType: "Газель",
    reportCost: 1500,
    deliveryCompletedAt: null,
    people: [{ personId: "p1", fullName: "Пассажир" }],
    baggageTags: null
  }
  const [out] = normalizeDriversBaggageTags([driver])
  assert.deepEqual({ ...out, baggageTags: driver.baggageTags }, driver)
  assert.deepEqual(out.baggageTags, [])
})

test("normalizeDriversBaggageTags: чинит каждого водителя, а не только первого", () => {
  const out = normalizeDriversBaggageTags([
    { fullName: "Первый", baggageTags: ["FV1"] },
    { fullName: "Второй", baggageTags: null },
    { fullName: "Третий" }
  ])
  assert.deepEqual(out.map((d) => d.baggageTags), [["FV1"], [], []])
})

test("normalizeDriversBaggageTags: исходный массив не мутируется", () => {
  const drivers = [{ fullName: "Иванов", baggageTags: null }]
  normalizeDriversBaggageTags(drivers)
  assert.equal(drivers[0].baggageTags, null)
})

import test from "node:test"
import assert from "node:assert/strict"
import {
  REPORT_EDITABLE_FIELD_KEYS,
  normalizeReportEditableFields
} from "../../services/report/reportEditableFields.js"

test("null/undefined — сброс к дефолту (вернётся null)", () => {
  assert.equal(normalizeReportEditableFields(null), null)
  assert.equal(normalizeReportEditableFields(undefined), null)
})

test("неизвестные ключи и мусор отбрасываются, порядок канонический", () => {
  const out = normalizeReportEditableFields([
    "pricePerDay",
    "bogusKey",
    42,
    "totalDays",
    "totalDays" // дубль
  ])
  assert.deepEqual(out, ["totalDays", "pricePerDay"])
})

test("пустой массив легален: «всё только для чтения»", () => {
  assert.deepEqual(normalizeReportEditableFields([]), [])
})

test("полный список проходит целиком", () => {
  assert.deepEqual(
    normalizeReportEditableFields([...REPORT_EDITABLE_FIELD_KEYS].reverse()),
    REPORT_EDITABLE_FIELD_KEYS
  )
})

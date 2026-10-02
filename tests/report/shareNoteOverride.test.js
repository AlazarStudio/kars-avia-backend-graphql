import test from "node:test"
import assert from "node:assert/strict"
import { normalizeShareNoteOverride } from "../../services/report/reportShareMetadata.js"

test("ручной «Вид проживания»: строка обрезается, пустое и не-строки — null", () => {
  assert.equal(normalizeShareNoteOverride("  с Петровым П.П.  "), "с Петровым П.П.")
  assert.equal(normalizeShareNoteOverride(""), null)
  assert.equal(normalizeShareNoteOverride("   "), null)
  assert.equal(normalizeShareNoteOverride(null), null)
  assert.equal(normalizeShareNoteOverride(undefined), null)
  assert.equal(normalizeShareNoteOverride(42), null)
})

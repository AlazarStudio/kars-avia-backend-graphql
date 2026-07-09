import test from "node:test"
import assert from "node:assert/strict"
import { recognizePassengerDocument, EMPTY_RESULT } from "../../services/docRecognition/recognizePassengerDocument.js"

const okDeps = {
  prepareImage: async () => ({ base64: "b", mimeType: "image/jpeg" }),
  ocrRecognizeText: async () => "ИВАНОВ ИВАН SU 1234",
  gptExtractFields: async () => ({
    fullName: "Иванов Иван", flight: "SU 1234", seat: "12A", from: "SVO", to: "LED", carrier: "SU", date: ""
  }),
  logError: () => {}
}

test("успех: нормализует поля, считает confidence, отдаёт rawText", async () => {
  const r = await recognizePassengerDocument({}, okDeps)
  assert.equal(r.fullName, "Иванов Иван")
  assert.equal(r.flight, "SU1234")
  assert.equal(r.seat, "12A")
  assert.equal(r.rawText, "ИВАНОВ ИВАН SU 1234")
  assert.ok(r.confidence >= 0.6)
})

test("пустой OCR → пустой результат, GPT не зовётся", async () => {
  let gptCalled = false
  const r = await recognizePassengerDocument({}, {
    ...okDeps,
    ocrRecognizeText: async () => "   ",
    gptExtractFields: async () => { gptCalled = true; return {} }
  })
  assert.equal(gptCalled, false)
  assert.equal(r.confidence, 0)
  assert.equal(r.fullName, "")
})

test("ошибка OCR → пустой результат, без throw", async () => {
  const r = await recognizePassengerDocument({}, {
    ...okDeps,
    ocrRecognizeText: async () => { throw new Error("ocr boom") }
  })
  assert.deepEqual(r, EMPTY_RESULT)
})

test("ошибка GPT → пустой результат, без throw", async () => {
  const r = await recognizePassengerDocument({}, {
    ...okDeps,
    gptExtractFields: async () => { throw new Error("gpt boom") }
  })
  assert.deepEqual(r, EMPTY_RESULT)
})

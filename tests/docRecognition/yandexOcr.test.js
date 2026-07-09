import test from "node:test"
import assert from "node:assert/strict"
import { ocrRecognizeText, extractOcrText } from "../../services/docRecognition/yandexOcr.js"

test("extractOcrText достаёт fullText, иначе пустая строка", () => {
  assert.equal(extractOcrText({ result: { textAnnotation: { fullText: "ABC" } } }), "ABC")
  assert.equal(extractOcrText({}), "")
  assert.equal(extractOcrText(null), "")
})

test("ocrRecognizeText шлёт запрос и возвращает распознанный текст", async () => {
  const prev = { k: process.env.YANDEX_CLOUD_API_KEY, f: process.env.YANDEX_CLOUD_FOLDER_ID }
  process.env.YANDEX_CLOUD_API_KEY = "test-key"
  process.env.YANDEX_CLOUD_FOLDER_ID = "test-folder"
  let seen = null
  const http = {
    post: async (url, body, cfg) => {
      seen = { url, body, cfg }
      return { data: { result: { textAnnotation: { fullText: "ИВАНОВ ИВАН SU 1234" } } } }
    }
  }
  const text = await ocrRecognizeText("BASE64DATA", "image/jpeg", { http })
  assert.equal(text, "ИВАНОВ ИВАН SU 1234")
  assert.match(seen.url, /recognizeText/)
  assert.equal(seen.body.content, "BASE64DATA")
  assert.equal(seen.cfg.headers.Authorization, "Api-Key test-key")
  assert.equal(seen.cfg.headers["x-folder-id"], "test-folder")
  process.env.YANDEX_CLOUD_API_KEY = prev.k
  process.env.YANDEX_CLOUD_FOLDER_ID = prev.f
})

test("ocrRecognizeText бросает при отсутствии секретов", async () => {
  const prev = { k: process.env.YANDEX_CLOUD_API_KEY, f: process.env.YANDEX_CLOUD_FOLDER_ID }
  delete process.env.YANDEX_CLOUD_API_KEY
  delete process.env.YANDEX_CLOUD_FOLDER_ID
  await assert.rejects(() => ocrRecognizeText("x", "image/jpeg", { http: { post: async () => ({}) } }))
  process.env.YANDEX_CLOUD_API_KEY = prev.k
  process.env.YANDEX_CLOUD_FOLDER_ID = prev.f
})

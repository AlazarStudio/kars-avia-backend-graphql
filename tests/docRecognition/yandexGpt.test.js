import test from "node:test"
import assert from "node:assert/strict"
import { gptExtractFields, parseGptJson } from "../../services/docRecognition/yandexGpt.js"

test("parseGptJson парсит чистый JSON", () => {
  assert.deepEqual(parseGptJson('{"fullName":"Иванов Иван"}'), { fullName: "Иванов Иван" })
})

test("parseGptJson вырезает JSON из текста с обёрткой", () => {
  assert.deepEqual(parseGptJson('вот результат: {"flight":"SU1234"} конец'), { flight: "SU1234" })
})

test("parseGptJson возвращает null на мусоре", () => {
  assert.equal(parseGptJson("это не json"), null)
  assert.equal(parseGptJson(""), null)
})

test("gptExtractFields шлёт промпт и возвращает распарсенные поля", async () => {
  const prev = { k: process.env.YANDEX_CLOUD_API_KEY, f: process.env.YANDEX_CLOUD_FOLDER_ID }
  process.env.YANDEX_CLOUD_API_KEY = "test-key"
  process.env.YANDEX_CLOUD_FOLDER_ID = "test-folder"
  let seen = null
  const http = {
    post: async (url, body) => {
      seen = { url, body }
      return {
        data: { result: { alternatives: [{ message: { text: '{"fullName":"Иванов Иван","flight":"SU1234"}' } }] } }
      }
    }
  }
  const fields = await gptExtractFields("ИВАНОВ ИВАН SU 1234", { http })
  assert.equal(fields.fullName, "Иванов Иван")
  assert.equal(fields.flight, "SU1234")
  assert.match(seen.body.modelUri, /^gpt:\/\/test-folder\//)
  assert.equal(seen.body.messages[1].text, "ИВАНОВ ИВАН SU 1234")
  process.env.YANDEX_CLOUD_API_KEY = prev.k
  process.env.YANDEX_CLOUD_FOLDER_ID = prev.f
})

test("gptExtractFields возвращает {} если модель вернула не-JSON", async () => {
  const prev = { k: process.env.YANDEX_CLOUD_API_KEY, f: process.env.YANDEX_CLOUD_FOLDER_ID }
  process.env.YANDEX_CLOUD_API_KEY = "test-key"
  process.env.YANDEX_CLOUD_FOLDER_ID = "test-folder"
  const http = { post: async () => ({ data: { result: { alternatives: [{ message: { text: "не знаю" } }] } } }) }
  const fields = await gptExtractFields("текст", { http })
  assert.deepEqual(fields, {})
  process.env.YANDEX_CLOUD_API_KEY = prev.k
  process.env.YANDEX_CLOUD_FOLDER_ID = prev.f
})

import axios from "axios"
import { EXTRACTION_PROMPT } from "./extractionPrompt.js"

const LLM_URL =
  process.env.YANDEX_LLM_URL ||
  "https://llm.api.cloud.yandex.net/foundationModels/v1/completion"

export function parseGptJson(text) {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch (_) {}
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  if (start !== -1 && end !== -1 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1))
    } catch (_) {}
  }
  return null
}

export async function gptExtractFields(ocrText, { http = axios } = {}) {
  const apiKey = process.env.YANDEX_CLOUD_API_KEY
  const folderId = process.env.YANDEX_CLOUD_FOLDER_ID
  if (!apiKey || !folderId) {
    throw new Error("YANDEX_CLOUD_API_KEY / YANDEX_CLOUD_FOLDER_ID are not set")
  }
  const model = process.env.YANDEX_GPT_MODEL || "yandexgpt-lite"
  const res = await http.post(
    LLM_URL,
    {
      modelUri: `gpt://${folderId}/${model}/latest`,
      completionOptions: { stream: false, temperature: 0, maxTokens: 500 },
      messages: [
        { role: "system", text: EXTRACTION_PROMPT },
        { role: "user", text: ocrText }
      ]
    },
    {
      timeout: 15000,
      headers: {
        Authorization: `Api-Key ${apiKey}`,
        "x-folder-id": folderId,
        "Content-Type": "application/json"
      }
    }
  )
  const text = res?.data?.result?.alternatives?.[0]?.message?.text || ""
  return parseGptJson(text) || {}
}

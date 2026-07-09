import axios from "axios"

const OCR_URL =
  process.env.YANDEX_OCR_URL ||
  "https://ocr.api.cloud.yandex.net/ocr/v1/recognizeText"

export function extractOcrText(data) {
  return data?.result?.textAnnotation?.fullText || ""
}

export async function ocrRecognizeText(base64, mimeType, { http = axios } = {}) {
  const apiKey = process.env.YANDEX_CLOUD_API_KEY
  const folderId = process.env.YANDEX_CLOUD_FOLDER_ID
  if (!apiKey || !folderId) {
    throw new Error("YANDEX_CLOUD_API_KEY / YANDEX_CLOUD_FOLDER_ID are not set")
  }
  const res = await http.post(
    OCR_URL,
    {
      mimeType: mimeType || "image/jpeg",
      languageCodes: ["ru", "en"],
      model: "page",
      content: base64
    },
    {
      timeout: 15000,
      headers: {
        Authorization: `Api-Key ${apiKey}`,
        "x-folder-id": folderId,
        "x-data-logging-enabled": "false",
        "Content-Type": "application/json"
      }
    }
  )
  return extractOcrText(res.data)
}

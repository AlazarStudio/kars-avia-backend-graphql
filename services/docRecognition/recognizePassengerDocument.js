import { prepareImage as defaultPrepareImage } from "./imagePrep.js"
import { ocrRecognizeText as defaultOcr } from "./yandexOcr.js"
import { gptExtractFields as defaultGpt } from "./yandexGpt.js"
import { normalizeFields, computeConfidence } from "./normalize.js"

export const EMPTY_RESULT = {
  fullName: "",
  flight: "",
  from: "",
  to: "",
  carrier: "",
  seat: "",
  date: "",
  confidence: 0,
  rawText: ""
}

export async function recognizePassengerDocument(upload, deps = {}) {
  const {
    prepareImage = defaultPrepareImage,
    ocrRecognizeText = defaultOcr,
    gptExtractFields = defaultGpt,
    logError = (msg) => console.error("[docRecognition]", msg)
  } = deps
  try {
    const { base64, mimeType } = await prepareImage(upload)
    const rawText = await ocrRecognizeText(base64, mimeType)
    if (!rawText || !rawText.trim()) {
      return { ...EMPTY_RESULT }
    }
    const rawFields = await gptExtractFields(rawText)
    const fields = normalizeFields(rawFields)
    return {
      ...fields,
      confidence: computeConfidence(fields),
      rawText
    }
  } catch (err) {
    logError(err?.message || String(err))
    return { ...EMPTY_RESULT }
  }
}

import { getFrontendUrl } from "../auth/appConfig.js"

function withChatId(url, chatId) {
  if (!url || !chatId) return url
  const sep = url.includes("?") ? "&" : "?"
  return `${url}${sep}chatId=${encodeURIComponent(chatId)}`
}

export function buildRequestCardUrl(requestId) {
  const base = getFrontendUrl()
  if (!base || !requestId) return ""
  return `${base}/relay?id=${encodeURIComponent(requestId)}`
}

export function buildPassengerRequestCardUrl(passengerRequestId) {
  const base = getFrontendUrl()
  if (!base || !passengerRequestId) return ""
  return `${base}/far/${encodeURIComponent(passengerRequestId)}`
}

export function buildEntityChatUrl({
  requestId,
  reserveId,
  passengerRequestId,
  chatId
} = {}) {
  let url = ""
  if (requestId) {
    url = buildRequestCardUrl(requestId)
  } else if (reserveId) {
    url = buildRequestCardUrl(reserveId)
  } else if (passengerRequestId) {
    url = buildPassengerRequestCardUrl(passengerRequestId)
  }
  return withChatId(url, chatId)
}

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

// Отчёт и его черновик открываются одним разделом («reports» — id вкладки в
// `/:id`, одинаковый у всех ролей) и различаются параметром запроса: выпущенный
// отчёт по reportid, черновик по reportdraftid.
export function buildSavedReportUrl(reportId) {
  const base = getFrontendUrl()
  if (!base || !reportId) return ""
  return `${base}/reports?reportid=${encodeURIComponent(reportId)}`
}

export function buildReportDraftUrl(draftId) {
  const base = getFrontendUrl()
  if (!base || !draftId) return ""
  return `${base}/reports?reportdraftid=${encodeURIComponent(draftId)}`
}

// Реестр услуг ФАП открывается страницей /far/registries по параметру
// registryid — имя параметра читает фронт (FapRegistriesPage), менять парой.
export function buildRegistryUrl(registryId) {
  const base = getFrontendUrl()
  if (!base || !registryId) return ""
  return `${base}/far/registries?registryid=${encodeURIComponent(registryId)}`
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

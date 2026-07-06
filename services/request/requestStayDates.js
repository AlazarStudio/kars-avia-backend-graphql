import { parseAsLocal } from "../report/reportUtils.js"

export function getRequestCheckInAt(request) {
  if (request?.actualCheckInAt) {
    return parseAsLocal(request.actualCheckInAt)
  }
  const hc = request?.hotelChess?.[0]
  if (hc?.start) return parseAsLocal(hc.start)
  return parseAsLocal(request.arrival)
}

export function getRequestCheckOutAt(request) {
  const hc = request?.hotelChess?.[0]
  if (hc?.end) return parseAsLocal(hc.end)
  return parseAsLocal(request.departure)
}

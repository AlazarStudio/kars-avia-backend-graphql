const HOTEL_CHESS_LOG_ACTIONS = new Set([
  "add_passenger_request_hotel",
  "remove_passenger_request_hotel",
  "add_passenger_request_hotel_person",
  "update_passenger_request_hotel_person",
  "remove_passenger_request_hotel_person",
  "relocate_passenger_request_hotel_person",
  "evict_passenger_request_hotel_person"
])

const KARS_FALLBACK_ACTIONS = new Set([
  "create_passenger_request",
  "passenger_request_dates_change"
])

export function resolveEmailActionForLog(logAction) {
  if (logAction === "create_passenger_request") {
    return "create_passenger_request"
  }
  if (HOTEL_CHESS_LOG_ACTIONS.has(logAction)) {
    return "update_hotel_chess_passenger_request"
  }
  return "update_passenger_request"
}

export function getDispatcherFallbackForPassengerEmail(emailAction) {
  if (KARS_FALLBACK_ACTIONS.has(emailAction)) {
    return "EMAIL_KARS"
  }
  return "EMAIL_RECEIVER"
}

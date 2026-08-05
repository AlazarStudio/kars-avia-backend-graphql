const HOTEL_CHESS_LOG_ACTIONS = new Set([
  "add_passenger_request_hotel",
  "remove_passenger_request_hotel",
  "add_passenger_request_hotel_person",
  "update_passenger_request_hotel_person",
  "remove_passenger_request_hotel_person",
  "relocate_passenger_request_hotel_person",
  "evict_passenger_request_hotel_person",
  // Пакетные операции размещения. Их не было в множестве, и письма о них шли
  // общим маршрутом «обновление заявки»: не тот шаблон и, что важнее, не тот
  // флаг меню при фильтрации получателей — отдел, отключивший обновления, но
  // оставивший изменение размещения, писем о переселении не получал вовсе.
  // Во фронте живут ТОЛЬКО пакетные версии, одиночные не вызываются.
  "relocate_passenger_request_hotel_people",
  "evict_passenger_request_hotel_people",
  "add_passenger_request_hotel_people"
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

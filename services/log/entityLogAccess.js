// Журналы гостиницы и авиакомпании (Hotel.logs, Airline.logs) отдаются через
// hotel/airline, которые пускают любого вошедшего. В записях — ФИО и контакты
// сотрудников, ФИО пассажиров резерва и снимки данных (oldData/newData), в том
// числе скрытые от гостиницы наценки Kars (ПДН-Е-07). Решение владельца
// 06.10.2026: журнал гостиницы — только диспетчерам, журнал авиакомпании —
// диспетчерам и пользователям CRM этой авиакомпании.

import { resolveScope } from "../passengerRequest/fapScope.js"

export const emptyLogConnection = () => ({ totalCount: 0, totalPages: 0, logs: [] })

export function canReadHotelLogs(context) {
  return resolveScope(context).kind === "all"
}

export function canReadAirlineLogs(context, airlineId) {
  const scope = resolveScope(context)
  if (scope.kind === "all") return true
  return (
    scope.kind === "airline" &&
    context?.subjectType === "USER" &&
    scope.airlineId === airlineId
  )
}

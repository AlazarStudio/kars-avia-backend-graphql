// Работа с массивом водителей внутри услуги ФАП.
//
// Паттерн повторяется в трансфере дословно пять раз. Держать его инлайном
// опасно тем, что ошибка в индексе или в нормализации правит не того водителя
// и делает это молча.

import { normalizePassengerServiceDriver } from "./normalizers.js"
import {
  recomputeServiceStatus,
  transferFactCount
} from "./serviceStatus.js"

// Применяет fn к водителю с указанным индексом, остальных прогоняет через
// нормализацию. Исходный массив не мутирует.
export function mapDriverAt(drivers, driverIndex, fn) {
  return (drivers || []).map((driver, index) => {
    const normalized = normalizePassengerServiceDriver(driver)
    if (index !== driverIndex) return normalized
    return fn(normalized)
  })
}

// Патч услуги после изменения состава пассажиров у водителей: факт услуги —
// это max(поимённый список, «перевезено N») по всем поездкам, поэтому «до» и
// «после» обязаны считаться одной и той же функцией, а статус и времена —
// общим движком. Связка повторена в трансфере четырежды; разъехавшись, она
// даёт статус, не соответствующий факту.
//
// «До» берётся из самого prev — все вхождения считают его именно так. Ветки,
// где пересчёт условный (правка «перевезено», опустевший список водителей),
// под этот хелпер не подводятся: у них другое правило статуса.
export function driversServicePatch(prev, drivers) {
  const recalc = recomputeServiceStatus(
    prev,
    transferFactCount(prev?.drivers || []),
    transferFactCount(drivers)
  )
  return { ...prev, drivers, status: recalc.status, times: recalc.times }
}

// Правила видимости заявок ФАП: кто какие заявки вправе видеть.
//
// Здесь ТОЛЬКО чистые функции: ни базы, ни process.env, ни логирования — всё это
// в fapScopeGuard.js. Разделение не косметическое: правила должны тестироваться
// без оснастки и оставаться пригодными для проверки и в запросе (фильтр), и в
// памяти (точечная проверка).
//
// Всюду белый список, а не чёрный: неизвестные тип субъекта, роль или scope
// получают отказ. Иначе новая роль молча получила бы полный доступ.

const DISPATCHER_ROLES = new Set([
  "SUPERADMIN",
  "DISPATCHERADMIN",
  "DISPATCHERMODERATOR"
])
const AIRLINE_ROLES = new Set(["AIRLINEADMIN", "AIRLINEMODERATOR"])
const HOTEL_ROLES = new Set(["HOTELADMIN", "HOTELMODERATOR"])

const denied = (reason) => ({ kind: "denied", reason })

// Описание того, что субъекту позволено видеть. Вычисляется только из контекста.
export function resolveScope(context) {
  const subjectType = context?.subjectType
  const subject = context?.subject
  if (!subjectType || !subject) return denied("no-subject")

  if (subjectType === "USER") {
    const role = subject.role
    // Диспетчеры — операторы модуля, изоляции между их отделами нет:
    // dispatcherDepartmentId используется для маршрутизации уведомлений.
    if (DISPATCHER_ROLES.has(role)) return { kind: "all" }
    if (AIRLINE_ROLES.has(role)) {
      return subject.airlineId
        ? { kind: "airline", airlineId: subject.airlineId }
        : denied("airline-role-without-airline")
    }
    if (HOTEL_ROLES.has(role)) {
      return subject.hotelId
        ? { kind: "hotel", hotelId: subject.hotelId }
        : denied("hotel-role-without-hotel")
    }
    return denied(`unknown-role:${role}`)
  }

  if (subjectType === "AIRLINE_PERSONAL") {
    return subject.airlineId
      ? { kind: "airline", airlineId: subject.airlineId }
      : denied("personal-without-airline")
  }

  if (subjectType === "EXTERNAL_USER") {
    if (subject.scope === "HOTEL") {
      return subject.hotelId
        ? { kind: "hotel", hotelId: subject.hotelId }
        : denied("hotel-external-without-hotel")
    }
    if (subject.scope === "DRIVER") {
      return subject.passengerRequestId
        ? { kind: "request", requestId: subject.passengerRequestId }
        : denied("driver-external-without-request")
    }
    if (subject.scope === "REPRESENTATIVE") {
      return subject.airlineId && subject.airportId
        ? {
            kind: "airlineAirport",
            airlineId: subject.airlineId,
            airportId: subject.airportId
          }
        : denied("representative-external-without-pair")
    }
    return denied(`unknown-scope:${subject.scope}`)
  }

  // Тип DRIVER — вход транспортного модуля; PWA водителя ФАП ходит как
  // EXTERNAL_USER со scope DRIVER. До подтверждения обратного доступа не даём.
  if (subjectType === "DRIVER") return denied("driver-subject-not-supported")

  return denied(`unknown-subject-type:${subjectType}`)
}

export const isUnrestricted = (scope) => scope.kind === "all"
export const isDenied = (scope) => scope.kind === "denied"

// Фрагмент Prisma where. null означает «ограничения нет».
// Для kind "denied" не вызывается — вызывающий обязан проверить isDenied раньше.
export function buildScopeFilter(scope) {
  switch (scope.kind) {
    case "all":
      return null
    case "airline":
      return { airlineId: scope.airlineId }
    // Гостиница лежит во ВСТРОЕННОМ массиве композитов. Форма проверена на
    // Prisma 6.19.3: позитив, негатив, работа внутри where.AND, пагинация и
    // count — всё корректно. Индекса по этому пути нет; если на объёме станет
    // медленно, лечится @@index([livingService.hotels.hotelId]).
    case "hotel":
      return { livingService: { is: { hotels: { some: { hotelId: scope.hotelId } } } } }
    case "request":
      return { id: scope.requestId }
    case "airlineAirport":
      return { airlineId: scope.airlineId, airportId: scope.airportId }
    default:
      // Отказной или неизвестный скоуп НЕ должен превращаться в «ограничения
      // нет»: вызывающий обязан отсечь его раньше через isDenied. Бросок делает
      // ошибку вызывающего громкой, вместо того чтобы тихо открыть весь список.
      throw new Error(`fapScope: фильтр для скоупа «${scope?.kind}» не строится`)
  }
}

// Та же проверка, но по уже загруженному документу.
// ⚠️ Обязана давать тот же ответ, что и buildScopeFilter на тех же данных —
// это закреплено тестом «canAccessRequest согласован с buildScopeFilter».
export function canAccessRequest(scope, request) {
  switch (scope.kind) {
    case "all":
      return true
    case "airline":
      return request?.airlineId === scope.airlineId
    case "hotel":
      return (request?.livingService?.hotels ?? []).some(
        (hotel) => hotel?.hotelId === scope.hotelId
      )
    case "request":
      return request?.id === scope.requestId
    case "airlineAirport":
      return (
        request?.airlineId === scope.airlineId &&
        request?.airportId === scope.airportId
      )
    default:
      return false
  }
}

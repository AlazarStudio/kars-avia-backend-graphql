// Применение правил видимости ФАП: флаг, лог, отказ.
//
// Правила лежат в fapScope.js и чисты. Здесь — единственное место с побочными
// эффектами, чтобы включение и выключение изоляции сводилось к одному флагу.
//
// Режим наблюдения — не отладочная мелочь, а требование выката: изоляция сегодня
// держится на клиенте, и неизвестные потоки (PWA гостиницы, водителя,
// представителя) иначе легли бы у клиента разом. Релиз 1 идёт с выключенным
// флагом и собирает лог, релиз 2 включает его.

import { GraphQLError } from "graphql"
import { logger } from "../infra/logger.js"
import {
  resolveScope,
  buildScopeFilter,
  canAccessRequest,
  isUnrestricted,
  isDenied,
  isHotelSubjectScope
} from "./fapScope.js"

// Читаем env на каждом вызове, а не на загрузке модуля: иначе флаг нельзя
// переключить в тестах и нельзя поменять без перезапуска процесса.
export const isScopeEnforced = () => process.env.FAP_SCOPE_ENFORCE === "true"

// Гостиницы под жёстким режимом всегда, остальные — по флагу (данные гостиниц
// чисты, см. isHotelSubjectScope). Флаг остаётся общим рубильником для прочих.
const isEnforcedFor = (scope) => isScopeEnforced() || isHotelSubjectScope(scope)

// В записи только идентификаторы и вердикт. Персональных данных быть не должно:
// лог собирается на боевом и живёт в файлах.
const writeDenial = (sink, payload) => {
  const line = `FAP_SCOPE ${JSON.stringify(payload)}`
  if (sink) sink(line)
  else logger.warn(line)
}

const describe = (context, scope) => ({
  subjectType: context?.subjectType ?? null,
  subjectId: context?.subject?.id ?? null,
  externalScope: context?.subject?.scope ?? null,
  scopeKind: scope.kind,
  scopeReason: scope.reason ?? null,
  operation: context?.fapOperation ?? null,
  enforced: isEnforcedFor(scope)
})

// Точечная проверка по загруженному документу.
// Возвращает { allowed, wouldDeny }: в режиме наблюдения allowed всегда true,
// но wouldDeny показывает, что случилось бы при включённом флаге.
export function evaluateRequestAccess(context, request, { sink } = {}) {
  const scope = resolveScope(context)
  if (canAccessRequest(scope, request)) return { allowed: true, wouldDeny: false }

  writeDenial(sink, {
    ...describe(context, scope),
    requestId: request?.id ?? null,
    requestAirlineId: request?.airlineId ?? null
  })

  return { allowed: !isEnforcedFor(scope), wouldDeny: true }
}

export function assertCanAccessRequest(context, request, options) {
  const { allowed } = evaluateRequestAccess(context, request, options)
  if (allowed) return
  // FORBIDDEN, а НЕ UNAUTHENTICATED: фронтовый authErrorLink считает второй
  // восстановимым, потратит попытку refresh и уведёт пользователя на логин —
  // то есть выкинет со страницы вместо внятного отказа.
  throw new GraphQLError("Forbidden", {
    extensions: { code: "FORBIDDEN", http: { status: 403 } }
  })
}

// Скоуп для списка.
// Возвращает { filter, denyAll }: filter подмешивается в where.AND,
// denyAll означает «вернуть пустой список, не ходя в базу».
//
// ⚠️ Для списка логируем ФАКТ, а не строки: узнать, какие строки скрылись бы,
// можно только выполнив запрос второй раз с фильтром — лишнее обращение в базу
// на каждый вызов. Цель наблюдения — поймать неизвестные сочетания
// «субъект + операция», а не пересчитать строки.
export function scopeFilterForQuery(context, { sink } = {}) {
  const scope = resolveScope(context)
  if (isUnrestricted(scope)) return { filter: null, denyAll: false }

  writeDenial(sink, { ...describe(context, scope), requestId: null, requestAirlineId: null })

  if (!isEnforcedFor(scope)) return { filter: null, denyAll: false }
  // isDenied проверяется ДО buildScopeFilter: тот на отказном скоупе бросает,
  // и это правильно — «ограничения нет» здесь было бы открытием всего списка.
  if (isDenied(scope)) return { filter: null, denyAll: true }
  return { filter: buildScopeFilter(scope), denyAll: false }
}

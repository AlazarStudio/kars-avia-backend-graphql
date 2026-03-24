import { getOperationAST, Kind } from "graphql"

/** Подписки, для которых по WebSocket не требуется JWT (пустой контекст). */
const JWT_FREE_SUBSCRIPTION_ROOT_FIELDS = new Set([
  "passengerRequestCreated",
  "passengerRequestUpdated"
])

/**
 * true, если документ — subscription и все корневые поля из allowlist.
 * Любые фрагменты / не-Field в корне — false (нужна обычная авторизация).
 */
export function isJwtFreeWsSubscription(execArgs) {
  const op = getOperationAST(
    execArgs.document,
    execArgs.operationName ?? undefined
  )
  if (!op || op.operation !== "subscription") return false
  const fields = []
  for (const sel of op.selectionSet.selections) {
    if (sel.kind !== Kind.FIELD) return false
    fields.push(sel.name.value)
  }
  return (
    fields.length > 0 &&
    fields.every((name) => JWT_FREE_SUBSCRIPTION_ROOT_FIELDS.has(name))
  )
}

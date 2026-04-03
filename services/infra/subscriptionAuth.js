import { logger } from "./logger.js"

/**
 * Выполняет allMiddleware для WS-подписки; при ошибке логирует и возвращает false
 * (раньше ошибки глушились и выглядели как «подписка не шлёт события»).
 */
export async function subscriptionAuthMiddleware(allMiddleware, context, label) {
  try {
    await allMiddleware(context)
    return true
  } catch (e) {
    logger.warn(
      `[SUBSCRIPTION_AUTH] ${label} message=${e?.message} code=${e?.code} name=${e?.name}`
    )
    return false
  }
}

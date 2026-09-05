// Серверный сторож правки завершённых/отменённых заявок ФАП.
//
// До сих пор правило «завершённую заявку правит только тот, у кого есть
// reserveUpdateCompleted» жило ТОЛЬКО на фронте (fapEditAccess.js), и
// docs/FAP.md прямо признавал: прямой мутацией завершённую заявку править
// можно. Кнопку фронт прятал, но запрос к ручке приходит и мимо неё — старой
// вкладкой, ссылкой, скриптом. Правило обязано стоять там, где исполняется.
//
// Зеркалит фронтовое fapEditAccess.js:
//   - CANCELLED заперта ВСЕГДА, право не помогает (как isRequestEditLocked);
//   - COMPLETED заперта без ключа reserveUpdateCompleted;
//   - SUPERADMIN проходит мимо ключа (как canAccessMenu во всей системе);
//   - живые статусы (CREATED/ACCEPTED/IN_PROGRESS) не трогаются.
//
// КОГО СТОРОЖ НЕ ТРОГАЕТ (осознанно, v1):
//   - внешних субъектов (гостиница по magic-link, водитель): их жизненный
//     цикл — отчёты и факты выселения — продолжается ПОСЛЕ завершения заявки,
//     и фронтовое правило для них отдельное (isExternalUser заперт всегда,
//     но их мутации и так ограничены своим скоупом через fapScopeGuard);
//   - мутации отчёта гостиницы (report.resolver): отчёт сдаётся и
//     согласуется после COMPLETED — это штатный цикл, а не правка заявки.

import { GraphQLError } from "graphql"
import { prisma } from "../../prisma.js"
import { loadEffectiveAccessMenuForUser } from "../access/loadEffectiveAccessMenuForUser.js"

const forbidden = (message) =>
  new GraphQLError(message, {
    // FORBIDDEN, а не UNAUTHENTICATED — иначе authErrorLink фронта потратит
    // попытку refresh и уведёт пользователя на логин (см. fapScopeGuard).
    extensions: { code: "FORBIDDEN", http: { status: 403 } }
  })

/**
 * Чистый вердикт — тестируется без базы, как фронтовый fapEditAccess.
 * @returns "ok" | "cancelled" | "needs-permission"
 */
export function editLockVerdict({ status, role, hasCompletedKey }) {
  if (status === "CANCELLED") return "cancelled"
  if (status !== "COMPLETED") return "ok"
  if (role === "SUPERADMIN") return "ok"
  return hasCompletedKey ? "ok" : "needs-permission"
}

/**
 * Бросает FORBIDDEN, если субъект-СОТРУДНИК правит завершённую заявку без
 * права reserveUpdateCompleted (или любую отменённую).
 *
 * Пользователь перечитывается из базы: context.user собирается authContext-ом
 * точечно и НЕ несёт positionId/accessMenu — передай его в
 * loadEffectiveAccessMenuForUser напрямую, и слои Position/User молча
 * потеряются (право, выданное должностью, перестало бы действовать).
 */
export async function assertRequestEditable(context, request) {
  // Не сотрудник (гостиница по ссылке, водитель, пассажир) — см. шапку.
  if (context?.subjectType !== "USER") return
  const actor = context?.user || context?.subject
  if (!actor?.id) return

  const status = request?.status
  const quick = editLockVerdict({ status, role: actor.role, hasCompletedKey: false })
  if (quick === "ok") return
  if (quick === "cancelled") {
    throw forbidden("Заявка отменена — правка недоступна")
  }

  const dbUser = await prisma.user.findUnique({ where: { id: actor.id } })
  const menu = dbUser ? await loadEffectiveAccessMenuForUser(prisma, dbUser) : null
  const verdict = editLockVerdict({
    status,
    role: actor.role,
    hasCompletedKey: menu?.reserveUpdateCompleted === true
  })
  if (verdict === "ok") return
  throw forbidden(
    "Заявка завершена — правка требует права «Правка завершённой заявки»"
  )
}

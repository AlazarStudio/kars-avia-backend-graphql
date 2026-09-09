// Серверный сторож правки АРХИВНОЙ заявки эскадрильи.
//
// Зеркалит services/passengerRequest/fapEditGuard.js, но домен и правила другие:
//   - запирается ТОЛЬКО финальный архив: status === "archived" ИЛИ archive === true;
//   - "archiving" (69-дневный карантин, services/cron/cronTasks.js) НЕ запирается;
//   - "canceled" НЕ запирается — аналога cancelled-ветки ФАП здесь нет;
//   - SUPERADMIN проходит мимо ключа (как везде в системе);
//   - ключ requestUpdateCompleted, НЕ reserveUpdateCompleted (тот про ФАП).
//
// Историческая справка: проверка архива когда-то была в Query request
// (закомментированный `if (request.archive === true)`, request.resolver.js:190),
// но она стояла на ЧТЕНИЕ и выключена. Этот сторож — на ЗАПИСЬ.

import { GraphQLError } from "graphql"
import { prisma } from "../../prisma.js"
import { loadEffectiveAccessMenuForUser } from "../access/loadEffectiveAccessMenuForUser.js"

// FORBIDDEN, а не UNAUTHENTICATED — иначе authErrorLink фронта потратит попытку
// refresh и уведёт пользователя на логин (см. fapEditGuard / fapScopeGuard).
const forbidden = () =>
  new GraphQLError(
    "Заявка в архиве — правка требует права «Правка завершённой заявки»",
    { extensions: { code: "FORBIDDEN", http: { status: 403 } } }
  )

// status — свободная строка (schema.prisma:1577), не enum: нормализуем.
const normalizeStatus = (status) =>
  typeof status === "string" ? status.trim().toLowerCase() : status

/**
 * Архивность ДВУХСИГНАЛЬНАЯ. Крон и archivingRequest пишут обе метки сразу,
 * но полагаться на одну нельзя: старые записи и ручные правки в базе могут
 * нести только archive: true. archivingAt сигналом НЕ является.
 */
export function isRequestArchived({ status, archive } = {}) {
  return archive === true || normalizeStatus(status) === "archived"
}

/** Чистый вердикт — тестируется без базы. @returns "ok" | "needs-permission" */
export function requestArchiveVerdict({ status, archive, role, hasCompletedKey }) {
  if (!isRequestArchived({ status, archive })) return "ok"
  if (role === "SUPERADMIN") return "ok"
  return hasCompletedKey === true ? "ok" : "needs-permission"
}

/**
 * Бросает FORBIDDEN, если архивную заявку правят без права requestUpdateCompleted.
 *
 * Пользователь ПЕРЕЧИТЫВАЕТСЯ из базы: context.user собирается authContext-ом
 * точечным select и НЕ несёт ни positionId, ни accessMenu — передай его в
 * loadEffectiveAccessMenuForUser напрямую, и слои Position /
 * PositionOnDepartment / User молча потеряются (право, выданное должностью,
 * перестало бы действовать).
 */
export async function assertRequestNotArchived(context, request) {
  const actor = context?.user || context?.subject
  const role = actor?.role
  const { status, archive } = request ?? {}

  // Быстрый путь: неархивная заявка или суперадмин — базу не трогаем вовсе.
  if (
    requestArchiveVerdict({ status, archive, role, hasCompletedKey: false }) === "ok"
  ) {
    return
  }

  // Архив финален, спасти может только ключ, а ключ есть только у сотрудника.
  // Расхождение с ФАП намеренное: там внешние субъекты продолжают жизненный цикл
  // после COMPLETED (сдают отчёты), здесь после архива продолжать нечего.
  if (context?.subjectType !== "USER" || !actor?.id) throw forbidden()

  const dbUser = await prisma.user.findUnique({ where: { id: actor.id } })
  const menu = dbUser ? await loadEffectiveAccessMenuForUser(prisma, dbUser) : null
  if (
    requestArchiveVerdict({
      status,
      archive,
      role,
      hasCompletedKey: menu?.requestUpdateCompleted === true
    }) === "ok"
  ) {
    return
  }
  throw forbidden()
}

/**
 * Вариант для мест, где заявка ещё не прочитана (шахматка отеля).
 * Отсутствие заявки — не дело сторожа: "not found" ловит сам резолвер.
 */
export async function assertRequestNotArchivedById(context, requestId) {
  if (!requestId) return
  const request = await prisma.request.findUnique({
    where: { id: requestId },
    select: { id: true, status: true, archive: true }
  })
  if (!request) return
  await assertRequestNotArchived(context, request)
}

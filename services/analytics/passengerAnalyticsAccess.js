import { GraphQLError } from "graphql"
import { prisma } from "../../prisma.js"
import { loadEffectiveAccessMenuForUser } from "../access/loadEffectiveAccessMenuForUser.js"

/**
 * Чистое решение: пускать ли субъекта во вкладку «Пассажиры».
 * Отказ только при ЯВНО снятом праве — см. тест «меню не настроено».
 */
export function passengerAnalyticsVerdict({ role, menu }) {
  if (role === "SUPERADMIN") return "ok"
  return menu?.analyticsPassengerMenu === false ? "forbidden" : "ok"
}

/**
 * Бросает FORBIDDEN, если у сотрудника снято право analyticsPassengerMenu.
 *
 * Пользователь перечитывается из базы: context.user собирается authContext-ом
 * точечно и НЕ несёт positionId/accessMenu — передашь его в
 * loadEffectiveAccessMenuForUser напрямую, и слои Position/User молча
 * потеряются (право, снятое должностью, перестало бы действовать).
 */
export async function assertPassengerAnalyticsAllowed(context) {
  // Не сотрудник (гостиница по ссылке, водитель, пассажир) — гостиничный скоуп
  // режется отдельной проверкой в резолвере, здесь ключей просто нет.
  if (context?.subjectType !== "USER") return
  const actor = context?.user || context?.subject
  if (!actor?.id) return

  // Роль решает без похода в базу — у суперадмина accessMenu может и не быть.
  if (actor.role === "SUPERADMIN") return

  const dbUser = await prisma.user.findUnique({ where: { id: actor.id } })
  const menu = dbUser ? await loadEffectiveAccessMenuForUser(prisma, dbUser) : null
  if (passengerAnalyticsVerdict({ role: actor.role, menu }) === "ok") return

  throw new GraphQLError("Access denied", {
    extensions: { code: "FORBIDDEN", http: { status: 403 } }
  })
}

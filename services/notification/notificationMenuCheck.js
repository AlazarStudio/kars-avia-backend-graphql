import { prisma } from "../../prisma.js"

const ACTION_TO_MENU_FIELD = {
  create_request: "requestCreate",
  extend_request: "requestDatesChange",
  update_request: "requestDatesChange",
  update_hotel_chess_request: "requestPlacementChange",
  cancel_request: "requestCancel",
  new_message: "newMessage",
  create_reserve: "reserveCreate",
  reserve_dates_change: "reserveDatesChange",
  update_reserve: "reserveUpdate",
  update_hotel_chess_reserve: "reservePlacementChange"
}

function isActionEnabledInMenu(menu, action) {
  const field = ACTION_TO_MENU_FIELD[action]
  if (!field) return true
  const value = menu?.[field]
  return value !== false
}

/**
 * Проверяет, разрешено ли пользователю получать уведомление по NotificationMenu его отдела.
 * Для диспетчеров — dispatcherDepartment, для авиакомпании — airlineDepartment.
 * Приоритет: dispatcher → airlineDepartment. Для пользователей без отдела возвращает true.
 * @param {object} subject - пользователь (id)
 * @param {string} action - тип действия (create_request, extend_request, и т.д.)
 * @returns {Promise<boolean>}
 */
export async function AllowedSiteNotification(subject, action) {
  if (!subject?.id) return true

  const user = await prisma.user.findUnique({
    where: { id: subject.id },
    select: {
      dispatcher: true,
      airlineDepartmentId: true,
      dispatcherDepartment: { select: { notificationMenu: true } },
      airlineDepartment: { select: { notificationMenu: true } }
    }
  })

  if (!user) return true

  let menu = null
  if (user.dispatcher === true) {
    menu = user.dispatcherDepartment?.notificationMenu ?? null
  } else if (user.airlineDepartmentId && user.airlineDepartment) {
    menu = user.airlineDepartment.notificationMenu
  }

  if (!menu) return true
  return Boolean(isActionEnabledInMenu(menu, action))
}

/**
 * Проверяет, нужно ли отправлять email (диспетчерам и отделам авиакомпаний).
 * Возвращает true, если хотя бы один активный отдел диспетчеров ИЛИ
 * отдел авиакомпании имеет данный тип уведомления включённым в NotificationMenu.
 * @param {string} action - тип действия (create_request, extend_request, и т.д.)
 * @returns {Promise<boolean>}
 */
export async function AllowedEmailNotification(action) {
  const field = ACTION_TO_MENU_FIELD[action]
  if (!field) return true

  const [dispatcherDepts, airlineDepts] = await Promise.all([
    prisma.dispatcherDepartment.findMany({
      where: { active: true },
      select: { notificationMenu: true }
    }),
    prisma.airlineDepartment.findMany({
      where: { active: true },
      select: { notificationMenu: true }
    })
  ])

  const hasEnabledInDispatcher =
    dispatcherDepts.length === 0 ||
    dispatcherDepts.some((dept) =>
      isActionEnabledInMenu(dept.notificationMenu, action)
    )

  const hasEnabledInAirline =
    airlineDepts.length === 0 ||
    airlineDepts.some((dept) =>
      isActionEnabledInMenu(dept.notificationMenu, action)
    )

  return Boolean(hasEnabledInDispatcher || hasEnabledInAirline)
} 

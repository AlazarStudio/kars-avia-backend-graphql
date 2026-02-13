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

export function getDisabledActionsFromMenu(menu) {
  if (!menu) return []
  return Object.entries(ACTION_TO_MENU_FIELD)
    .filter(([, field]) => menu?.[field] === false)
    .map(([action]) => action)
}

export async function getNotificationMenuForUser(subject) {
  if (!subject?.id) return null

  const user = await prisma.user.findUnique({
    where: { id: subject.id },
    select: {
      dispatcherDepartment: { select: { notificationMenu: true } },
      airlineDepartment: { select: { notificationMenu: true } }
    }
  })

  if (!user) return null

  return (
    user.dispatcherDepartment?.notificationMenu ??
    user.airlineDepartment?.notificationMenu ??
    null
  )
}

/**
 * Проверяет, разрешено ли пользователю получать уведомление по NotificationMenu его отдела.
 * У пользователя может быть только dispatcherDepartment ИЛИ airlineDepartment (взаимоисключающие).
 * @param {object} subject - пользователь (id)
 * @param {string} action - тип действия (create_request, extend_request, и т.д.)
 * @returns {Promise<boolean>} всегда true или false
 */

export async function AllowedSiteNotification(subject, action) {
  const menu = await getNotificationMenuForUser(subject)
  if (!menu) return true
  const enabled = isActionEnabledInMenu(menu, action)
  return enabled === true
}

/**
 * Проверяет, нужно ли отправлять email (диспетчерам и отделам авиакомпаний).
 * Возвращает true, если хотя бы один активный отдел диспетчеров ИЛИ
 * отдел авиакомпании имеет данный тип уведомления включённым в NotificationMenu.
 * @param {string} action - тип действия (create_request, extend_request, и т.д.)
 * @returns {Promise<boolean>}
 */

export async function AllowedEmailNotification(subject, action) {
  const menu = await getNotificationMenuForUser(subject)
  if (!menu) return true
  const enabled = isActionEnabledInMenu(menu, action)
  return enabled === true
}

import { prisma } from "../../prisma.js"

const LEGACY_ACTION_TO_MENU_FIELD = {
  create_request: "requestCreate",
  extend_request: "requestDatesChange",
  update_request: "requestDatesChange",
  update_hotel_chess_request: "requestPlacementChange",
  cancel_request: "requestCancel",
  new_message: "newMessage",
  transfer_message: "newMessage",
  create_reserve: "reserveCreate",
  reserve_dates_change: "reserveDatesChange",
  update_reserve: "reserveUpdate",
  update_hotel_chess_reserve: "reservePlacementChange",
  create_passenger_request: "passengerRequestCreate",
  passenger_request_dates_change: "passengerRequestDatesChange",
  update_passenger_request: "passengerRequestUpdate",
  update_hotel_chess_passenger_request: "passengerRequestPlacementChange",
  cancel_passenger_request: "passengerRequestCancel"
}

const EMAIL_ACTION_TO_MENU_FIELD = {
  create_request: "emailRequestCreate",
  extend_request: "emailRequestDatesChange",
  update_request: "emailRequestDatesChange",
  update_hotel_chess_request: "emailRequestPlacementChange",
  cancel_request: "emailRequestCancel",
  new_message: "emailNewMessage",
  transfer_message: "emailNewMessage",
  create_reserve: "emailReserveCreate",
  reserve_dates_change: "emailReserveDatesChange",
  update_reserve: "emailReserveUpdate",
  update_hotel_chess_reserve: "emailReservePlacementChange",
  create_passenger_request: "emailPassengerRequestCreate",
  passenger_request_dates_change: "emailPassengerRequestDatesChange",
  update_passenger_request: "emailPassengerRequestUpdate",
  update_hotel_chess_passenger_request: "emailPassengerRequestPlacementChange",
  cancel_passenger_request: "emailPassengerRequestCancel"
}

const SITE_PUSH_ACTION_TO_MENU_FIELD = {
  create_request: "sitePushRequestCreate",
  extend_request: "sitePushRequestDatesChange",
  update_request: "sitePushRequestDatesChange",
  update_hotel_chess_request: "sitePushRequestPlacementChange",
  cancel_request: "sitePushRequestCancel",
  new_message: "sitePushNewMessage",
  transfer_message: "sitePushNewMessage",
  create_reserve: "sitePushReserveCreate",
  reserve_dates_change: "sitePushReserveDatesChange",
  update_reserve: "sitePushReserveUpdate",
  update_hotel_chess_reserve: "sitePushReservePlacementChange",
  create_passenger_request: "sitePushPassengerRequestCreate",
  passenger_request_dates_change: "sitePushPassengerRequestDatesChange",
  update_passenger_request: "sitePushPassengerRequestUpdate",
  update_hotel_chess_passenger_request: "sitePushPassengerRequestPlacementChange",
  cancel_passenger_request: "sitePushPassengerRequestCancel"
}

function getActionFieldMap(channel) {
  if (channel === "email") return EMAIL_ACTION_TO_MENU_FIELD
  return SITE_PUSH_ACTION_TO_MENU_FIELD
}

function isActionEnabledInMenu(menu, action, channel) {
  const legacyField = LEGACY_ACTION_TO_MENU_FIELD[action]
  const legacyValue = menu?.[legacyField]
  if (legacyValue === false) return false

  const channelFieldMap = getActionFieldMap(channel)
  const field = channelFieldMap[action]
  if (!field) return true

  const channelValue = menu?.[field]
  if (typeof channelValue === "boolean") return channelValue

  return true
}

export function getDisabledActionsFromMenu(menu) {
  if (!menu) return []
  return Object.keys(SITE_PUSH_ACTION_TO_MENU_FIELD)
    .filter((action) => isActionEnabledInMenu(menu, action, "sitePush") === false)
    .map((action) => action)
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
  const enabled = isActionEnabledInMenu(menu, action, "sitePush")
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
  const enabled = isActionEnabledInMenu(menu, action, "email")
  return enabled === true
}

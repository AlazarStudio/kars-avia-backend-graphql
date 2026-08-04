// Сайтовые уведомления ФАП и определение смены даты рейса.
// Вынесено из резолвера как есть.

import { prisma } from "../../prisma.js"
import { pubsub, NOTIFICATION } from "../infra/pubsub.js"
import { shouldSendNotification } from "../notification/notificationRateGuard.js"

export function flightDateTimeMs(value) {
  if (value == null) return null
  const t = new Date(value).getTime()
  return Number.isNaN(t) ? null : t
}

export function passengerRequestFlightDateChanged(existingDate, nextDate) {
  if (nextDate === undefined) return false
  return flightDateTimeMs(existingDate) !== flightDateTimeMs(nextDate)
}

export async function notifyPassengerRequestSite({
  action,
  passengerRequestId,
  airlineId,
  hotelId,
  descriptionHtml,
  __typename
}) {
  if (!airlineId || !passengerRequestId) return

  const allowed = shouldSendNotification({
    channel: "site",
    action,
    entityType: "passenger_request",
    entityId: passengerRequestId
  }).allowed

  if (!allowed) return

  const airline = await prisma.airline.findUnique({ where: { id: airlineId } })

  await prisma.notification.create({
    data: {
      passengerRequest: { connect: { id: passengerRequestId } },
      airline: { connect: { id: airlineId } },
      ...(hotelId && { hotel: { connect: { id: hotelId } } }),
      description: {
        action,
        description: descriptionHtml
      }
    }
  })

  pubsub.publish(NOTIFICATION, {
    notification: {
      __typename,
      action,
      airlineId,
      passengerRequestId,
      ...(hotelId && { hotelId }),
      airline: airline || null
    }
  })
}

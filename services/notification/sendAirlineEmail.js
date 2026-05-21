import { getUniqueAirlineEmailRecipients } from "./notificationMenuCheck.js"
import { deliverDepartmentEmails } from "./departmentEmailDelivery.js"

export async function deliverAirlineDepartmentEmails({
  airlineId,
  action,
  subject,
  html,
  entityType,
  entityId,
  fallbackTo = "EMAIL_AVIA",
  airlineDepartmentId = null
}) {
  if (!airlineId) {
    console.warn(
      `[deliverAirlineDepartmentEmails] airlineId missing for action ${action}`
    )
    return
  }

  const scoped = Boolean(airlineDepartmentId)
  const recipients = await getUniqueAirlineEmailRecipients(action, airlineId, {
    departmentId: airlineDepartmentId ?? undefined
  })

  await deliverDepartmentEmails({
    recipients,
    action,
    subject,
    html,
    entityType,
    entityId,
    fallbackTo,
    skipEnvFallback: scoped
  })
}

export async function sendAirlineEmail({
  actor,
  airlineId,
  action,
  subject,
  html,
  entityType,
  entityId,
  fallbackTo = "EMAIL_AVIA",
  airlineDepartmentId = null
}) {
  if (actor?.dispatcher !== true) return

  await deliverAirlineDepartmentEmails({
    airlineId,
    action,
    subject,
    html,
    entityType,
    entityId,
    fallbackTo,
    airlineDepartmentId
  })
}

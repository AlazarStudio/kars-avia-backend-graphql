import { getUniqueAirlineEmailRecipients } from "./notificationMenuCheck.js"
import { deliverDepartmentEmails } from "./departmentEmailDelivery.js"

export async function deliverAirlineDepartmentEmails({
  airlineId,
  action,
  subject,
  html,
  entityType,
  entityId,
  fallbackTo = "EMAIL_AVIA"
}) {
  if (!airlineId) {
    console.warn(
      `[deliverAirlineDepartmentEmails] airlineId missing for action ${action}`
    )
    return
  }

  const recipients = await getUniqueAirlineEmailRecipients(action, airlineId)

  await deliverDepartmentEmails({
    recipients,
    action,
    subject,
    html,
    entityType,
    entityId,
    fallbackTo
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
  fallbackTo = "EMAIL_AVIA"
}) {
  if (actor?.dispatcher !== true) return

  await deliverAirlineDepartmentEmails({
    airlineId,
    action,
    subject,
    html,
    entityType,
    entityId,
    fallbackTo
  })
}

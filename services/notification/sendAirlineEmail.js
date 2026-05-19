import { getUniqueAirlineEmailRecipients } from "./notificationMenuCheck.js"
import { deliverDepartmentEmails } from "./departmentEmailDelivery.js"

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

  if (!airlineId) {
    console.warn(`[sendAirlineEmail] airlineId missing for action ${action}`)
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

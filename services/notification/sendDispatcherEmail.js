import { getUniqueDispatcherEmailRecipients } from "./notificationMenuCheck.js"
import { deliverDepartmentEmails } from "./departmentEmailDelivery.js"

export async function sendDispatcherEmail({
  actor,
  action,
  subject,
  html,
  entityType,
  entityId,
  fallbackTo
}) {
  if (actor?.dispatcher === true) return

  const recipients = await getUniqueDispatcherEmailRecipients(action)

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

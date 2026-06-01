import { deliverAirlineDepartmentEmails } from "./sendAirlineEmail.js"
import {
  deliverDepartmentEmails,
  resolveEnvEmail
} from "./departmentEmailDelivery.js"
import {
  getUniqueAirlineEmailRecipients,
  getUniqueDispatcherEmailRecipients,
  normalizeEmail
} from "./notificationMenuCheck.js"
import { resolveCreatorAirlineDepartment } from "./resolveCreatorAirlineDepartment.js"

function mergeEmailRecipients(lists) {
  const seen = new Set()
  const recipients = []

  for (const list of lists) {
    for (const recipient of list || []) {
      const normalized = normalizeEmail(recipient.email)
      if (!normalized || seen.has(normalized)) continue
      seen.add(normalized)
      recipients.push({
        departmentId: recipient.departmentId,
        email: recipient.email.trim()
      })
    }
  }

  return recipients
}

function appendEnvFallbackRecipients(recipients, seen, fallbackTo) {
  const to = resolveEnvEmail(fallbackTo)
  const normalized = normalizeEmail(to)
  if (!normalized || seen.has(normalized)) return

  seen.add(normalized)
  recipients.push({
    departmentId: fallbackTo,
    email: to.trim()
  })
}

export async function sendRequestPartyEmail({
  actor,
  airlineId,
  action,
  subject,
  html,
  entityType,
  entityId,
  dispatcherFallbackTo,
  alsoNotifyAirline = false
}) {
  let airlineDepartmentId = null
  if (
    entityId &&
    (entityType === "request" ||
      entityType === "reserve" ||
      entityType === "passenger_request")
  ) {
    airlineDepartmentId = await resolveCreatorAirlineDepartment(
      entityType,
      entityId
    )
  }

  if (actor?.dispatcher === true) {
    await deliverAirlineDepartmentEmails({
      airlineId,
      action,
      subject,
      html,
      entityType,
      entityId,
      fallbackTo: "EMAIL_AVIA",
      airlineDepartmentId
    })
    return
  }

  const lists = [await getUniqueDispatcherEmailRecipients(action)]

  if (alsoNotifyAirline && airlineId) {
    lists.push(
      await getUniqueAirlineEmailRecipients(action, airlineId, {
        departmentId: airlineDepartmentId ?? undefined
      })
    )
  }

  const seen = new Set()
  const recipients = mergeEmailRecipients(lists)
  for (const r of recipients) {
    seen.add(normalizeEmail(r.email))
  }

  if (recipients.length === 0) {
    appendEnvFallbackRecipients(recipients, seen, dispatcherFallbackTo)
    if (alsoNotifyAirline && airlineId && !airlineDepartmentId) {
      appendEnvFallbackRecipients(recipients, seen, "EMAIL_AVIA")
    }
  }

  await deliverDepartmentEmails({
    recipients,
    action,
    subject,
    html,
    entityType,
    entityId,
    fallbackTo: dispatcherFallbackTo,
    skipEnvFallback: recipients.length > 0
  })
}

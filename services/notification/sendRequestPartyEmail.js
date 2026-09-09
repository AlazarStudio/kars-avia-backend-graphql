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
import { createPerfTimer } from "../infra/perfTimer.js"

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
  const perf = createPerfTimer(`email:${action}`)
  perf.step("start", {
    entityType,
    entityId,
    airlineId,
    actorDispatcher: actor?.dispatcher === true,
    dispatcherFallbackTo,
    alsoNotifyAirline
  })

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
  perf.step("creator-department", { airlineDepartmentId })

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
    perf.done({ branch: "airline-departments" })
    return
  }

  const lists = [await getUniqueDispatcherEmailRecipients(action)]
  perf.step("dispatcher-recipients", { count: lists[0].length })

  if (alsoNotifyAirline && airlineId) {
    lists.push(
      await getUniqueAirlineEmailRecipients(action, airlineId, {
        departmentId: airlineDepartmentId ?? undefined
      })
    )
    perf.step("airline-recipients", { count: lists[1].length })
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
    perf.step("env-fallback", {
      fallbackTo: dispatcherFallbackTo,
      resolved: recipients.map((r) => r.email)
    })
  }

  perf.step("recipients", {
    count: recipients.length,
    emails: recipients.map((r) => r.email)
  })

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

  perf.done({ branch: "dispatcher-departments", recipients: recipients.length })
}

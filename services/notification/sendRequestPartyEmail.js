import {
  sendAirlineEmail,
  deliverAirlineDepartmentEmails
} from "./sendAirlineEmail.js"
import { sendDispatcherEmail } from "./sendDispatcherEmail.js"
import { resolveCreatorAirlineDepartment } from "./resolveCreatorAirlineDepartment.js"

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
    (entityType === "request" || entityType === "reserve")
  ) {
    airlineDepartmentId = await resolveCreatorAirlineDepartment(
      entityType,
      entityId
    )
  }

  if (actor?.dispatcher === true) {
    await sendAirlineEmail({
      actor,
      airlineId,
      action,
      subject,
      html,
      entityType,
      entityId,
      airlineDepartmentId
    })
  } else {
    await sendDispatcherEmail({
      actor,
      action,
      subject,
      html,
      entityType,
      entityId,
      fallbackTo: dispatcherFallbackTo
    })
  }

  if (alsoNotifyAirline && airlineId) {
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
  }
}

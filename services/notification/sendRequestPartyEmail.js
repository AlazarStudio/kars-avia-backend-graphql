import {
  sendAirlineEmail,
  deliverAirlineDepartmentEmails
} from "./sendAirlineEmail.js"
import { sendDispatcherEmail } from "./sendDispatcherEmail.js"

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
  if (actor?.dispatcher === true) {
    await sendAirlineEmail({
      actor,
      airlineId,
      action,
      subject,
      html,
      entityType,
      entityId
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
      fallbackTo: "EMAIL_AVIA"
    })
  }
}

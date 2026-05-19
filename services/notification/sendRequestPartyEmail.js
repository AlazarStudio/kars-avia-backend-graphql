import { sendDispatcherEmail } from "./sendDispatcherEmail.js"
import { sendAirlineEmail } from "./sendAirlineEmail.js"

export async function sendRequestPartyEmail({
  actor,
  airlineId,
  action,
  subject,
  html,
  entityType,
  entityId,
  dispatcherFallbackTo
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
}

import { prisma } from "../../prisma.js"
import { pubsub, NOTIFICATION } from "../infra/pubsub.js"
import { shouldSendNotification } from "../notification/notificationRateGuard.js"

export async function notifyAirlineReportSubmitted(draft) {
  if (!draft?.airlineId || !draft?.id) return

  const allowed = shouldSendNotification({
    channel: "site",
    action: "submit_airline_report_draft",
    entityType: "report_draft",
    entityId: draft.id
  }).allowed
  if (!allowed) return

  const airline = await prisma.airline.findUnique({
    where: { id: draft.airlineId }
  })
  const airlineName = airline?.name || "авиакомпании"

  await prisma.notification.create({
    data: {
      airline: { connect: { id: draft.airlineId } },
      description: {
        action: "submit_airline_report_draft",
        description: `Отчёт для авиакомпании <span style='color:#545873'>${airlineName}</span> отправлен на подтверждение`
      }
    }
  })

  pubsub.publish(NOTIFICATION, {
    notification: {
      __typename: "ReportSubmittedNotification",
      action: "submit_airline_report_draft",
      draftId: draft.id,
      airlineId: draft.airlineId,
      airline: airline || null
    }
  })
}

// Решение по отчёту эскадрильи: согласован авиакомпанией или возвращён ею на
// доработку. Два канала, как у отправки отчёта (notifyReportSubmit.js) плюс
// почта — отзыв возвращает отчёт в работу, и вторая сторона узнаёт о нём только
// из письма.

import { prisma } from "../../prisma.js"
import { pubsub, NOTIFICATION } from "../infra/pubsub.js"
import { shouldSendNotification } from "../notification/notificationRateGuard.js"
import { sendRequestPartyEmail } from "../notification/sendRequestPartyEmail.js"
import {
  buildAirlineReportDraftConfirmedEmail,
  buildAirlineReportDraftRejectedEmail,
  formatReportPeriod
} from "../email/reportDraftEmailTemplates.js"

const ACTIONS = {
  confirm: "confirm_airline_report_draft",
  reject: "reject_airline_report_draft"
}

async function notifySite({ draft, action, descriptionHtml }) {
  const allowed = shouldSendNotification({
    channel: "site",
    action,
    entityType: "report_draft",
    entityId: draft.id
  }).allowed
  if (!allowed) return null

  const airline =
    draft.airline ??
    (await prisma.airline.findUnique({ where: { id: draft.airlineId } }))

  await prisma.notification.create({
    data: {
      airline: { connect: { id: draft.airlineId } },
      description: { action, description: descriptionHtml }
    }
  })

  pubsub.publish(NOTIFICATION, {
    notification: {
      __typename: "ReportSubmittedNotification",
      action,
      draftId: draft.id,
      airlineId: draft.airlineId,
      airline: airline || null
    }
  })

  return airline
}

// Общий хвост обоих решений: сайтовое уведомление, затем письмо. Оба канала
// обёрнуты — побочка не должна ронять уже записанное решение.
async function notifyDecision({ draft, actor, kind, comment }) {
  if (!draft?.id || !draft?.airlineId) return

  const action = ACTIONS[kind]
  const period = formatReportPeriod(draft)
  const confirmed = kind === "confirm"
  const descriptionHtml = confirmed
    ? `Отчёт за <span style='color:#545873'>${period}</span> согласован авиакомпанией`
    : `Отчёт за <span style='color:#545873'>${period}</span> возвращён авиакомпанией на доработку`

  let airline = null
  try {
    airline = await notifySite({ draft, action, descriptionHtml })
  } catch (error) {
    console.error("Ошибка сайтового уведомления по отчёту:", error)
  }

  try {
    const build = confirmed
      ? buildAirlineReportDraftConfirmedEmail
      : buildAirlineReportDraftRejectedEmail
    const { subject, html } = build({
      airlineName: airline?.name ?? draft.airline?.name,
      startDate: draft.startDate,
      endDate: draft.endDate,
      comment,
      draftId: draft.id,
      savedReportId: draft.savedReportId
    })

    // Направление письма выбирает sendRequestPartyEmail по актору: решение
    // авиакомпании уходит диспетчерским отделам, решение диспетчера (confirm он
    // тоже вправе нажать) — отделам авиакомпании.
    await sendRequestPartyEmail({
      actor,
      airlineId: draft.airlineId,
      action,
      subject,
      html,
      entityType: "report_draft",
      entityId: draft.id,
      dispatcherFallbackTo: "EMAIL_RECEIVER"
    })
  } catch (error) {
    console.error("Ошибка отправки email по отчёту:", error)
  }
}

export function notifyAirlineReportConfirmed({ draft, actor, comment = null }) {
  return notifyDecision({ draft, actor, kind: "confirm", comment })
}

export function notifyAirlineReportRejected({ draft, actor, comment }) {
  return notifyDecision({ draft, actor, kind: "reject", comment })
}

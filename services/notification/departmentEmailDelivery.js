import { sendEmail } from "../sendMail.js"
import { shouldSendNotification } from "./notificationRateGuard.js"

export function resolveEnvEmail(fallbackTo) {
  if (fallbackTo === "EMAIL_RECEIVER") {
    return process.env.EMAIL_RECEIVER || process.env.EMAIL_RESIEVER
  }
  return process.env[fallbackTo]
}

export async function deliverDepartmentEmails({
  recipients,
  action,
  subject,
  html,
  entityType,
  entityId,
  fallbackTo
}) {
  if (!recipients?.length) {
    const to = resolveEnvEmail(fallbackTo)
    const { allowed } = shouldSendNotification({
      channel: "email",
      action,
      entityType,
      entityId,
      recipientId: to ?? fallbackTo
    })
    if (allowed) {
      await sendEmail({ to, subject, html })
    }
    return
  }

  for (const recipient of recipients) {
    const { allowed } = shouldSendNotification({
      channel: "email",
      action,
      entityType,
      entityId,
      recipientId: recipient.departmentId
    })
    if (allowed) {
      await sendEmail({ to: recipient.email, subject, html })
    }
  }
}

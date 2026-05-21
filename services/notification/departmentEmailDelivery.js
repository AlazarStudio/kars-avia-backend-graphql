import { sendEmail } from "../sendMail.js"
import { normalizeEmail } from "./notificationMenuCheck.js"
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
  fallbackTo,
  skipEnvFallback = false
}) {
  if (!recipients?.length) {
    if (skipEnvFallback) return

    const to = resolveEnvEmail(fallbackTo)
    const { allowed } = shouldSendNotification({
      channel: "email",
      action,
      entityType,
      entityId,
      recipientId: normalizeEmail(to) || to || fallbackTo
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
      recipientId:
        normalizeEmail(recipient.email) ||
        recipient.departmentId ||
        recipient.email
    })
    if (allowed) {
      await sendEmail({ to: recipient.email, subject, html })
    }
  }
}

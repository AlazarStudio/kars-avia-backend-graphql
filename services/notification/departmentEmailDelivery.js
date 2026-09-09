import { sendEmail } from "../sendMail.js"
import { normalizeEmail } from "./notificationMenuCheck.js"
import { shouldSendNotification } from "./notificationRateGuard.js"
import { createPerfTimer } from "../infra/perfTimer.js"

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
  const perf = createPerfTimer(`deliver:${action}`)

  if (!recipients?.length) {
    if (skipEnvFallback) {
      perf.done({ attempted: 0, reason: "no_recipients_env_fallback_skipped" })
      return
    }

    const to = resolveEnvEmail(fallbackTo)
    const { allowed, retryAfterMs } = shouldSendNotification({
      channel: "email",
      action,
      entityType,
      entityId,
      recipientId: normalizeEmail(to) || to || fallbackTo
    })
    perf.step("env-fallback", {
      fallbackTo,
      to: to ?? null,
      allowed,
      retryAfterMs
    })
    if (allowed) {
      await sendEmail({ to, subject, html })
    }
    perf.done({ attempted: allowed ? 1 : 0 })
    return
  }

  const blockedByRateGuard = []
  const allowedRecipients = recipients.filter((recipient) => {
    const { allowed, retryAfterMs } = shouldSendNotification({
      channel: "email",
      action,
      entityType,
      entityId,
      recipientId:
        normalizeEmail(recipient.email) ||
        recipient.departmentId ||
        recipient.email
    })
    if (!allowed) {
      blockedByRateGuard.push({ email: recipient.email, retryAfterMs })
    }
    return allowed
  })
  perf.step("rate-guard", {
    total: recipients.length,
    allowed: allowedRecipients.length,
    blocked: blockedByRateGuard
  })

  await Promise.all(
    allowedRecipients.map((recipient) =>
      sendEmail({ to: recipient.email, subject, html })
    )
  )

  perf.done({ attempted: allowedRecipients.length })
}

import { getSupportEmail } from "../auth/appConfig.js"
import { buildSupportClientMessageEmail } from "../email/supportEmailTemplates.js"
import { sendEmail } from "../sendMail.js"
import { normalizeEmail } from "./notificationMenuCheck.js"
import { shouldSendNotification } from "./notificationRateGuard.js"

export async function sendSupportClientMessageEmail({
  chatId,
  sender,
  text,
  ticketNumber
}) {
  const to = getSupportEmail()
  if (!to) {
    console.warn(
      "[EMAIL SKIP] SUPPORT_EMAIL и EMAIL_RECEIVER не заданы — письмо техподдержки не отправлено"
    )
    return
  }

  const { allowed } = shouldSendNotification({
    channel: "email",
    action: "support_message",
    entityType: "support_chat",
    entityId: chatId,
    recipientId: normalizeEmail(to) || to
  })

  if (!allowed) return

  const { subject, html } = buildSupportClientMessageEmail({
    senderName: sender?.name,
    senderRole: sender?.role,
    textPreview: text,
    chatId,
    ticketNumber
  })

  await sendEmail({ to, subject, html })
}

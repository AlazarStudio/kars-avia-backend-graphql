import { sendEmail } from "../sendMail.js"
import { getFrontendUrl } from "../auth/appConfig.js"
import {
  buildAccountCreatedByAdminEmail,
  buildPasswordChangedEmail,
  buildPasswordResetEmail,
  buildRegistrationVerifyEmail
} from "./authEmailTemplates.js"

export async function sendRegistrationVerifyEmail({ to, name, rawToken }) {
  const base = getFrontendUrl()
  if (!base) {
    console.warn("[AUTH EMAIL] FRONTEND_URL не задан — письмо подтверждения не отправлено")
    return
  }
  const verifyLink = `${base}/verify-email?token=${encodeURIComponent(rawToken)}`
  const { subject, html } = buildRegistrationVerifyEmail({ name, verifyLink })
  await sendEmail({ to, subject, html })
}

export async function sendPasswordResetEmail({ to, email, rawToken }) {
  const base = getFrontendUrl()
  if (!base) {
    console.warn("[AUTH EMAIL] FRONTEND_URL не задан — письмо сброса пароля не отправлено")
    return
  }
  const resetLink = `${base}/reset-password?token=${encodeURIComponent(rawToken)}`
  const { subject, html } = buildPasswordResetEmail({ email, resetLink })
  await sendEmail({ to, subject, html })
}

export async function sendPasswordChangedNotificationEmail(to) {
  const { subject, html } = buildPasswordChangedEmail()
  await sendEmail({ to, subject, html })
}

export async function sendAccountCreatedByAdminEmail({ to, name, login }) {
  const { subject, html } = buildAccountCreatedByAdminEmail({ name, login })
  await sendEmail({ to, subject, html })
}

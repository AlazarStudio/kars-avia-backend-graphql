import nodemailer from "nodemailer"
import { logger } from "./infra/logger.js"

const MISSING_RECIPIENT = "не задан"

function isMissingRecipient(to) {
  const trimmed = String(to ?? "").trim()
  return !trimmed || trimmed === "undefined" || trimmed === "null"
}

export function resolveEmailDelivery({ to, subject }) {
  const enabled = process.env.EMAIL_ENABLED === "true"

  // В dev вся почта уходит на EMAIL_RECEIVER — включая случай, когда получатель
  // не разрешился (нет отделов и не задана env-переменная фолбэка).
  if (enabled && process.env.NODE_ENV === "dev") {
    const devReceiver = String(
      process.env.EMAIL_RECEIVER || process.env.EMAIL_RESIEVER || ""
    ).trim()

    if (!devReceiver) {
      return { skip: true, reason: "missing_receiver", to, subject }
    }

    const redirectedFrom = isMissingRecipient(to) ? MISSING_RECIPIENT : to
    return {
      skip: false,
      actualTo: devReceiver,
      actualSubject: `[DEV → ${redirectedFrom}] ${subject}`,
      redirectedFrom
    }
  }

  if (isMissingRecipient(to)) {
    return { skip: true, reason: "missing_recipient", to, subject }
  }

  if (!enabled) {
    return { skip: true, reason: "test_mode", to, subject }
  }

  return { skip: false, actualTo: to, actualSubject: subject }
}

export async function sendEmail({ to, subject, html }) {
  const delivery = resolveEmailDelivery({ to, subject })

  if (delivery.skip) {
    if (delivery.reason === "test_mode") {
      logger.info(
        `[TEST MODE] Письмо не отправлено. Кому: ${to}, Тема: ${subject}`
      )
    } else if (delivery.reason === "missing_receiver") {
      logger.warn(
        `[EMAIL SKIP] NODE_ENV=dev, EMAIL_ENABLED=true, но EMAIL_RECEIVER не задан. Тема: ${subject}`
      )
    } else if (delivery.reason === "missing_recipient") {
      logger.warn(`[EMAIL SKIP] Получатель не задан, тема: ${subject}`)
    }
    return
  }

  const { actualTo, actualSubject } = delivery

  if (delivery.redirectedFrom) {
    logger.info(
      `[DEV EMAIL] Перенаправление: ${delivery.redirectedFrom} → ${actualTo}`
    )
  }

  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.beget.com",
      port: 465,
      secure: true,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
      }
    })

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: actualTo,
      subject: actualSubject,
      html
    })

    logger.info(
      `[EMAIL SENT] Письмо отправлено. Кому: ${actualTo}, Тема: ${actualSubject}`
    )
  } catch (error) {
    logger.error(
      `[EMAIL ERROR] Ошибка при отправке письма. Кому: ${actualTo}, Тема: ${actualSubject}`,
      error
    )
    throw error
  }
}

/*

import { sendEmail } from "../utils/sendEmail.js";

await sendEmail({
  to: user.email,
  subject: "Подтверждение",
  html: "<b>Ваш код: 1234</b>"
});

*/

/*

import { sendEmail } from "../utils/sendEmail.js";

await sendEmail({
  to: user.email,
  subject: "Подтверждение",
  html: "<b>Ваш код: 1234</b>"
});

*/

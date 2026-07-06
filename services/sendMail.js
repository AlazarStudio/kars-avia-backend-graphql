import nodemailer from "nodemailer"

export function resolveEmailDelivery({ to, subject }) {
  if (process.env.EMAIL_ENABLED !== "true") {
    return { skip: true, reason: "test_mode", to, subject }
  }

  let actualTo = to
  let actualSubject = subject

  if (process.env.NODE_ENV === "dev") {
    const devReceiver = String(
      process.env.EMAIL_RECEIVER || process.env.EMAIL_RESIEVER || ""
    ).trim()

    if (!devReceiver) {
      return { skip: true, reason: "missing_receiver", to, subject }
    }

    actualTo = devReceiver
    actualSubject = `[DEV → ${to}] ${subject}`
    return { skip: false, actualTo, actualSubject, redirectedFrom: to }
  }

  return { skip: false, actualTo, actualSubject }
}

export async function sendEmail({ to, subject, html }) {
  if (!to || to === "undefined" || to === "null") {
    console.warn(`[EMAIL SKIP] Получатель не задан, тема: ${subject}`)
    return
  }

  const delivery = resolveEmailDelivery({ to, subject })

  if (delivery.skip) {
    if (delivery.reason === "test_mode") {
      console.log(
        `[TEST MODE] Письмо не отправлено. Кому: ${to}, Тема: ${subject}`
      )
    } else if (delivery.reason === "missing_receiver") {
      console.warn(
        `[EMAIL SKIP] NODE_ENV=dev, EMAIL_ENABLED=true, но EMAIL_RECEIVER не задан. Тема: ${subject}`
      )
    }
    return
  }

  const { actualTo, actualSubject } = delivery

  if (delivery.redirectedFrom) {
    console.log(`[DEV EMAIL] Перенаправление: ${delivery.redirectedFrom} → ${actualTo}`)
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

    console.log(
      `[EMAIL SENT] Письмо отправлено. Кому: ${actualTo}, Тема: ${actualSubject}`
    )
  } catch (error) {
    console.error(
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

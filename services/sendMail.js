import nodemailer from "nodemailer"

export async function sendEmail({ to, subject, html }) {
  if (process.env.NODE_ENV === "dev" || process.env.EMAIL_ENABLED === "false") {
    console.log(
      `[TEST MODE] Письмо не отправлено. Кому: ${to}, Тема: ${subject}`
    )
    return
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
      to,
      subject,
      html
    })
    
    console.log(`[EMAIL SENT] Письмо отправлено. Кому: ${to}, Тема: ${subject}`)
  } catch (error) {
    console.error(`[EMAIL ERROR] Ошибка при отправке письма. Кому: ${to}, Тема: ${subject}`, error)
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

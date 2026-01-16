import { sendEmail } from "../sendMail.js"

export const sendResetPasswordEmail = async (userEmail, token) => {
  const resetLink = `https://karsavia.ru/reset-password?token=${token}`
  // const resetLink = `http://192.168.0.16:5173/reset-password?token=${token}`

  const mailOptions = {
    // from: `${process.env.EMAIL_USER}`,
    to: userEmail,
    subject: "Восстановление пароля",
    html: `<p>Чтобы сбросить пароль, перейдите по ссылке: <a href="${resetLink}">${resetLink}</a></p>
           <p>Ссылка действительна в течение 1 часа.</p>`
  }

  await sendEmail(mailOptions)
}


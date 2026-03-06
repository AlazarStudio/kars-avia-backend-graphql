import { sendEmail } from "../sendMail.js"

const buildBaseUrl = () => {
  const baseUrl =
    process.env.EXTERNAL_MAGIC_LINK_BASE_URL ||
    process.env.MAGIC_LINK_BASE_URL ||
    process.env.FRONTEND_URL ||
    "https://karsavia.ru"

  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl
}

export const buildExternalMagicLink = ({ token, kind }) => {
  const baseUrl = buildBaseUrl()
  const safeKind = encodeURIComponent(kind)
  const safeToken = encodeURIComponent(token)
  return `${baseUrl}/external-login?kind=${safeKind}&token=${safeToken}`
}

export const sendExternalMagicLinkEmail = async ({
  userEmail,
  token,
  kind
}) => {
  const loginLink = buildExternalMagicLink({ token, kind })

  const mailOptions = {
    to: userEmail,
    subject: "Вход по временной ссылке",
    html: `<p>Чтобы войти в аккаунт, перейдите по ссылке: <a href="${loginLink}">${loginLink}</a></p>
           <p>Ссылка одноразовая и действует 1 час.</p>`
  }

  await sendEmail(mailOptions)
}

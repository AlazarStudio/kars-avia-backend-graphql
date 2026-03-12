import { sendEmail } from "../sendMail.js"

const normalizeBaseUrl = (url) => {
  if (!url || typeof url !== "string") {
    return null
  }
  const trimmed = url.trim()
  if (!trimmed) {
    return null
  }
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed
}

const buildBaseUrl = ({ linkType } = {}) => {
  if (linkType === "CRM") {
    return (
      normalizeBaseUrl(process.env.URL_CRM) ||
      normalizeBaseUrl(process.env.EXTERNAL_MAGIC_LINK_BASE_URL) ||
      normalizeBaseUrl(process.env.MAGIC_LINK_BASE_URL) ||
      normalizeBaseUrl(process.env.FRONTEND_URL) ||
      "https://karsavia.ru"
    )
  }

  if (linkType === "PVA") {
    return (
      normalizeBaseUrl(process.env.URL_PVA) ||
      normalizeBaseUrl(process.env.EXTERNAL_MAGIC_LINK_BASE_URL) ||
      normalizeBaseUrl(process.env.MAGIC_LINK_BASE_URL) ||
      normalizeBaseUrl(process.env.FRONTEND_URL) ||
      "http://localhost:3000"
    )
  }

  return (
    normalizeBaseUrl(process.env.EXTERNAL_MAGIC_LINK_BASE_URL) ||
    normalizeBaseUrl(process.env.MAGIC_LINK_BASE_URL) ||
    normalizeBaseUrl(process.env.FRONTEND_URL) ||
    normalizeBaseUrl(process.env.URL_CRM) ||
    "https://karsavia.ru"
  )
}

export const buildExternalMagicLink = ({ token, kind, linkType }) => {
  const baseUrl = buildBaseUrl({ linkType })
  const safeKind = encodeURIComponent(kind)
  const safeToken = encodeURIComponent(token)
  return `${baseUrl}/external-login?kind=${safeKind}&token=${safeToken}`
}

export const sendExternalMagicLinkEmail = async ({
  userEmail,
  token,
  kind,
  linkType
}) => {
  const loginLink = buildExternalMagicLink({ token, kind, linkType })

  const mailOptions = {
    to: userEmail,
    subject: "Вход по временной ссылке",
    html: `<p>Чтобы войти в аккаунт, перейдите по ссылке: <a href="${loginLink}">${loginLink}</a></p>
           <p>Ссылка одноразовая и действует 1 час.</p>`
  }

  await sendEmail(mailOptions)
}

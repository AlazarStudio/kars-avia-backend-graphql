export function getFrontendUrl() {
  return String(process.env.FRONTEND_URL || "")
    .trim()
    .replace(/\/+$/, "")
}

export function getSupportEmail() {
  return (
    String(process.env.SUPPORT_EMAIL || "").trim() ||
    String(process.env.EMAIL_RECEIVER || "").trim() ||
    ""
  )
}

export function getServiceName() {
  return String(process.env.SERVICE_NAME || "").trim() || "Kars Avia"
}

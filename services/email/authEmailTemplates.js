import { getFrontendUrl, getServiceName, getSupportEmail } from "../auth/appConfig.js"

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

export function buildRegistrationVerifyEmail({ name, verifyLink }) {
  const service = esc(getServiceName())
  const support = esc(getSupportEmail())
  const n = esc(name)
  const subject = `Подтвердите регистрацию в ${getServiceName()}`
  const html = `<p>Здравствуйте, ${n}!</p>
<p>Вы зарегистрировались в ${service}.</p>
<p>Чтобы завершить регистрацию, подтвердите вашу почту:</p>
<p><a href="${esc(verifyLink)}">${esc(verifyLink)}</a></p>
<p>Ссылка действует 24 часа.</p>
<p>Если вы не регистрировались в нашем сервисе, просто проигнорируйте это письмо.</p>
${support ? `<p>Служба поддержки: <a href="mailto:${support}">${support}</a></p>` : ""}
<p>С уважением,<br/>Команда ${service}</p>`
  return { subject, html }
}

export function buildPasswordResetEmail({ email, resetLink }) {
  const service = esc(getServiceName())
  const support = esc(getSupportEmail())
  const em = esc(email)
  const subject = `Сброс пароля в ${getServiceName()}`
  const html = `<p>Здравствуйте!</p>
<p>Мы получили запрос на сброс пароля для аккаунта ${em}.</p>
<p>Чтобы создать новый пароль, перейдите по ссылке:</p>
<p><a href="${esc(resetLink)}">${esc(resetLink)}</a></p>
<p>Ссылка действует 30 минут и может быть использована только один раз.</p>
<p>Если вы не запрашивали сброс пароля, просто проигнорируйте это письмо. Ваш пароль не будет изменён.</p>
${support ? `<p>Служба поддержки: <a href="mailto:${support}">${support}</a></p>` : ""}
<p>С уважением,<br/>Команда ${service}</p>`
  return { subject, html }
}

export function buildPasswordChangedEmail() {
  const service = esc(getServiceName())
  const support = esc(getSupportEmail())
  const subject = "Пароль был изменён"
  const html = `<p>Здравствуйте!</p>
<p>Пароль от вашего аккаунта в ${service} был успешно изменён.</p>
${
  support
    ? `<p>Если это были не вы, срочно обратитесь в поддержку:<br/><a href="mailto:${support}">${support}</a></p>`
    : "<p>Если это были не вы, срочно обратитесь в поддержку.</p>"
}
<p>С уважением,<br/>Команда ${service}</p>`
  return { subject, html }
}

export function buildAccountCreatedByAdminEmail({ name, login, password }) {
  const service = esc(getServiceName())
  const base = getFrontendUrl()
  const loginUrl = base ? `${esc(base)}/login` : ""
  const n = esc(name)
  const lg = esc(login)
  const pw = esc(password)
  const subject = `Ваш аккаунт в ${getServiceName()}`
  const html = `<p>Здравствуйте, ${n}!</p>
<p>Для вас создан аккаунт в ${service}.</p>
<p><strong>Логин:</strong> ${lg}</p>
<p><strong>Пароль:</strong> ${pw}</p>
<p>Рекомендуем сменить пароль после первого входа.</p>
${
  loginUrl
    ? `<p>Вход: <a href="${loginUrl}">${loginUrl}</a></p>`
    : "<p>Войдите через страницу входа приложения.</p>"
}
<p>С уважением,<br/>Команда ${service}</p>`
  return { subject, html }
}

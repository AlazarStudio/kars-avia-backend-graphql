import express from "express"
import rateLimit from "express-rate-limit"
import { signInUser } from "../auth/signInUser.js"
import {
  FORGOT_PASSWORD_MESSAGE,
  requestPasswordResetByEmail,
  resetPasswordWithToken,
  verifyEmailWithToken
} from "../auth/publicAuthService.js"

const router = express.Router()

const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Слишком много запросов. Попробуйте позже." }
})

function jsonError(res, status, message) {
  return res.status(status).json({ message })
}

router.post("/verify-email", async (req, res) => {
  try {
    const { token } = req.body || {}
    const message = await verifyEmailWithToken(String(token || "").trim())
    return res.json({ message })
  } catch (e) {
    return jsonError(res, 400, e?.message || "Ошибка подтверждения")
  }
})

router.post("/forgot-password", forgotPasswordLimiter, async (req, res) => {
  try {
    const { email } = req.body || {}
    const message = await requestPasswordResetByEmail(email)
    return res.json({ message })
  } catch (e) {
    return res.json({ message: FORGOT_PASSWORD_MESSAGE })
  }
})

router.post("/reset-password", async (req, res) => {
  try {
    const { token, newPassword } = req.body || {}
    if (!token || !newPassword) {
      return jsonError(res, 400, "Укажите token и newPassword.")
    }
    const message = await resetPasswordWithToken({
      token: String(token),
      newPassword: String(newPassword)
    })
    return res.json({ message })
  } catch (e) {
    return jsonError(res, 400, e?.message || "Ошибка сброса пароля")
  }
})

router.post("/login", async (req, res) => {
  try {
    const { login, password, fingerprint, token2FA } = req.body || {}
    if (!login || !password) {
      return jsonError(res, 400, "Укажите login и password.")
    }
    const payload = await signInUser({
      login: String(login),
      password: String(password),
      fingerprint: fingerprint != null ? String(fingerprint) : "",
      token2FA: token2FA != null ? String(token2FA) : undefined
    })
    return res.json(payload)
  } catch (e) {
    const msg = e?.message || "Ошибка входа"
    if (msg === "Подтвердите email перед входом.") {
      return jsonError(res, 403, msg)
    }
    if (msg === "Invalid 2FA token") {
      return jsonError(res, 401, "Неверный код двухфакторной аутентификации.")
    }
    return jsonError(res, 401, "Неверный логин или пароль.")
  }
})

// Неизвестные пути /api/auth/* (в том числе закрытый /register) — 404 здесь,
// а не проваливаются в GraphQL-обработчик, смонтированный на "/" (ПДН-Е-09).
router.use((req, res) => jsonError(res, 404, "Not found"))

export default router

import express from "express"
import rateLimit from "express-rate-limit"
import { signInUser } from "../auth/signInUser.js"
import {
  FORGOT_PASSWORD_MESSAGE,
  registerSelfUser,
  requestPasswordResetByEmail,
  resetPasswordWithToken,
  verifyEmailWithToken
} from "../auth/publicAuthService.js"
import { logger } from "../infra/logger.js"

const router = express.Router()

const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Слишком много запросов. Попробуйте позже." }
})

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Слишком много попыток регистрации. Попробуйте позже." }
})

function jsonError(res, status, message) {
  return res.status(status).json({ message })
}

router.post("/register", registerLimiter, async (req, res) => {
  try {
    const { name, email, login, password } = req.body || {}
    if (!name || !email || !login || !password) {
      return jsonError(res, 400, "Укажите name, email, login и password.")
    }

    const newUser = await registerSelfUser({
      name: String(name).trim(),
      email: String(email).trim(),
      login: String(login).trim(),
      password: String(password),
      role: "USER",
      userType: undefined,
      images: undefined
    })

    const { password: _p, ...safe } = newUser
    return res.status(201).json({
      message:
        "Регистрация создана. Подтвердите email по ссылке из письма, затем войдите в аккаунт.",
      requiresEmailVerification: true,
      user: safe
    })
  } catch (e) {
    logger.warn("[api/auth/register]", e?.message)
    const msg = e?.message || "Ошибка регистрации"
    if (msg.includes("уже существует")) {
      return jsonError(res, 409, msg)
    }
    return jsonError(res, 400, msg)
  }
})

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

export default router

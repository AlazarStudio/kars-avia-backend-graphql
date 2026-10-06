import argon2 from "argon2"
import { v4 as uuidv4 } from "uuid"
import { prisma } from "../../prisma.js"
import {
  createUserAuthTokenRecord,
  findActiveTokenByRaw,
  markTokenUsed
} from "./userAuthTokenRepo.js"
import {
  sendPasswordChangedNotificationEmail,
  sendPasswordResetEmail
} from "../email/sendAuthEmails.js"
import { assertPasswordPolicy } from "./signInUser.js"

export const FORGOT_PASSWORD_MESSAGE =
  "Если аккаунт с такой почтой существует, мы отправили ссылку для сброса пароля."

export async function verifyEmailWithToken(rawToken) {
  if (!rawToken || typeof rawToken !== "string") {
    throw new Error("Недействительная или просроченная ссылка подтверждения.")
  }

  const found = await findActiveTokenByRaw({ rawToken, kind: "EMAIL_VERIFY" })
  if (!found) {
    throw new Error("Недействительная или просроченная ссылка подтверждения.")
  }

  const { row, user } = found

  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerified: true }
  })

  await markTokenUsed(row.id)

  return "Почта успешно подтверждена. Теперь вы можете войти в аккаунт."
}

export async function requestPasswordResetByEmail(email) {
  const trimmed = String(email || "").trim()
  if (!trimmed) {
    return FORGOT_PASSWORD_MESSAGE
  }

  const target = await prisma.user.findFirst({
    where: { email: { equals: trimmed, mode: "insensitive" } }
  })

  if (target && target.active) {
    try {
      const { rawToken } = await createUserAuthTokenRecord({
        userId: target.id,
        kind: "PASSWORD_RESET"
      })
      await sendPasswordResetEmail({
        to: target.email,
        email: target.email,
        rawToken
      })
    } catch (e) {
      console.error("[requestPasswordResetByEmail] send failed:", e)
    }
  }

  return FORGOT_PASSWORD_MESSAGE
}

export async function resetPasswordWithToken({ token, newPassword }) {
  assertPasswordPolicy(newPassword)
  if (!token || typeof token !== "string") {
    throw new Error("Неверный или просроченный токен")
  }

  const found = await findActiveTokenByRaw({ rawToken: token, kind: "PASSWORD_RESET" })
  if (!found) {
    throw new Error("Неверный или просроченный токен")
  }

  const { row, user } = found
  const hashedPassword = await argon2.hash(newPassword)
  const sessionToken = uuidv4()

  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: hashedPassword,
      refreshToken: sessionToken,
      fingerprint: null
    }
  })

  await markTokenUsed(row.id)

  try {
    await sendPasswordChangedNotificationEmail(user.email)
  } catch (e) {
    console.error("[resetPasswordWithToken] notify email failed:", e)
  }

  return "Пароль успешно изменён. Теперь вы можете войти в аккаунт."
}

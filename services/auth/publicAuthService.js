import argon2 from "argon2"
import speakeasy from "@levminer/speakeasy"
import { v4 as uuidv4 } from "uuid"
import { prisma } from "../../prisma.js"
import { normalizeUserLogin } from "./normalizeUserLogin.js"
import { resolveRoleAndUserType } from "./resolveRoleAndUserType.js"
import {
  createUserAuthTokenRecord,
  findActiveTokenByRaw,
  markTokenUsed
} from "./userAuthTokenRepo.js"
import { uploadImage } from "../files/uploadImage.js"
import {
  sendPasswordChangedNotificationEmail,
  sendPasswordResetEmail,
  sendRegistrationVerifyEmail
} from "../email/sendAuthEmails.js"
import { pubsub, USER_CREATED } from "../infra/pubsub.js"
import { assertPasswordPolicy } from "./signInUser.js"

export const FORGOT_PASSWORD_MESSAGE =
  "Если аккаунт с такой почтой существует, мы отправили ссылку для сброса пароля."

export async function registerSelfUser({ name, email, login, password, role, userType, images }) {
  assertPasswordPolicy(password)

  let imagePaths = []
  if (images && images.length > 0) {
    for (const image of images) {
      imagePaths.push(await uploadImage(image, { bucket: "user" }))
    }
  }

  const loginNormalized = normalizeUserLogin(login)
  const { finalRole, finalUserType } = resolveRoleAndUserType({
    role,
    userType
  })
  const hashedPassword = await argon2.hash(password)
  const twoFASecret = speakeasy.generateSecret().base32

  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [
        { email },
        { login: { equals: loginNormalized, mode: "insensitive" } }
      ]
    }
  })

  if (existingUser) {
    const existingLoginNorm = normalizeUserLogin(existingUser.login)
    if (existingUser.email === email && existingLoginNorm === loginNormalized) {
      throw new Error("Пользователь с таким email и логином уже существует")
    }
    if (existingUser.email === email) {
      throw new Error("Пользователь с таким email уже существует")
    }
    if (existingLoginNorm === loginNormalized) {
      throw new Error("Пользователь с таким логином уже существует")
    }
  }

  const newUser = await prisma.user.create({
    data: {
      name,
      email,
      login: loginNormalized,
      password: hashedPassword,
      role: finalRole,
      userType: finalUserType,
      images: imagePaths,
      twoFASecret,
      emailVerified: false,
      refreshToken: null,
      fingerprint: null
    }
  })

  try {
    const { rawToken } = await createUserAuthTokenRecord({
      userId: newUser.id,
      kind: "EMAIL_VERIFY"
    })
    await sendRegistrationVerifyEmail({
      to: newUser.email,
      name: newUser.name,
      rawToken
    })
  } catch (e) {
    console.error("[registerSelfUser] verify email send failed:", e)
  }

  pubsub.publish(USER_CREATED, { userCreated: newUser })
  return newUser
}

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

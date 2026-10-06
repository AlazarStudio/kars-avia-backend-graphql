import argon2 from "argon2"
import speakeasy from "@levminer/speakeasy"
import { v4 as uuidv4 } from "uuid"
import { prisma } from "../../prisma.js"
import { normalizeUserLogin } from "./normalizeUserLogin.js"
import { buildClosedSessionStats } from "../user/userActivity.js"
import { buildUserAuthPayload } from "./buildUserAuthPayload.js"
import { pubsub, USER_ONLINE } from "../infra/pubsub.js"

export function assertPasswordPolicy(password) {
  if (!password || typeof password !== "string" || password.length < 8) {
    throw new Error("Пароль должен быть не короче 8 символов.")
  }
}

// Проверки учётки, общие для обоих входов CRM: signInUser и transferSignIn.
// Тексты ошибок — контракт: REST /api/auth/login переводит «Подтвердите email»
// в 403 (services/routes/auth.js).
export function assertUserMaySignIn(user) {
  if (!user.active) {
    throw new Error("User is not active")
  }

  if (user.emailVerified === false) {
    throw new Error("Подтвердите email перед входом.")
  }
}

export function assertUser2FA(user, token2FA) {
  if (!user.is2FAEnabled) return

  let verified = false
  try {
    if (token2FA && user.twoFAMethod === "TOTP") {
      verified = speakeasy.totp.verify({
        secret: user.twoFASecret,
        encoding: "base32",
        token: token2FA
      })
    } else if (token2FA && user.twoFAMethod === "HOTP") {
      verified = speakeasy.hotp.verify({
        secret: user.twoFASecret,
        encoding: "base32",
        token: token2FA,
        counter: 0
      })
    }
  } catch {
    // speakeasy бросает на коде неверной длины — для входа это тот же отказ
    verified = false
  }

  if (!verified) {
    throw new Error("Invalid 2FA token")
  }
}

export async function signInUser({ login, password, fingerprint, token2FA }) {
  const identifier = normalizeUserLogin(login)
  if (!identifier) {
    throw new Error("Invalid credentials")
  }

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { login: { equals: identifier, mode: "insensitive" } },
        { email: { equals: identifier, mode: "insensitive" } }
      ]
    }
  })

  if (!user) {
    throw new Error("Invalid credentials")
  }

  assertUserMaySignIn(user)

  if (!(await argon2.verify(user.password, password))) {
    throw new Error("Invalid credentials")
  }

  assertUser2FA(user, token2FA)

  const sessionToken = uuidv4()
  const now = new Date()
  const { addedMinutes, nextDailyStats } = buildClosedSessionStats({
    sessionStartedAt: user.sessionStartedAt,
    currentDailyStats: user.dailyTimeStats || [],
    now
  })

  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: {
      refreshToken: sessionToken,
      fingerprint: fingerprint ?? "",
      lastSeen: now,
      isOnline: true,
      sessionStartedAt: now,
      totalTimeMinutes: (user.totalTimeMinutes || 0) + addedMinutes,
      dailyTimeStats: nextDailyStats
    }
  })

  pubsub.publish(USER_ONLINE, { userOnline: updatedUser })

  return buildUserAuthPayload({ user: updatedUser, sessionToken })
}

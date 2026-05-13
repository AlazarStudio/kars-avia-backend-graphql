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

  if (!user.active) {
    throw new Error("User is not active")
  }

  if (user.emailVerified === false) {
    throw new Error("Подтвердите email перед входом.")
  }

  if (!(await argon2.verify(user.password, password))) {
    throw new Error("Invalid credentials")
  }

  if (user.is2FAEnabled) {
    let verified
    if (user.twoFAMethod === "TOTP") {
      verified = speakeasy.totp.verify({
        secret: user.twoFASecret,
        encoding: "base32",
        token: token2FA
      })
    } else if (user.twoFAMethod === "HOTP") {
      verified = speakeasy.hotp.verify({
        secret: user.twoFASecret,
        encoding: "base32",
        token: token2FA,
        counter: 0
      })
    }
    if (!verified) {
      throw new Error("Invalid 2FA token")
    }
  }

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

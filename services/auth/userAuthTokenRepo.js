import { prisma } from "../../prisma.js"
import { generateOpaqueToken, hashOpaqueToken } from "./tokenHash.js"

const MS_DAY = 24 * 60 * 60 * 1000
const MS_RESET = 30 * 60 * 1000

export async function createUserAuthTokenRecord({ userId, kind }) {
  const ttlMs = kind === "EMAIL_VERIFY" ? MS_DAY : MS_RESET
  const raw = generateOpaqueToken()
  const tokenHash = hashOpaqueToken(raw)
  const expiresAt = new Date(Date.now() + ttlMs)

  await prisma.userAuthToken.deleteMany({
    where: {
      userId,
      kind,
      usedAt: null
    }
  })

  await prisma.userAuthToken.create({
    data: {
      tokenHash,
      kind,
      userId,
      expiresAt
    }
  })

  return { rawToken: raw, expiresAt }
}

export async function findActiveTokenByRaw({ rawToken, kind }) {
  const tokenHash = hashOpaqueToken(rawToken)
  if (!tokenHash) return null

  const now = new Date()
  const row = await prisma.userAuthToken.findFirst({
    where: {
      tokenHash,
      kind,
      usedAt: null,
      expiresAt: { gt: now }
    }
  })
  if (!row) return null

  const user = await prisma.user.findUnique({
    where: { id: row.userId }
  })
  if (!user || !user.active) return null

  return { row, user }
}

export async function markTokenUsed(id) {
  await prisma.userAuthToken.update({
    where: { id },
    data: { usedAt: new Date() }
  })
}

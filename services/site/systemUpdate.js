import { GraphQLError } from "graphql"
import { prisma } from "../../prisma.js"
import {
  toSystemUpdateResponse,
  validateSystemUpdateInput
} from "./systemUpdateUtils.js"

function getLastSeenAppVersionFromContext(context) {
  if (context?.subjectType !== "USER" || !context?.subject?.id) {
    return null
  }

  return context.subject.lastSeenAppVersion ?? null
}

async function loadLastSeenAppVersion(context) {
  const fromContext = getLastSeenAppVersionFromContext(context)
  if (fromContext != null) return fromContext

  if (context?.subjectType !== "USER" || !context?.subject?.id) {
    return null
  }

  const user = await prisma.user.findUnique({
    where: { id: context.subject.id },
    select: { lastSeenAppVersion: true }
  })

  return user?.lastSeenAppVersion ?? null
}

export async function getSystemUpdate(context) {
  const record = await prisma.systemUpdate.findFirst()
  const lastSeenAppVersion = await loadLastSeenAppVersion(context)
  return toSystemUpdateResponse(record, lastSeenAppVersion)
}

export async function updateSystemUpdate(input, now = new Date()) {
  try {
    validateSystemUpdateInput(input)
  } catch (err) {
    throw new GraphQLError(err.message, {
      extensions: { code: "BAD_USER_INPUT" }
    })
  }

  const version = typeof input.version === "string" ? input.version.trim() : ""
  const title = typeof input.title === "string" ? input.title.trim() : ""
  const message = typeof input.message === "string" ? input.message.trim() : ""
  const enabled = Boolean(input.enabled)

  const existing = await prisma.systemUpdate.findFirst()
  const publishedAt = enabled
    ? input.publishedAt ?? existing?.publishedAt ?? now
    : input.publishedAt ?? null

  const data = {
    version,
    title,
    message,
    enabled,
    publishedAt
  }

  const record = existing
    ? await prisma.systemUpdate.update({
        where: { id: existing.id },
        data
      })
    : await prisma.systemUpdate.create({ data })

  return toSystemUpdateResponse(record, null)
}

export async function markSystemUpdateSeen(context) {
  if (context?.subjectType !== "USER" || !context?.subject?.id) {
    throw new GraphQLError("Только авторизованный пользователь может отметить обновление просмотренным", {
      extensions: { code: "FORBIDDEN" }
    })
  }

  const record = await prisma.systemUpdate.findFirst()

  if (!record?.enabled || !record.version) {
    return toSystemUpdateResponse(record, context.subject.lastSeenAppVersion ?? null)
  }

  await prisma.user.update({
    where: { id: context.subject.id },
    data: { lastSeenAppVersion: record.version }
  })

  return toSystemUpdateResponse(record, record.version)
}

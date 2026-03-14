import jwt from "jsonwebtoken"
import { v4 as uuidv4 } from "uuid"
import { GraphQLError } from "graphql"
import { prisma } from "../../prisma.js"
import { adminMiddleware } from "../../middlewares/authMiddleware.js"
import {
  EXTERNAL_MAGIC_LINK_TTL_MS,
  evaluateMagicLinkRequestLimits,
  createMagicLinkTokenPair,
  hashMagicLinkToken,
  normalizeEmail,
  nextSessionExpiry,
  validateMagicLinkRecord
} from "../../services/auth/externalMagicLink.js"
import {
  buildExternalMagicLink,
  sendExternalMagicLinkEmail
} from "../../services/auth/sendExternalMagicLinkEmail.js"

const SUBJECT_TYPE = {
  EXTERNAL_USER: "EXTERNAL_USER"
}

const EXTERNAL_SCOPES = ["HOTEL", "DRIVER"]
const EXTERNAL_ACCESS_TYPES = ["CRM", "PWA"]

const throwForbidden = (message = "Access forbidden") => {
  throw new GraphQLError(message, { extensions: { code: "FORBIDDEN" } })
}

const resolveAdminId = (
  context,
  forbiddenMessage = "Only admins can issue magic links"
) => {
  const adminId = context?.subjectType === "USER" ? context.subject.id : null
  if (!adminId) {
    throwForbidden(forbiddenMessage)
  }

  return adminId
}

const validateExternalScopeBinding = ({ scope, hotelId, driverId }) => {
  const hasHotelId = Boolean(hotelId)
  const hasDriverId = Boolean(driverId)

  if (hasHotelId && hasDriverId) {
    throw new Error("hotelId and driverId cannot be provided together")
  }

  if (scope === "HOTEL") {
    if (!hasHotelId) {
      throw new Error("hotelId is required for HOTEL scope")
    }
    return
  }

  if (scope === "DRIVER" && hasHotelId) {
    throw new Error("hotelId is not allowed for DRIVER scope")
  }
}

const issueTokenForExternalUser = async ({
  externalUserId,
  createdByAdminId,
  linkType = "CRM"
}) => {
  const now = new Date()
  const oneHourAgo = new Date(now.getTime() - EXTERNAL_MAGIC_LINK_TTL_MS)

  const [latestToken, issuedInLastHour] = await prisma.$transaction([
    prisma.externalUserMagicLinkToken.findFirst({
      where: { externalUserId },
      orderBy: { createdAt: "desc" }
    }),
    prisma.externalUserMagicLinkToken.count({
      where: {
        externalUserId,
        createdAt: { gte: oneHourAgo }
      }
    })
  ])

  const limitResult = evaluateMagicLinkRequestLimits({
    now,
    latestToken,
    issuedInLastHour
  })
  if (!limitResult.allowed) {
    throw new Error("Magic link issue limit exceeded")
  }

  const { rawToken, tokenHash } = createMagicLinkTokenPair()
  const magicLinkUrl = buildExternalMagicLink({
    token: rawToken,
    kind: SUBJECT_TYPE.EXTERNAL_USER,
    linkType
  })
  const expiresAt = new Date(now.getTime() + EXTERNAL_MAGIC_LINK_TTL_MS)

  await prisma.externalUserMagicLinkToken.create({
    data: {
      externalUserId,
      tokenHash,
      rawToken,
      magicLinkUrl,
      expiresAt,
      createdByAdminId
    }
  })

  return { rawToken, magicLinkUrl }
}

const buildExternalAuthPayload = ({ entity, sessionToken }) => {
  const token = jwt.sign(
    {
      subjectType: SUBJECT_TYPE.EXTERNAL_USER,
      externalUserId: entity.id,
      sessionToken
    },
    process.env.JWT_SECRET,
    { expiresIn: "24h" }
  )

  return {
    token,
    refreshToken: sessionToken,
    subjectType: SUBJECT_TYPE.EXTERNAL_USER,
    externalUser: entity
  }
}

const signInExternalUserByMagicLink = async ({ token, tokenHash, now }) => {
  const magicLinkRecord = await prisma.externalUserMagicLinkToken.findUnique({
    where: { tokenHash },
    include: { externalUser: true }
  })

  const validation = validateMagicLinkRecord({
    record: magicLinkRecord,
    rawToken: token,
    now
  })
  // If the link was already consumed by a near-simultaneous request,
  // return the currently active session instead of failing hard.
  if (validation.reason === "ALREADY_USED") {
    const existingSessionToken = magicLinkRecord?.externalUser?.refreshToken
    const sessionExpiresAt = magicLinkRecord?.externalUser?.sessionExpiresAt
    const hasActiveSession =
      Boolean(existingSessionToken) &&
      Boolean(sessionExpiresAt) &&
      new Date(sessionExpiresAt).getTime() > now.getTime() &&
      magicLinkRecord?.externalUser?.active

    if (hasActiveSession) {
      return buildExternalAuthPayload({
        entity: magicLinkRecord.externalUser,
        sessionToken: existingSessionToken
      })
    }
  }

  if (!validation.valid || !magicLinkRecord?.externalUser?.active) {
    throw new Error("Invalid or expired magic link")
  }

  const issuedSessionToken = uuidv4()
  let payloadSessionToken = issuedSessionToken
  let updatedExternalUser = null

  await prisma.$transaction(async (tx) => {
    const consumeResult = await tx.externalUserMagicLinkToken.updateMany({
      where: {
        id: magicLinkRecord.id,
        usedAt: null,
        expiresAt: { gt: now }
      },
      data: {
        usedAt: now,
        rawToken: null,
        magicLinkUrl: null
      }
    })
    if (consumeResult.count !== 1) {
      const currentExternalUser = await tx.externalUser.findUnique({
        where: { id: magicLinkRecord.externalUser.id }
      })
      const hasActiveSession =
        Boolean(currentExternalUser?.active) &&
        Boolean(currentExternalUser?.refreshToken) &&
        Boolean(currentExternalUser?.sessionExpiresAt) &&
        new Date(currentExternalUser.sessionExpiresAt).getTime() >
          now.getTime()

      if (hasActiveSession) {
        updatedExternalUser = currentExternalUser
        payloadSessionToken = currentExternalUser.refreshToken
        return
      }

      updatedExternalUser = await tx.externalUser.update({
        where: { id: magicLinkRecord.externalUser.id },
        data: {
          refreshToken: issuedSessionToken,
          sessionExpiresAt: nextSessionExpiry(
            currentExternalUser?.sessionExpiresAt || null,
            now
          )
        }
      })
      payloadSessionToken = issuedSessionToken
      return
    }

    updatedExternalUser = await tx.externalUser.update({
      where: { id: magicLinkRecord.externalUser.id },
      data: {
        refreshToken: issuedSessionToken,
        sessionExpiresAt: nextSessionExpiry(null, now)
      }
    })
  })

  return buildExternalAuthPayload({
    entity: updatedExternalUser,
    sessionToken: payloadSessionToken
  })
}

const externalAuthResolver = {
  Query: {
    externalUsers: async (_, { pagination = {}, filter = {} }, context) => {
      await adminMiddleware(context)

      const { skip = 0, take = 10, all = false, search } = pagination
      const where = {}

      if (typeof filter.active === "boolean") where.active = filter.active
      if (filter.hotelId) where.hotelId = filter.hotelId
      if (filter.driverId) where.driverId = filter.driverId
      if (filter.scope) where.scope = filter.scope
      if (filter.accessType) where.accessType = filter.accessType
      if (search?.trim()) {
        where.OR = [
          { email: { contains: search.trim(), mode: "insensitive" } },
          { name: { contains: search.trim(), mode: "insensitive" } }
        ]
      }

      const totalCount = await prisma.externalUser.count({ where })

      const users = all
        ? await prisma.externalUser.findMany({
            where,
            orderBy: { createdAt: "desc" }
          })
        : await prisma.externalUser.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: skip ? skip * take : undefined,
            take: take || undefined
          })

      const totalPages = take && !all ? Math.ceil(totalCount / take) : 1
      return { users, totalCount, totalPages }
    }
  },
  Mutation: {
    createExternalAuthLink: async (_, { input }, context) => {
      await adminMiddleware(context)

      if (!EXTERNAL_SCOPES.includes(input.scope)) {
        throw new Error("Invalid scope")
      }
      if (!EXTERNAL_ACCESS_TYPES.includes(input.accessType)) {
        throw new Error("Invalid accessType")
      }
      validateExternalScopeBinding({
        scope: input.scope,
        hotelId: input.hotelId,
        driverId: input.driverId
      })

      const email = normalizeEmail(input.email)
      if (!email) {
        throw new Error("Email is required")
      }

      const adminId = resolveAdminId(
        context,
        "Only admins can issue magic links"
      )

      if (input.scope === "HOTEL") {
        const hotel = await prisma.hotel.findUnique({
          where: { id: input.hotelId },
          select: { id: true }
        })
        if (!hotel) {
          throw new Error("Hotel not found")
        }
      }

      if (input.scope === "DRIVER") {
        if (input.driverId) {
          const driver = await prisma.driver.findUnique({
            where: { id: input.driverId },
            select: { id: true }
          })
          if (!driver) {
            throw new Error("Driver not found")
          }
        }
      }

      const externalUser = await prisma.externalUser.upsert({
        where: { email },
        create: {
          email,
          name: input.name || null,
          scope: input.scope,
          accessType: input.accessType,
          hotelId: input.scope === "HOTEL" ? input.hotelId : null,
          driverId: input.scope === "DRIVER" ? input.driverId : null,
          active: true
        },
        update: {
          name: input.name ?? undefined,
          scope: input.scope,
          accessType: input.accessType,
          hotelId: input.scope === "HOTEL" ? input.hotelId : null,
          driverId: input.scope === "DRIVER" ? input.driverId : null,
          active: true
        }
      })

      const { rawToken, magicLinkUrl } = await issueTokenForExternalUser({
        externalUserId: externalUser.id,
        createdByAdminId: adminId,
        linkType: input.accessType
      })

      let emailed = true
      try {
        await sendExternalMagicLinkEmail({
          userEmail: externalUser.email,
          token: rawToken,
          kind: SUBJECT_TYPE.EXTERNAL_USER,
          linkType: input.accessType
        })
      } catch (error) {
        emailed = false
      }

      return {
        success: true,
        emailed,
        link: magicLinkUrl
      }
    },

    authorizeExternalAuth: async (_, { token }) => {
      if (!token) {
        throw new Error("Invalid or expired magic link")
      }

      const now = new Date()
      const tokenHash = hashMagicLinkToken(token)

      return signInExternalUserByMagicLink({
        token,
        tokenHash,
        now
      })
    },

    adminExtendExternalAuthSession: async (_, { externalUserId }, context) => {
      await adminMiddleware(context)

      const externalUser = await prisma.externalUser.findUnique({
        where: { id: externalUserId }
      })
      if (!externalUser || !externalUser.active || !externalUser.refreshToken) {
        throw new Error("External user has no active session")
      }

      const now = new Date()
      await prisma.externalUser.update({
        where: { id: externalUserId },
        data: {
          sessionExpiresAt: nextSessionExpiry(
            externalUser.sessionExpiresAt,
            now
          )
        }
      })

      return true
    }
  }
}

export default externalAuthResolver

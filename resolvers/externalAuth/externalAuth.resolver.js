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
import { sendExternalMagicLinkEmail } from "../../services/auth/sendExternalMagicLinkEmail.js"

const SUBJECT_TYPE = {
  EXTERNAL_USER: "EXTERNAL_USER",
  PASSENGER_REQUEST_EXTERNAL_USER: "PASSENGER_REQUEST_EXTERNAL_USER"
}

const throwForbidden = (message = "Access forbidden") => {
  throw new GraphQLError(message, { extensions: { code: "FORBIDDEN" } })
}

const validatePassengerServiceHotelItem = async ({
  passengerRequestId,
  passengerServiceHotelItemId
}) => {
  if (!passengerServiceHotelItemId) {
    return
  }

  const passengerRequest = await prisma.passengerRequest.findUnique({
    where: { id: passengerRequestId },
    select: { id: true, livingService: true }
  })

  if (!passengerRequest) {
    throw new Error("PassengerRequest not found")
  }

  const hotels = passengerRequest.livingService?.hotels || []
  const hasItem = hotels.some((hotel) => hotel?.itemId === passengerServiceHotelItemId)

  if (!hasItem) {
    throw new Error("PassengerServiceHotel item not found")
  }
}

const issueTokenForExternalUser = async ({ externalUserId, createdByAdminId }) => {
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
  const expiresAt = new Date(now.getTime() + EXTERNAL_MAGIC_LINK_TTL_MS)

  await prisma.externalUserMagicLinkToken.create({
    data: {
      externalUserId,
      tokenHash,
      expiresAt,
      createdByAdminId
    }
  })

  return { rawToken, tokenHash }
}

const issueTokenForPassengerRequestExternalUser = async ({
  passengerRequestExternalUserId,
  createdByAdminId
}) => {
  const now = new Date()
  const oneHourAgo = new Date(now.getTime() - EXTERNAL_MAGIC_LINK_TTL_MS)

  const [latestToken, issuedInLastHour] = await prisma.$transaction([
    prisma.passengerRequestExternalUserMagicLinkToken.findFirst({
      where: { passengerRequestExternalUserId },
      orderBy: { createdAt: "desc" }
    }),
    prisma.passengerRequestExternalUserMagicLinkToken.count({
      where: {
        passengerRequestExternalUserId,
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
  const expiresAt = new Date(now.getTime() + EXTERNAL_MAGIC_LINK_TTL_MS)

  await prisma.passengerRequestExternalUserMagicLinkToken.create({
    data: {
      passengerRequestExternalUserId,
      tokenHash,
      expiresAt,
      createdByAdminId
    }
  })

  return { rawToken, tokenHash }
}

const buildExternalAuthPayload = ({ subjectType, entity, sessionToken }) => {
  const payload = {
    subjectType,
    sessionToken
  }

  if (subjectType === SUBJECT_TYPE.EXTERNAL_USER) {
    payload.externalUserId = entity.id
  }

  if (subjectType === SUBJECT_TYPE.PASSENGER_REQUEST_EXTERNAL_USER) {
    payload.passengerRequestExternalUserId = entity.id
  }

  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "24h" })

  return {
    token,
    refreshToken: sessionToken,
    subjectType,
    externalUser: subjectType === SUBJECT_TYPE.EXTERNAL_USER ? entity : null,
    passengerRequestExternalUser:
      subjectType === SUBJECT_TYPE.PASSENGER_REQUEST_EXTERNAL_USER ? entity : null
  }
}

const externalAuthResolver = {
  Query: {
    externalUsers: async (_, { pagination = {}, filter = {} }, context) => {
      await adminMiddleware(context)

      const { skip = 0, take = 10, all = false, search } = pagination
      const where = {}

      if (typeof filter.active === "boolean") where.active = filter.active
      if (filter.hotelId) where.hotelId = filter.hotelId
      if (filter.organizationId) where.organizationId = filter.organizationId
      if (filter.airlineId) where.airlineId = filter.airlineId
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
    },
    passengerRequestExternalUsers: async (_, { passengerRequestId }, context) => {
      await adminMiddleware(context)

      return prisma.passengerRequestExternalUser.findMany({
        where: { passengerRequestId },
        orderBy: { createdAt: "desc" }
      })
    }
  },
  Mutation: {
    adminIssueExternalUserMagicLink: async (_, { input }, context) => {
      await adminMiddleware(context)

      const email = normalizeEmail(input.email)
      if (!email) {
        throw new Error("Email is required")
      }

      const adminId = context?.subjectType === "USER" ? context.subject.id : null
      if (!adminId) {
        throwForbidden("Only admins can issue magic links")
      }

      const externalUser = await prisma.externalUser.upsert({
        where: { email },
        create: {
          email,
          name: input.name || null,
          hotelId: input.hotelId || null,
          organizationId: input.organizationId || null,
          airlineId: input.airlineId || null,
          active: true
        },
        update: {
          name: input.name ?? undefined,
          hotelId: input.hotelId ?? undefined,
          organizationId: input.organizationId ?? undefined,
          airlineId: input.airlineId ?? undefined,
          active: true
        }
      })

      const { rawToken, tokenHash } = await issueTokenForExternalUser({
        externalUserId: externalUser.id,
        createdByAdminId: adminId
      })

      try {
        await sendExternalMagicLinkEmail({
          userEmail: externalUser.email,
          token: rawToken,
          kind: "EXTERNAL_USER"
        })
      } catch (error) {
        await prisma.externalUserMagicLinkToken.deleteMany({
          where: { tokenHash, usedAt: null }
        })
        throw error
      }

      return true
    },

    externalUserSignInWithMagicLink: async (_, { token }) => {
      if (!token) {
        throw new Error("Invalid or expired magic link")
      }

      const now = new Date()
      const tokenHash = hashMagicLinkToken(token)
      const magicLinkRecord = await prisma.externalUserMagicLinkToken.findUnique({
        where: { tokenHash },
        include: { externalUser: true }
      })

      const validation = validateMagicLinkRecord({
        record: magicLinkRecord,
        rawToken: token,
        now
      })
      if (!validation.valid || !magicLinkRecord?.externalUser?.active) {
        throw new Error("Invalid or expired magic link")
      }

      const sessionToken = uuidv4()
      let updatedExternalUser = null

      await prisma.$transaction(async (tx) => {
        const consumeResult = await tx.externalUserMagicLinkToken.updateMany({
          where: {
            id: magicLinkRecord.id,
            usedAt: null,
            expiresAt: { gt: now }
          },
          data: { usedAt: now }
        })
        if (consumeResult.count !== 1) {
          throw new Error("Invalid or expired magic link")
        }

        updatedExternalUser = await tx.externalUser.update({
          where: { id: magicLinkRecord.externalUser.id },
          data: {
            refreshToken: sessionToken,
            sessionExpiresAt: nextSessionExpiry(null, now)
          }
        })
      })

      return buildExternalAuthPayload({
        subjectType: SUBJECT_TYPE.EXTERNAL_USER,
        entity: updatedExternalUser,
        sessionToken
      })
    },

    adminExtendExternalUserSession: async (_, { externalUserId }, context) => {
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
          sessionExpiresAt: nextSessionExpiry(externalUser.sessionExpiresAt, now)
        }
      })

      return true
    },

    adminReissueExternalUserMagicLink: async (_, { externalUserId }, context) => {
      await adminMiddleware(context)

      const externalUser = await prisma.externalUser.findUnique({
        where: { id: externalUserId }
      })
      if (!externalUser || !externalUser.active) {
        throw new Error("External user not found")
      }

      const adminId = context?.subjectType === "USER" ? context.subject.id : null
      if (!adminId) {
        throwForbidden("Only admins can reissue magic links")
      }

      const { rawToken, tokenHash } = await issueTokenForExternalUser({
        externalUserId,
        createdByAdminId: adminId
      })

      try {
        await sendExternalMagicLinkEmail({
          userEmail: externalUser.email,
          token: rawToken,
          kind: "EXTERNAL_USER"
        })
      } catch (error) {
        await prisma.externalUserMagicLinkToken.deleteMany({
          where: { tokenHash, usedAt: null }
        })
        throw error
      }

      return true
    },

    adminIssuePassengerRequestExternalUserMagicLink: async (
      _,
      { input },
      context
    ) => {
      await adminMiddleware(context)

      const email = normalizeEmail(input.email)
      if (!email) {
        throw new Error("Email is required")
      }

      const adminId = context?.subjectType === "USER" ? context.subject.id : null
      if (!adminId) {
        throwForbidden("Only admins can issue magic links")
      }

      await validatePassengerServiceHotelItem({
        passengerRequestId: input.passengerRequestId,
        passengerServiceHotelItemId: input.passengerServiceHotelItemId
      })

      const passengerExternalUser = await prisma.passengerRequestExternalUser.upsert({
        where: { email },
        create: {
          email,
          name: input.name || null,
          passengerRequestId: input.passengerRequestId,
          passengerServiceHotelItemId: input.passengerServiceHotelItemId || null,
          active: true
        },
        update: {
          name: input.name ?? undefined,
          passengerRequestId: input.passengerRequestId,
          passengerServiceHotelItemId:
            input.passengerServiceHotelItemId ?? undefined,
          active: true
        }
      })

      const { rawToken, tokenHash } =
        await issueTokenForPassengerRequestExternalUser({
          passengerRequestExternalUserId: passengerExternalUser.id,
          createdByAdminId: adminId
        })

      try {
        await sendExternalMagicLinkEmail({
          userEmail: passengerExternalUser.email,
          token: rawToken,
          kind: "PASSENGER_REQUEST_EXTERNAL_USER"
        })
      } catch (error) {
        await prisma.passengerRequestExternalUserMagicLinkToken.deleteMany({
          where: { tokenHash, usedAt: null }
        })
        throw error
      }

      return true
    },

    passengerRequestExternalUserSignInWithMagicLink: async (_, { token }) => {
      if (!token) {
        throw new Error("Invalid or expired magic link")
      }

      const now = new Date()
      const tokenHash = hashMagicLinkToken(token)
      const magicLinkRecord =
        await prisma.passengerRequestExternalUserMagicLinkToken.findUnique({
          where: { tokenHash },
          include: { passengerRequestExternalUser: true }
        })

      const validation = validateMagicLinkRecord({
        record: magicLinkRecord,
        rawToken: token,
        now
      })
      if (
        !validation.valid ||
        !magicLinkRecord?.passengerRequestExternalUser?.active
      ) {
        throw new Error("Invalid or expired magic link")
      }

      const sessionToken = uuidv4()
      let updatedPassengerExternalUser = null

      await prisma.$transaction(async (tx) => {
        const consumeResult =
          await tx.passengerRequestExternalUserMagicLinkToken.updateMany({
            where: {
              id: magicLinkRecord.id,
              usedAt: null,
              expiresAt: { gt: now }
            },
            data: { usedAt: now }
          })
        if (consumeResult.count !== 1) {
          throw new Error("Invalid or expired magic link")
        }

        updatedPassengerExternalUser = await tx.passengerRequestExternalUser.update(
          {
            where: { id: magicLinkRecord.passengerRequestExternalUser.id },
            data: {
              refreshToken: sessionToken,
              sessionExpiresAt: nextSessionExpiry(null, now)
            }
          }
        )
      })

      return buildExternalAuthPayload({
        subjectType: SUBJECT_TYPE.PASSENGER_REQUEST_EXTERNAL_USER,
        entity: updatedPassengerExternalUser,
        sessionToken
      })
    },

    adminExtendPassengerRequestExternalUserSession: async (
      _,
      { id },
      context
    ) => {
      await adminMiddleware(context)

      const user = await prisma.passengerRequestExternalUser.findUnique({
        where: { id }
      })
      if (!user || !user.active || !user.refreshToken) {
        throw new Error("External user has no active session")
      }

      const now = new Date()
      await prisma.passengerRequestExternalUser.update({
        where: { id },
        data: {
          sessionExpiresAt: nextSessionExpiry(user.sessionExpiresAt, now)
        }
      })

      return true
    },

    adminReissuePassengerRequestExternalUserMagicLink: async (
      _,
      { id },
      context
    ) => {
      await adminMiddleware(context)

      const user = await prisma.passengerRequestExternalUser.findUnique({
        where: { id }
      })
      if (!user || !user.active) {
        throw new Error("External user not found")
      }

      const adminId = context?.subjectType === "USER" ? context.subject.id : null
      if (!adminId) {
        throwForbidden("Only admins can reissue magic links")
      }

      const { rawToken, tokenHash } =
        await issueTokenForPassengerRequestExternalUser({
          passengerRequestExternalUserId: id,
          createdByAdminId: adminId
        })

      try {
        await sendExternalMagicLinkEmail({
          userEmail: user.email,
          token: rawToken,
          kind: "PASSENGER_REQUEST_EXTERNAL_USER"
        })
      } catch (error) {
        await prisma.passengerRequestExternalUserMagicLinkToken.deleteMany({
          where: { tokenHash, usedAt: null }
        })
        throw error
      }

      return true
    }
  }
}

export default externalAuthResolver

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
  EXTERNAL_USER: "EXTERNAL_USER",
  PASSENGER_REQUEST_EXTERNAL_USER: "PASSENGER_REQUEST_EXTERNAL_USER"
}

const PASSENGER_EXTERNAL_LOGIN_MAX_LENGTH = 64
const PASSENGER_EXTERNAL_LOGIN_SEGMENT_LENGTHS = {
  hotel: 24,
  city: 16,
  request: 12,
  accountType: 4
}

const CYRILLIC_TO_LATIN_MAP = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya"
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

const updatePassengerServiceHotelLink = async ({
  passengerRequestId,
  passengerServiceHotelItemId,
  link
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

  const livingService = passengerRequest.livingService || {
    plan: null,
    status: "NEW",
    times: null,
    hotels: [],
    evictions: []
  }
  const hotels = livingService.hotels || []
  let itemUpdated = false

  const updatedHotels = hotels.map((hotel) => {
    if (hotel?.itemId !== passengerServiceHotelItemId) {
      return hotel
    }

    itemUpdated = true
    return {
      ...hotel,
      link
    }
  })

  if (!itemUpdated) {
    throw new Error("PassengerServiceHotel item not found")
  }

  await prisma.passengerRequest.update({
    where: { id: passengerRequestId },
    data: {
      livingService: {
        ...livingService,
        hotels: updatedHotels
      }
    }
  })
}

const transliterateCyrillic = (value = "") =>
  value
    .split("")
    .map((char) => {
      const lower = char.toLowerCase()
      const mapped = CYRILLIC_TO_LATIN_MAP[lower]
      if (mapped === undefined) {
        return char
      }
      return char === lower ? mapped : mapped
    })
    .join("")

const toLoginSegment = (value, fallback, maxLength) => {
  const normalized = transliterateCyrillic(String(value || ""))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")

  const candidate = normalized || fallback
  return candidate.slice(0, maxLength).replace(/-+$/g, "") || fallback
}

const withLoginSuffix = (baseLogin, suffixNumber) => {
  if (!suffixNumber) {
    return baseLogin.slice(0, PASSENGER_EXTERNAL_LOGIN_MAX_LENGTH)
  }

  const suffix = `-${suffixNumber}`
  const maxBaseLength = PASSENGER_EXTERNAL_LOGIN_MAX_LENGTH - suffix.length
  const trimmedBase = baseLogin.slice(0, maxBaseLength).replace(/-+$/g, "")
  return `${trimmedBase}${suffix}`
}

const extractCityFromAddress = (address) => {
  if (!address || typeof address !== "string") {
    return null
  }

  const parts = address
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)

  if (parts.length === 0) {
    return null
  }

  const cityLikePart = parts.find((part) => /[a-zа-яё]/i.test(part))
  return cityLikePart || parts[0]
}

const resolvePassengerExternalLoginSource = async ({
  passengerRequestId,
  passengerServiceHotelItemId
}) => {
  const passengerRequest = await prisma.passengerRequest.findUnique({
    where: { id: passengerRequestId },
    select: {
      id: true,
      flightNumber: true,
      livingService: true
    }
  })

  if (!passengerRequest) {
    throw new Error("PassengerRequest not found")
  }

  const hotels = Array.isArray(passengerRequest.livingService?.hotels)
    ? passengerRequest.livingService.hotels
    : []

  let targetHotel = null
  if (passengerServiceHotelItemId) {
    targetHotel = hotels.find((hotel) => hotel?.itemId === passengerServiceHotelItemId)
  }
  if (!targetHotel) {
    targetHotel = hotels[0] || null
  }

  let hotelName = targetHotel?.name || null
  let city = extractCityFromAddress(targetHotel?.address)

  if ((!hotelName || !city) && targetHotel?.hotelId) {
    const hotelRecord = await prisma.hotel.findUnique({
      where: { id: targetHotel.hotelId },
      select: {
        name: true,
        information: true
      }
    })

    if (!hotelName) {
      hotelName = hotelRecord?.name || null
    }
    if (!city) {
      city = hotelRecord?.information?.city || null
    }
  }

  return {
    requestNumber: passengerRequest.flightNumber || null,
    hotelName,
    city
  }
}

const buildPassengerExternalBaseLogin = ({
  hotelName,
  city,
  requestNumber,
  accountType
}) => {
  const hotelSegment = toLoginSegment(
    hotelName,
    "hotel",
    PASSENGER_EXTERNAL_LOGIN_SEGMENT_LENGTHS.hotel
  )
  const citySegment = toLoginSegment(
    city,
    "city",
    PASSENGER_EXTERNAL_LOGIN_SEGMENT_LENGTHS.city
  )
  const requestSegment = toLoginSegment(
    requestNumber,
    "request",
    PASSENGER_EXTERNAL_LOGIN_SEGMENT_LENGTHS.request
  )
  const accountTypeSegment = toLoginSegment(
    accountType,
    "crm",
    PASSENGER_EXTERNAL_LOGIN_SEGMENT_LENGTHS.accountType
  )

  return `${hotelSegment}-${citySegment}-${requestSegment}-${accountTypeSegment}`
}

const generateUniquePassengerExternalLogin = async (baseLogin) => {
  let suffixNumber = 0

  // Keeps generating candidate logins until a free one is found.
  while (suffixNumber < 10000) {
    const candidate = withLoginSuffix(baseLogin, suffixNumber)
    const existing = await prisma.passengerRequestExternalUser.findUnique({
      where: { login: candidate },
      select: { id: true }
    })

    if (!existing) {
      return candidate
    }

    suffixNumber += 1
  }

  throw new Error("Unable to generate unique login")
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

  return { rawToken, tokenHash, magicLinkUrl }
}

const issueTokenForPassengerRequestExternalUser = async ({
  passengerRequestExternalUserId,
  createdByAdminId,
  linkType = "CRM"
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
  const magicLinkUrl = buildExternalMagicLink({
    token: rawToken,
    kind: SUBJECT_TYPE.PASSENGER_REQUEST_EXTERNAL_USER,
    linkType
  })
  const expiresAt = new Date(now.getTime() + EXTERNAL_MAGIC_LINK_TTL_MS)

  await prisma.passengerRequestExternalUserMagicLinkToken.create({
    data: {
      passengerRequestExternalUserId,
      tokenHash,
      rawToken,
      magicLinkUrl,
      expiresAt,
      createdByAdminId
    }
  })

  return { rawToken, tokenHash, magicLinkUrl }
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

      const { rawToken, magicLinkUrl } = await issueTokenForExternalUser({
        externalUserId: externalUser.id,
        createdByAdminId: adminId,
        linkType: "CRM"
      })

      let emailed = true
      try {
        await sendExternalMagicLinkEmail({
          userEmail: externalUser.email,
          token: rawToken,
          kind: "EXTERNAL_USER",
          linkType: "CRM"
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
          data: {
            usedAt: now,
            rawToken: null,
            magicLinkUrl: null
          }
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

      const { rawToken, magicLinkUrl } = await issueTokenForExternalUser({
        externalUserId,
        createdByAdminId: adminId,
        linkType: "CRM"
      })

      let emailed = true
      try {
        await sendExternalMagicLinkEmail({
          userEmail: externalUser.email,
          token: rawToken,
          kind: "EXTERNAL_USER",
          linkType: "CRM"
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

    adminIssuePassengerRequestExternalUserMagicLink: async (
      _,
      { input },
      context
    ) => {
      await adminMiddleware(context)

      const email =
        typeof input.email === "string" && input.email.trim()
          ? normalizeEmail(input.email)
          : null

      if (!["CRM", "PVA", "REPRESENTATIVE"].includes(input.accountType)) {
        throw new Error("Invalid accountType")
      }

      const adminId = context?.subjectType === "USER" ? context.subject.id : null
      if (!adminId) {
        throwForbidden("Only admins can issue magic links")
      }

      await validatePassengerServiceHotelItem({
        passengerRequestId: input.passengerRequestId,
        passengerServiceHotelItemId: input.passengerServiceHotelItemId
      })

      const loginSource = await resolvePassengerExternalLoginSource({
        passengerRequestId: input.passengerRequestId,
        passengerServiceHotelItemId: input.passengerServiceHotelItemId
      })
      const baseLogin = buildPassengerExternalBaseLogin({
        hotelName: loginSource.hotelName,
        city: loginSource.city,
        requestNumber: loginSource.requestNumber,
        accountType: input.accountType
      })

      let passengerExternalUser = null
      let createAttempts = 0
      while (!passengerExternalUser && createAttempts < 20) {
        const login = await generateUniquePassengerExternalLogin(baseLogin)
        try {
          passengerExternalUser = await prisma.passengerRequestExternalUser.create({
            data: {
              email,
              login,
              accountType: input.accountType,
              name: input.name || null,
              passengerRequestId: input.passengerRequestId,
              passengerServiceHotelItemId: input.passengerServiceHotelItemId || null,
              active: true
            }
          })
        } catch (error) {
          const isLoginConflict =
            error?.code === "P2002" &&
            (Array.isArray(error?.meta?.target)
              ? error.meta.target.includes("login")
              : false)

          if (!isLoginConflict) {
            throw error
          }

          createAttempts += 1
        }
      }

      if (!passengerExternalUser) {
        throw new Error("Unable to create external user account")
      }

      const { rawToken, magicLinkUrl } =
        await issueTokenForPassengerRequestExternalUser({
          passengerRequestExternalUserId: passengerExternalUser.id,
          createdByAdminId: adminId,
          linkType: input.accountType
        })

      await updatePassengerServiceHotelLink({
        passengerRequestId: passengerExternalUser.passengerRequestId,
        passengerServiceHotelItemId: passengerExternalUser.passengerServiceHotelItemId,
        link: magicLinkUrl
      })

      let emailed = false
      if (passengerExternalUser.email) {
        try {
          await sendExternalMagicLinkEmail({
            userEmail: passengerExternalUser.email,
            token: rawToken,
            kind: "PASSENGER_REQUEST_EXTERNAL_USER",
            linkType: passengerExternalUser.accountType
          })
          emailed = true
        } catch (error) {
          emailed = false
        }
      }

      return {
        success: true,
        emailed,
        link: magicLinkUrl
      }
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
            data: {
              usedAt: now,
              rawToken: null,
              magicLinkUrl: null
            }
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

      const { rawToken, magicLinkUrl } =
        await issueTokenForPassengerRequestExternalUser({
          passengerRequestExternalUserId: id,
          createdByAdminId: adminId,
          linkType: user.accountType || "CRM"
        })

      await updatePassengerServiceHotelLink({
        passengerRequestId: user.passengerRequestId,
        passengerServiceHotelItemId: user.passengerServiceHotelItemId,
        link: magicLinkUrl
      })

      let emailed = false
      if (user.email) {
        try {
          await sendExternalMagicLinkEmail({
            userEmail: user.email,
            token: rawToken,
            kind: "PASSENGER_REQUEST_EXTERNAL_USER",
            linkType: user.accountType || "CRM"
          })
          emailed = true
        } catch (error) {
          emailed = false
        }
      }

      return {
        success: true,
        emailed,
        link: magicLinkUrl
      }
    }
  }
}

export default externalAuthResolver

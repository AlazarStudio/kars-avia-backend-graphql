import { prisma } from "../../prisma.js"
import {
  createMagicLinkTokenPair,
  EXTERNAL_MAGIC_LINK_TTL_MS,
  normalizeEmail
} from "./externalMagicLink.js"
import { buildExternalMagicLink } from "./sendExternalMagicLinkEmail.js"

const SUBJECT_TYPE_EXT = "EXTERNAL_USER"

const buildExpiryDate = () =>
  new Date(Date.now() + EXTERNAL_MAGIC_LINK_TTL_MS)

const createMagicLinkRecord = async ({
  externalUserId,
  linkType,
  createdByAdminId = null,
  passengerRequestId = null,
  driverIndex,
  serviceKind
}) => {
  const { rawToken, tokenHash } = createMagicLinkTokenPair()
  const magicLinkUrl = buildExternalMagicLink({
    token: rawToken,
    kind: SUBJECT_TYPE_EXT,
    linkType,
    passengerRequestId,
    driverIndex,
    serviceKind
  })

  await prisma.externalUserMagicLinkToken.create({
    data: {
      externalUserId,
      tokenHash,
      rawToken,
      magicLinkUrl,
      expiresAt: buildExpiryDate(),
      createdByAdminId: createdByAdminId || undefined
    }
  })

  return magicLinkUrl
}

export const issueExternalLinksForUser = async ({
  externalUserId,
  createdByAdminId = null,
  passengerRequestId = null
}) => {
  const [linkCRM, linkPWA] = await Promise.all([
    createMagicLinkRecord({
      externalUserId,
      linkType: "CRM",
      createdByAdminId
    }),
    createMagicLinkRecord({
      externalUserId,
      linkType: "PWA",
      createdByAdminId,
      passengerRequestId
    })
  ])

  return { linkCRM, linkPWA }
}

export const issueExternalDriverPwaLink = async ({
  externalUserId,
  createdByAdminId = null,
  passengerRequestId,
  driverIndex,
  serviceKind
}) =>
  createMagicLinkRecord({
    externalUserId,
    linkType: "PWA",
    createdByAdminId,
    passengerRequestId,
    driverIndex,
    serviceKind
  })

export const upsertHotelExternalUser = async ({ hotelId, name }) => {
  const autoEmail = normalizeEmail(`hotel-${hotelId}@auto.internal`)
  return prisma.externalUser.upsert({
    where: { email: autoEmail },
    create: {
      email: autoEmail,
      name: name || null,
      scope: "HOTEL",
      accessType: "CRM",
      hotelId,
      active: true
    },
    update: {
      name: name || undefined,
      scope: "HOTEL",
      hotelId,
      active: true
    }
  })
}

export const upsertRepresentativeExternalUser = async ({
  representativeDepartmentId,
  name
}) => {
  const autoEmail = normalizeEmail(
    `representative-${representativeDepartmentId}@auto.internal`
  )

  return prisma.externalUser.upsert({
    where: { email: autoEmail },
    create: {
      email: autoEmail,
      name: name || null,
      scope: "REPRESENTATIVE",
      accessType: "CRM",
      active: true
    },
    update: {
      name: name || undefined,
      scope: "REPRESENTATIVE",
      active: true
    }
  })
}

export const upsertDriverExternalUser = async ({ requestId, driverName, serviceKind, driverIndex }) => {
  const autoEmail = normalizeEmail(
    `driver-${requestId}-${serviceKind}-${driverIndex}@auto.internal`
  )

  return prisma.externalUser.upsert({
    where: { email: autoEmail },
    create: {
      email: autoEmail,
      name: driverName || null,
      scope: "DRIVER",
      accessType: "CRM",
      active: true
    },
    update: {
      name: driverName || undefined,
      active: true
    }
  })
}

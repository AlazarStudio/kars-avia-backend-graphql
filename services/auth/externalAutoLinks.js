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
  driverId,
  serviceKind
}) => {
  const { rawToken, tokenHash } = createMagicLinkTokenPair()
  const magicLinkUrl = buildExternalMagicLink({
    token: rawToken,
    kind: SUBJECT_TYPE_EXT,
    linkType,
    passengerRequestId,
    driverIndex,
    driverId,
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
  driverId,
  serviceKind
}) =>
  createMagicLinkRecord({
    externalUserId,
    linkType: "PWA",
    createdByAdminId,
    passengerRequestId,
    driverIndex,
    driverId,
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

export const buildRepresentativeExternalKey = ({
  airlineId,
  airportId
}) => {
  const safeAirlineId = String(airlineId || "unknown-airline").trim()
  const safeAirportId = String(airportId || "no-airport").trim()
  return `${safeAirlineId}-${safeAirportId}`
}

export const upsertRepresentativeExternalUser = async ({
  representativeKey,
  name
}) => {
  const autoEmail = normalizeEmail(`representative-${representativeKey}@auto.internal`)

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

// Ключ внешнего пользователя водителя. Для новых водителей это их id:
// адрес по индексу схлопывает разных водителей в одного, если удалить
// водителя из середины и добавить нового. Индексная форма оставлена для
// ссылок, выпущенных до появления id.
const buildDriverExternalEmail = ({ requestId, serviceKind, driverIndex, driverId }) =>
  normalizeEmail(
    driverId
      ? `driver-${requestId}-${serviceKind}-${driverId}@auto.internal`
      : `driver-${requestId}-${serviceKind}-${driverIndex}@auto.internal`
  )

// Гасит доступ, выпущенный на старый адрес водителя. Ссылка одноразовая, но
// повторный клик по использованной ссылке возвращает активную сессию
// (см. signInExternalUserByMagicLink) и снова записывает старый адрес в PWA.
export const revokeDriverExternalAccess = async ({
  requestId,
  serviceKind,
  driverIndex
}) => {
  const externalUser = await prisma.externalUser.findUnique({
    where: { email: buildDriverExternalEmail({ requestId, serviceKind, driverIndex }) }
  })
  if (!externalUser) return

  await prisma.externalUserMagicLinkToken.updateMany({
    where: { externalUserId: externalUser.id, usedAt: null },
    data: { usedAt: new Date(), rawToken: null, magicLinkUrl: null }
  })
  await prisma.externalUser.update({
    where: { id: externalUser.id },
    data: { refreshToken: null, sessionExpiresAt: null }
  })
}

export const upsertDriverExternalUser = async ({ requestId, driverName, serviceKind, driverIndex, driverId }) => {
  const autoEmail = buildDriverExternalEmail({
    requestId,
    serviceKind,
    driverIndex,
    driverId
  })

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

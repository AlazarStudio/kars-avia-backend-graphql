import jwt from "jsonwebtoken"
import { prisma } from "../../prisma.js"
import {
  createMagicLinkTokenPair,
  hashMagicLinkToken
} from "../auth/externalMagicLink.js"

const MIN_PREVIEW_HOURS = 1
const MAX_PREVIEW_HOURS = 72
const SUBJECT_TYPE = "HOTEL_PREVIEW"

const normalizeBaseUrl = (url) => {
  if (!url || typeof url !== "string") {
    return null
  }
  const trimmed = url.trim()
  if (!trimmed) {
    return null
  }
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed
}

const buildPreviewBaseUrl = () =>
  normalizeBaseUrl(process.env.URL_CRM) ||
  normalizeBaseUrl(process.env.EXTERNAL_MAGIC_LINK_BASE_URL) ||
  normalizeBaseUrl(process.env.FRONTEND_URL) ||
  "https://karsavia.ru"

export const clampPreviewHours = (hours) => {
  const value = Number(hours)
  if (!Number.isFinite(value)) {
    return MIN_PREVIEW_HOURS
  }
  return Math.max(MIN_PREVIEW_HOURS, Math.min(MAX_PREVIEW_HOURS, Math.floor(value)))
}

export const buildHotelPreviewUrl = (rawToken) => {
  const baseUrl = buildPreviewBaseUrl()
  const safeToken = encodeURIComponent(rawToken)
  return `${baseUrl}/hotel-preview?token=${safeToken}`
}

export const collectHotelPreviewFilePaths = (hotel) => {
  if (!hotel) {
    return new Set()
  }

  const paths = new Set()

  const addPath = (path) => {
    if (typeof path === "string" && path.trim()) {
      paths.add(path.trim().replace(/\\/g, "/"))
    }
  }

  for (const path of hotel.images || []) {
    addPath(path)
  }
  for (const path of hotel.gallery || []) {
    addPath(path)
  }
  for (const room of hotel.rooms || []) {
    for (const path of room.images || []) {
      addPath(path)
    }
  }
  for (const kind of hotel.roomKind || []) {
    for (const path of kind.images || []) {
      addPath(path)
    }
  }
  for (const service of hotel.additionalServices || []) {
    for (const path of service.images || []) {
      addPath(path)
    }
  }

  return paths
}

export const isHotelPreviewFilePathAllowed = (hotel, normalizedPath) => {
  const allowedPaths = collectHotelPreviewFilePaths(hotel)
  const target = normalizedPath.replace(/^\/+/, "").replace(/\\/g, "/")

  for (const allowed of allowedPaths) {
    const normalizedAllowed = allowed
      .replace(/^\/+/, "")
      .replace(/^files\//, "")
      .replace(/\\/g, "/")

    if (
      target === normalizedAllowed ||
      target.endsWith(`/${normalizedAllowed}`) ||
      normalizedAllowed.endsWith(`/${target}`)
    ) {
      return true
    }
  }

  return false
}

export const findValidHotelPreviewLink = async (rawToken, now = new Date()) => {
  if (!rawToken || typeof rawToken !== "string") {
    return null
  }

  const tokenHash = hashMagicLinkToken(rawToken.trim())
  const link = await prisma.hotelPreviewLink.findUnique({
    where: { tokenHash },
    include: {
      hotel: {
        select: { id: true, active: true }
      }
    }
  })

  if (!link || !link.hotel?.active) {
    return null
  }

  if (link.expiresAt.getTime() <= now.getTime()) {
    return null
  }

  return link
}

export const buildHotelPreviewAuthPayload = (link) => {
  const now = new Date()
  const expiresAtMs = link.expiresAt.getTime()
  const expiresInSeconds = Math.max(
    1,
    Math.floor((expiresAtMs - now.getTime()) / 1000)
  )

  const token = jwt.sign(
    {
      subjectType: SUBJECT_TYPE,
      hotelId: link.hotelId,
      previewTokenHash: link.tokenHash,
      sessionToken: link.tokenHash
    },
    process.env.JWT_SECRET,
    { expiresIn: expiresInSeconds }
  )

  return {
    token,
    expiresAt: link.expiresAt,
    hotelId: link.hotelId
  }
}

export const createHotelPreviewLinkRecord = async ({
  hotelId,
  hours,
  createdByAdminId = null
}) => {
  const hotel = await prisma.hotel.findUnique({
    where: { id: hotelId },
    select: { id: true, active: true, name: true }
  })

  if (!hotel || !hotel.active) {
    throw new Error("Hotel not found")
  }

  const clampedHours = clampPreviewHours(hours)
  const now = new Date()
  const expiresAt = new Date(now.getTime() + clampedHours * 60 * 60 * 1000)
  const { rawToken, tokenHash } = createMagicLinkTokenPair()

  await prisma.hotelPreviewLink.create({
    data: {
      hotelId,
      tokenHash,
      expiresAt,
      createdByAdminId: createdByAdminId || undefined
    }
  })

  return {
    link: buildHotelPreviewUrl(rawToken),
    expiresAt,
    hotelId,
    hotelName: hotel.name
  }
}

const HOTEL_PREVIEW_INCLUDE = {
  rooms: true,
  roomKind: true,
  additionalServices: true,
  airport: true
}

export const loadHotelPreviewData = async (hotelId) => {
  const hotel = await prisma.hotel.findUnique({
    where: { id: hotelId },
    include: HOTEL_PREVIEW_INCLUDE
  })

  if (!hotel || !hotel.active) {
    return null
  }

  return hotel
}

export const loadHotelPreviewDataForFileAccess = async (hotelId) =>
  prisma.hotel.findUnique({
    where: { id: hotelId },
    select: {
      id: true,
      active: true,
      images: true,
      gallery: true,
      rooms: { select: { images: true } },
      roomKind: { select: { images: true } },
      additionalServices: { select: { images: true } }
    }
  })

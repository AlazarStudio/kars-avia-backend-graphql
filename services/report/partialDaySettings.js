import { prisma } from "../../prisma.js"

export const getDefaultPartialDayRules = () => ({
  arrivalFullBefore: "06:00",
  arrivalHalfBefore: "14:00",
  departureHalfAfter: "12:00",
  departureFullAfter: "18:00",
  arrivalFullDays: 1,
  arrivalHalfDays: 0.5,
  departureHalfDays: 0.5,
  departureFullDays: 1
})

const HHMM_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/

export const parseHhMmToMinutes = (hhmm) => {
  const m = String(hhmm || "").trim().match(HHMM_RE)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

export const assertValidHhMm = (value, field) => {
  if (parseHhMmToMinutes(value) == null) {
    throw new Error(`Invalid time for ${field}: expected HH:mm`)
  }
}

export const settingToRules = (setting) => {
  if (!setting) return null
  return {
    arrivalFullBefore: setting.arrivalFullBefore,
    arrivalHalfBefore: setting.arrivalHalfBefore,
    departureHalfAfter: setting.departureHalfAfter,
    departureFullAfter: setting.departureFullAfter,
    arrivalFullDays: setting.arrivalFullDays,
    arrivalHalfDays: setting.arrivalHalfDays,
    departureHalfDays: setting.departureHalfDays,
    departureFullDays: setting.departureFullDays
  }
}

/** Нормализует rules в минуты + коэффициенты для расчёта суток. */
export const rulesToCalcConfig = (rules) => {
  const r = { ...getDefaultPartialDayRules(), ...(rules || {}) }
  return {
    arrivalFullBeforeMin: parseHhMmToMinutes(r.arrivalFullBefore) ?? 6 * 60,
    arrivalHalfBeforeMin: parseHhMmToMinutes(r.arrivalHalfBefore) ?? 14 * 60,
    departureHalfAfterMin: parseHhMmToMinutes(r.departureHalfAfter) ?? 12 * 60,
    departureFullAfterMin: parseHhMmToMinutes(r.departureFullAfter) ?? 18 * 60,
    arrivalFullDays: Number(r.arrivalFullDays) || 0,
    arrivalHalfDays: Number(r.arrivalHalfDays) || 0,
    departureHalfDays: Number(r.departureHalfDays) || 0,
    departureFullDays: Number(r.departureFullDays) || 0
  }
}

export const ensureGlobalPartialDaySetting = async () => {
  const existing = await prisma.reportPartialDaySetting.findFirst({
    where: { level: "GLOBAL" }
  })
  if (existing) return existing
  const defaults = getDefaultPartialDayRules()
  return prisma.reportPartialDaySetting.create({
    data: {
      level: "GLOBAL",
      ...defaults
    }
  })
}

/**
 * airline-отчёт: global + airline override
 * hotel-отчёт: global + hotel override
 */
export const resolvePartialDayRules = async ({
  reportType,
  airlineId,
  hotelId
} = {}) => {
  const defaults = getDefaultPartialDayRules()
  const global =
    (await prisma.reportPartialDaySetting.findFirst({
      where: { level: "GLOBAL" }
    })) || null

  let rules = { ...defaults, ...settingToRules(global) }

  if (reportType === "airline" && airlineId) {
    const override = await prisma.reportPartialDaySetting.findFirst({
      where: { level: "AIRLINE", airlineId }
    })
    if (override) rules = { ...rules, ...settingToRules(override) }
  } else if (reportType === "hotel" && hotelId) {
    const override = await prisma.reportPartialDaySetting.findFirst({
      where: { level: "HOTEL", hotelId }
    })
    if (override) rules = { ...rules, ...settingToRules(override) }
  }

  return rules
}

const validateLevelEntity = ({ level, airlineId, hotelId }) => {
  if (level === "GLOBAL") {
    if (airlineId || hotelId) {
      throw new Error("GLOBAL setting must not have airlineId or hotelId")
    }
    return
  }
  if (level === "AIRLINE") {
    if (!airlineId || hotelId) {
      throw new Error("AIRLINE setting requires airlineId and no hotelId")
    }
    return
  }
  if (level === "HOTEL") {
    if (!hotelId || airlineId) {
      throw new Error("HOTEL setting requires hotelId and no airlineId")
    }
    return
  }
  throw new Error(`Unknown level: ${level}`)
}

export const upsertPartialDaySetting = async (input) => {
  const {
    id,
    level,
    airlineId = null,
    hotelId = null,
    arrivalFullBefore,
    arrivalHalfBefore,
    departureHalfAfter,
    departureFullAfter,
    arrivalFullDays,
    arrivalHalfDays,
    departureHalfDays,
    departureFullDays
  } = input

  validateLevelEntity({ level, airlineId, hotelId })

  const defaults = getDefaultPartialDayRules()
  const data = {
    level,
    airlineId: level === "AIRLINE" ? airlineId : null,
    hotelId: level === "HOTEL" ? hotelId : null,
    arrivalFullBefore: arrivalFullBefore ?? defaults.arrivalFullBefore,
    arrivalHalfBefore: arrivalHalfBefore ?? defaults.arrivalHalfBefore,
    departureHalfAfter: departureHalfAfter ?? defaults.departureHalfAfter,
    departureFullAfter: departureFullAfter ?? defaults.departureFullAfter,
    arrivalFullDays:
      arrivalFullDays != null ? arrivalFullDays : defaults.arrivalFullDays,
    arrivalHalfDays:
      arrivalHalfDays != null ? arrivalHalfDays : defaults.arrivalHalfDays,
    departureHalfDays:
      departureHalfDays != null
        ? departureHalfDays
        : defaults.departureHalfDays,
    departureFullDays:
      departureFullDays != null ? departureFullDays : defaults.departureFullDays
  }

  assertValidHhMm(data.arrivalFullBefore, "arrivalFullBefore")
  assertValidHhMm(data.arrivalHalfBefore, "arrivalHalfBefore")
  assertValidHhMm(data.departureHalfAfter, "departureHalfAfter")
  assertValidHhMm(data.departureFullAfter, "departureFullAfter")

  if (id) {
    const existing = await prisma.reportPartialDaySetting.findUnique({
      where: { id }
    })
    if (!existing) throw new Error("ReportPartialDaySetting not found")
    return prisma.reportPartialDaySetting.update({ where: { id }, data })
  }

  if (level === "GLOBAL") {
    const existing = await prisma.reportPartialDaySetting.findFirst({
      where: { level: "GLOBAL" }
    })
    if (existing) {
      return prisma.reportPartialDaySetting.update({
        where: { id: existing.id },
        data
      })
    }
  } else if (level === "AIRLINE") {
    const existing = await prisma.reportPartialDaySetting.findFirst({
      where: { level: "AIRLINE", airlineId }
    })
    if (existing) {
      return prisma.reportPartialDaySetting.update({
        where: { id: existing.id },
        data
      })
    }
  } else if (level === "HOTEL") {
    const existing = await prisma.reportPartialDaySetting.findFirst({
      where: { level: "HOTEL", hotelId }
    })
    if (existing) {
      return prisma.reportPartialDaySetting.update({
        where: { id: existing.id },
        data
      })
    }
  }

  return prisma.reportPartialDaySetting.create({ data })
}

export const deletePartialDaySetting = async (id) => {
  const existing = await prisma.reportPartialDaySetting.findUnique({
    where: { id }
  })
  if (!existing) throw new Error("ReportPartialDaySetting not found")
  if (existing.level === "GLOBAL") {
    throw new Error("Cannot delete GLOBAL setting; upsert defaults instead")
  }
  await prisma.reportPartialDaySetting.delete({ where: { id } })
  return true
}

export const listPartialDaySettings = async ({
  level,
  airlineId,
  hotelId
} = {}) => {
  await ensureGlobalPartialDaySetting()
  const where = {}
  if (level) where.level = level
  if (airlineId) where.airlineId = airlineId
  if (hotelId) where.hotelId = hotelId
  return prisma.reportPartialDaySetting.findMany({
    where,
    include: { airline: true, hotel: true },
    orderBy: [{ level: "asc" }, { updatedAt: "desc" }]
  })
}

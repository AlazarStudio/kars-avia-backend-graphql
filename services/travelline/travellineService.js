import { prisma } from "../../prisma.js"
import { logger } from "../infra/logger.js"
import { publishRequestUpdated } from "../infra/subscriptionPayloads.js"
import calculateMeal from "../meal/calculateMeal.js"

const DEFAULT_BASE_URL = "https://partner.qatl.ru"
const CLIENT_ID_KEY = "travelline.client_id"
const CLIENT_SECRET_KEY = "travelline.client_secret"
const BASE_URL_KEY = "travelline.base_url"

// TravelLine mealPlanCode → наш MealPlan (что фактически входит)
function mapTlMealPlanCode(code) {
  if (!code) return null
  const c = String(code).toLowerCase()
  const has = (...keys) => keys.some((k) => c.includes(k))
  if (has("allinclusive", "ai")) {
    return { included: true, breakfastEnabled: true, lunchEnabled: true, dinnerEnabled: true }
  }
  if (has("fullboard", "fb")) {
    return { included: true, breakfastEnabled: true, lunchEnabled: true, dinnerEnabled: true }
  }
  if (has("halfboard", "hb")) {
    return { included: true, breakfastEnabled: true, lunchEnabled: false, dinnerEnabled: true }
  }
  if (has("breakfast", "bb")) {
    return { included: true, breakfastEnabled: true, lunchEnabled: false, dinnerEnabled: false }
  }
  // RoomOnly / RO / Без питания / unknown
  return { included: false, breakfastEnabled: false, lunchEnabled: false, dinnerEnabled: false }
}

const PREFIX_CONTENT = "/api/content"
const PREFIX_SEARCH = "/api/search"
const PREFIX_RESERVATION = "/api/reservation"
const PREFIX_READ_RESERVATION = "/api/read-reservation"

class TravellineService {
  constructor() {
    this.tokenCache = null
    this.citiesCache = new Map() // countryCode -> { items: [{id, name, ...}], expiresAt }
  }

  // ─── City name → cityId lookup (with cache) ──────────────────────────────

  async findCityIdByName(name, countryCode = "RUS") {
    if (!name || typeof name !== "string") return null
    const cc = countryCode.toUpperCase()
    const cached = this.citiesCache.get(cc)
    let items
    if (cached && cached.expiresAt > Date.now()) {
      items = cached.items
    } else {
      try {
        items = await this.getCities(cc)
        this.citiesCache.set(cc, { items, expiresAt: Date.now() + 24 * 60 * 60 * 1000 })
      } catch (err) {
        logger.warn(`findCityIdByName: getCities failed: ${err?.message}`)
        return null
      }
    }
    const target = name.toLowerCase().trim()
    const found = items.find((c) => (c.name ?? "").toLowerCase().trim() === target)
    return found?.id ?? null
  }

  async getHotelsByLocalCityName(name, countryCode = "RUS") {
    try {
      const cityId = await this.findCityIdByName(name, countryCode)
      if (!cityId) return []
      const result = await this.searchPropertiesByCity(cityId, 200)
      return result?.items ?? []
    } catch (err) {
      logger.warn(`getHotelsByLocalCityName(${name}): ${err?.message}`)
      return []
    }
  }

  // Найти или создать локальный Hotel-двойник для TravelLine property
  async ensureTravellineHotel(propertyId) {
    if (!propertyId) return null
    const externalId = String(propertyId)
    const existing = await prisma.hotel.findFirst({
      where: { externalSource: "travelline", externalId }
    })
    if (existing) {
      // Если у старой записи нет времён питания — допишем дефолтные
      if (!existing.breakfast) {
        try {
          return await prisma.hotel.update({
            where: { id: existing.id },
            data: {
              breakfast: { start: "07:00", end: "10:00" },
              lunch: { start: "12:00", end: "15:00" },
              dinner: { start: "18:00", end: "21:00" }
            }
          })
        } catch (err) {
          logger.warn(`ensureTravellineHotel: backfill meal times failed: ${err?.message}`)
        }
      }
      return existing
    }

    let prop = null
    try {
      prop = await this.getProperty(propertyId)
    } catch (err) {
      logger.warn(`ensureTravellineHotel: getProperty(${propertyId}) failed: ${err?.message}`)
    }

    const created = await prisma.hotel.create({
      data: {
        name: prop?.name ?? `TravelLine ${externalId}`,
        images: Array.isArray(prop?.photos) ? prop.photos : [],
        stars: prop?.stars ?? null,
        external: true,
        externalSource: "travelline",
        externalId,
        active: true,
        show: false,
        // Дефолтные времена приёмов пищи, чтобы calculateMeal мог посчитать порции
        breakfast: { start: "07:00", end: "10:00" },
        lunch: { start: "12:00", end: "15:00" },
        dinner: { start: "18:00", end: "21:00" },
        information: {
          country: prop?.address?.country ?? "",
          city: prop?.address?.city ?? "",
          address: prop?.address?.street ?? ""
        }
      }
    })
    logger.info(`ensureTravellineHotel: created virtual Hotel ${created.id} for property ${externalId}`)
    return created
  }

  // ─── Config ────────────────────────────────────────────────────────────────

  async getConfig() {
    const settings = await prisma.systemSetting.findMany({
      where: { key: { in: [CLIENT_ID_KEY, BASE_URL_KEY] } }
    })
    const clientId = settings.find((s) => s.key === CLIENT_ID_KEY)?.value ?? null
    const baseUrl = settings.find((s) => s.key === BASE_URL_KEY)?.value ?? DEFAULT_BASE_URL
    return { clientId, baseUrl, isConfigured: !!clientId }
  }

  async setConfig(clientId, clientSecret, baseUrl) {
    const upserts = [
      { key: CLIENT_ID_KEY, value: clientId, label: "TravelLine Client ID" },
      { key: CLIENT_SECRET_KEY, value: clientSecret, label: "TravelLine Client Secret" },
      { key: BASE_URL_KEY, value: baseUrl, label: "TravelLine Base URL" }
    ]
    for (const u of upserts) {
      await prisma.systemSetting.upsert({
        where: { key: u.key },
        create: { key: u.key, value: u.value, type: "string", group: "travelline", label: u.label },
        update: { value: u.value }
      })
    }
    this.tokenCache = null
    return true
  }

  // ─── OAuth2: получить access token ────────────────────────────────────────

  async getAccessToken() {
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now() + 60_000) {
      return this.tokenCache.accessToken
    }

    const settings = await prisma.systemSetting.findMany({
      where: { key: { in: [CLIENT_ID_KEY, CLIENT_SECRET_KEY, BASE_URL_KEY] } }
    })
    const clientId = settings.find((s) => s.key === CLIENT_ID_KEY)?.value
    const clientSecret = settings.find((s) => s.key === CLIENT_SECRET_KEY)?.value
    const baseUrl = settings.find((s) => s.key === BASE_URL_KEY)?.value ?? DEFAULT_BASE_URL

    if (!clientId || !clientSecret) {
      throw new Error("TravelLine: clientId и clientSecret не настроены.")
    }

    const tokenUrl = `${baseUrl}/auth/token`
    logger.info(`TravelLine: получение access token → ${tokenUrl}`)

    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret
    })

    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString()
    })

    const text = await res.text()
    if (!res.ok) {
      throw new Error(`TravelLine OAuth2 error ${res.status}: ${text}`)
    }

    let data
    try {
      data = JSON.parse(text)
    } catch {
      throw new Error(`TravelLine OAuth2: неожиданный ответ: ${text}`)
    }

    const accessToken = data.access_token ?? data.token
    const expiresIn = data.expires_in ?? 3600

    if (!accessToken) {
      throw new Error(`TravelLine OAuth2: access_token не получен. Ответ: ${text}`)
    }

    this.tokenCache = { accessToken, expiresAt: Date.now() + expiresIn * 1000 }
    logger.info(`TravelLine: access token получен, действует ${expiresIn} сек.`)
    return accessToken
  }

  // ─── HTTP client ───────────────────────────────────────────────────────────

  async request(method, fullPath, body) {
    const accessToken = await this.getAccessToken()

    const settings = await prisma.systemSetting.findMany({
      where: { key: BASE_URL_KEY }
    })
    const baseUrl = settings[0]?.value ?? DEFAULT_BASE_URL
    const url = `${baseUrl}${fullPath}`
    logger.info(`TravelLine ${method} ${url}`)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 20_000)

    let res
    try {
      res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal
      })
    } finally {
      clearTimeout(timeoutId)
    }

    const text = await res.text()
    let data
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }

    if (!res.ok) {
      if (res.status === 401) {
        this.tokenCache = null
        throw new Error(`TravelLine: ошибка авторизации (401). Проверьте clientId/clientSecret.`)
      }
      throw new Error(`TravelLine API error ${res.status}: ${text}`)
    }

    return { data, status: res.status, raw: text }
  }

  // ─── Raw proxy ─────────────────────────────────────────────────────────────

  async rawRequest(input) {
    let accessToken
    try {
      accessToken = await this.getAccessToken()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { status: 0, body: message, ok: false }
    }

    const settings = await prisma.systemSetting.findMany({
      where: { key: BASE_URL_KEY }
    })
    const baseUrl = settings[0]?.value ?? DEFAULT_BASE_URL
    const url = `${baseUrl}${input.path}`
    logger.info(`TravelLine RAW ${input.method} ${url}`)

    let res
    try {
      res = await fetch(url, {
        method: input.method.toUpperCase(),
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: input.body ?? undefined
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { status: 0, body: `Network error: ${message}`, ok: false }
    }

    const body = await res.text()
    return { status: res.status, body, ok: res.ok }
  }

  // ─── Geo API ───────────────────────────────────────────────────────────────

  async getCities(countryCode = "RUS") {
    const { data } = await this.request("GET", `/api/geo/v1/countries/${countryCode}/cities`)
    const items = data?.cities ?? []
    return items.map((c) => ({
      id: String(c.id),
      name: c.name,
      regionId: c.regionId ? String(c.regionId) : null,
      countryCode: c.countryCode ?? countryCode
    }))
  }

  async searchPropertiesByCity(cityId, count = 200) {
    const { data: geoData } = await this.request("GET", `/api/geo/v1/cities/${cityId}/properties`)
    const propertyIds = (geoData?.properties ?? []).map((p) => String(p.id ?? p))

    if (propertyIds.length === 0) {
      return { items: [], total: 0, page: 1, pageSize: count }
    }

    const qs = `?include=All&count=${Math.min(count, 200)}`
    const { data } = await this.request("GET", `/api/content/v1/properties${qs}`)
    const allProps = data?.properties ?? []

    const idSet = new Set(propertyIds)
    const filtered = allProps.filter((p) => idSet.has(String(p.id)))
    const items = filtered.map((p) => this.mapProperty(p))

    return { items, total: items.length, page: 1, pageSize: count }
  }

  // ─── Content API ───────────────────────────────────────────────────────────

  async searchProperties(filter = {}) {
    const count = filter.pageSize ?? 50
    const qs = `?include=All&count=${Math.min(count, 200)}`
    const { data } = await this.request("GET", `${PREFIX_CONTENT}/v1/properties${qs}`)

    let rawItems = Array.isArray(data) ? data : (data?.properties ?? data?.items ?? [])

    if (filter.city) {
      const q = filter.city.toLowerCase()
      rawItems = rawItems.filter((p) => {
        const addr = p.contactInfo?.address ?? p.address
        return addr?.cityName?.toLowerCase().includes(q) || addr?.city?.toLowerCase().includes(q)
      })
    }

    const items = rawItems.map((p) => this.mapProperty(p))

    return {
      items,
      total: items.length,
      page: 1,
      pageSize: count
    }
  }

  async getProperty(propertyId) {
    const { data, raw } = await this.request("GET", `${PREFIX_CONTENT}/v1/properties/${propertyId}`)
    return this.mapProperty(data, raw)
  }

  async getRoomTypes(propertyId) {
    const { data } = await this.request(
      "GET",
      `${PREFIX_CONTENT}/v1/properties/${propertyId}?include=All`
    )

    logger.info(`getRoomTypes(${propertyId}): keys=${Object.keys(data ?? {}).join(",")}`)

    const items =
      data?.roomTypes ??
      data?.roomCategories ??
      data?.roomTypeCategories ??
      data?.rooms ??
      []

    if (items.length > 0) {
      return items.map((r) => this.mapRoomType(r))
    }

    const { data: catData } = await this.request("GET", `${PREFIX_CONTENT}/v1/room-type-categories`)
    const catItems = Array.isArray(catData) ? catData : (catData?.items ?? catData?.roomTypeCategories ?? [])
    return catItems.map((r) => this.mapRoomType(r))
  }

  async getRatePlans(_propertyId) {
    return []
  }

  // ─── Search API ────────────────────────────────────────────────────────────

  async searchAvailability(input) {
    const arrival = new Date(input.arrival)
    const departure = new Date(input.departure)
    const nights = Math.max(1, Math.round((departure.getTime() - arrival.getTime()) / 86400000))

    const childAges =
      input.childAges && input.childAges.length > 0
        ? input.childAges
        : (input.children ?? 0) > 0
        ? Array(input.children).fill(10)
        : []

    const params = new URLSearchParams({
      arrivalDate: String(input.arrival).slice(0, 10),
      departureDate: String(input.departure).slice(0, 10),
      adults: String(input.adults ?? 1)
    })
    childAges.forEach((age) => params.append("childAges", String(age)))

    const { data, raw } = await this.request(
      "GET",
      `${PREFIX_SEARCH}/v1/properties/${input.propertyId}/room-stays?${params.toString()}`
    )

    const roomStays = data?.roomStays ?? []
    logger.info(`searchAvailability(${input.propertyId}): ${roomStays.length} roomStays`)

    const seen = new Set()
    const rates = []

    for (const stay of roomStays) {
      const roomTypeId = stay.roomType?.id ?? ""
      const ratePlanId = stay.ratePlan?.id ?? ""
      const dedupKey = `${roomTypeId}::${ratePlanId}`
      if (seen.has(dedupKey)) continue
      seen.add(dedupKey)

      const stayTotal = stay.total?.priceBeforeTax ?? 0
      const taxAmount = stay.total?.taxAmount ?? 0
      const pricePerNight = nights > 0 ? stayTotal / nights : stayTotal

      const tz = stay.timeZone ?? stay.timezone ?? stay.propertyTimeZone ?? null

      const cp = stay.cancellationPolicy
      const cancellationPolicies =
        cp && cp.penaltyAmount != null && cp.penaltyAmount > 0
          ? [
              {
                amount: cp.penaltyAmount ?? 0,
                deadline: cp.freeCancellationDeadlineLocal ?? cp.freeCancellationDeadlineUtc ?? "",
                timezone: cp.timeZone ?? cp.timezone ?? tz ?? null
              }
            ]
          : []

      const placements = stay.roomType?.placements ?? []

      rates.push({
        roomTypeId,
        roomTypeName: stay.fullPlacementsName ?? stay.roomType?.name ?? roomTypeId,
        maxOccupancy: stay.guestCount?.adults ?? null,
        ratePlanId,
        ratePlanName:
          stay.ratePlan?.name && stay.ratePlan.name !== ratePlanId
            ? stay.ratePlan.name
            : [stay.mealPlanCode, stay.ratePlan?.description].filter(Boolean).join(" · ") || `Тариф ${ratePlanId}`,
        priceBeforeTax: pricePerNight,
        totalPrice: stayTotal,
        tax: taxAmount > 0 ? taxAmount : null,
        currency: stay.currencyCode ?? "RUB",
        availableRooms: stay.availability ?? null,
        mealType: stay.mealPlanCode ?? null,
        checkInTime: stay.stayDates?.arrivalDateTime ?? null,
        checkOutTime: stay.stayDates?.departureDateTime ?? null,
        timezone: tz,
        cancellationPolicies: cancellationPolicies.length > 0 ? cancellationPolicies : null,
        checksum: stay.checksum ?? null,
        roomTypePlacements: placements.map((p) => p.code).filter(Boolean),
        placements: placements.map((p) => ({
          code: p.code ?? "",
          name: p.name ?? p.description ?? null,
          type: p.placementType ?? p.type ?? null,
          capacity: p.capacity ?? p.count ?? null
        })),
        raw: JSON.stringify(stay)
      })
    }

    return {
      propertyId: input.propertyId,
      rates,
      nights,
      raw
    }
  }

  // ─── Verify booking ──────────────────────────────────────────────────────

  buildRoomStay(opts) {
    const timePart = (dt) => {
      if (!dt) return "00:00"
      const tIdx = dt.indexOf("T")
      if (tIdx !== -1) return dt.slice(tIdx + 1, tIdx + 6)
      if (/^\d{2}:\d{2}/.test(dt)) return dt.slice(0, 5)
      return "00:00"
    }
    const arrivalDate = opts.arrival.slice(0, 10)
    const departureDate = opts.departure.slice(0, 10)

    const roomStay = {
      roomType: {
        id: opts.roomTypeId,
        placements: (opts.roomTypePlacements ?? []).map((code) => ({ code }))
      },
      ratePlan: { id: opts.ratePlanId },
      stayDates: {
        arrivalDateTime: `${arrivalDate}T${timePart(opts.checkInTime)}`,
        departureDateTime: `${departureDate}T${timePart(opts.checkOutTime)}`
      },
      guestCount: {
        adultCount: opts.adults,
        ...(opts.childAges.length > 0 ? { childAges: opts.childAges } : {})
      },
      guests: opts.guests,
      ...(opts.checksum ? { checksum: opts.checksum } : {})
    }
    return roomStay
  }

  async verifyBooking(input) {
    const roomStay = this.buildRoomStay({
      roomTypeId: input.roomTypeId,
      roomTypePlacements: input.roomTypePlacements,
      ratePlanId: input.ratePlanId,
      arrival: input.arrival,
      departure: input.departure,
      adults: input.adults ?? 1,
      childAges: input.childAges ?? [],
      guests: [{ firstName: "Guest", lastName: "Guest" }],
      checksum: input.checksum,
      checkInTime: input.checkInTime,
      checkOutTime: input.checkOutTime
    })

    const body = {
      booking: {
        propertyId: input.propertyId,
        roomStays: [roomStay],
        customer: {
          firstName: "Guest",
          lastName: "Guest",
          contacts: { phones: [], emails: [] }
        }
      }
    }

    try {
      const { data } = await this.request("POST", `${PREFIX_RESERVATION}/v1/bookings/verify`, body)

      const conditionChange = data?.conditionChange === true || data?.isConditionChanged === true
      const newPlacement = data?.booking?.placements?.[0] ?? data?.booking?.roomStays?.[0]

      return {
        ok: !conditionChange,
        conditionChange,
        newChecksum: newPlacement?.checksum ?? data?.createBookingToken ?? null,
        newPriceBeforeTax: newPlacement?.priceBeforeTax ?? null,
        newTotalPrice: newPlacement?.totalPrice ?? data?.booking?.totalPrice ?? null,
        newTax: newPlacement?.tax ?? null,
        message: data?.message ?? (conditionChange ? "Условия проживания изменились" : null)
      }
    } catch (err) {
      return {
        ok: false,
        conditionChange: false,
        message: err?.message ?? "Ошибка верификации"
      }
    }
  }

  // ─── Calculate cancellation penalty ─────────────────────────────────────────

  async calculateCancellationPenalty(bookingId) {
    try {
      const nowUtc = new Date().toISOString().replace(/\.\d{3}Z$/, "Z")
      const { data } = await this.request(
        "GET",
        `${PREFIX_RESERVATION}/v1/bookings/${bookingId}/calculate-cancellation-penalty?cancellationDateTimeUtc=${encodeURIComponent(
          nowUtc
        )}`
      )
      return {
        penalty: data?.penaltyAmount ?? data?.penalty ?? data?.amount ?? 0,
        currency: data?.currency ?? data?.currencyCode ?? "RUB",
        penaltyType: data?.penaltyType ?? data?.type ?? null,
        description: data?.description ?? null
      }
    } catch (err) {
      logger.warn(`calculateCancellationPenalty(${bookingId}): ${err?.message}`)
      return { penalty: 0, currency: "RUB", penaltyType: "unknown" }
    }
  }

  // ─── Calendar / шахматка ─────────────────────────────────────────────────────

  async getPropertyCalendar(input) {
    const fromDate = new Date(input.from)
    const totalDays = Math.min(input.days ?? 21, 28)
    const adults = input.adults ?? 1

    const dates = []
    for (let i = 0; i < totalDays; i++) {
      const d = new Date(fromDate)
      d.setDate(d.getDate() + i)
      dates.push(d.toISOString().slice(0, 10))
    }

    const dayResults = await Promise.all(
      dates.map(async (date) => {
        const nextDay = new Date(new Date(date).getTime() + 86400000).toISOString().slice(0, 10)
        try {
          const body = {
            arrivalDate: date,
            departureDate: nextDay,
            adults,
            propertyIds: [input.propertyId],
            include: "roomTypeShortContent"
          }
          const { data } = await this.request("POST", `${PREFIX_SEARCH}/v1/properties/room-stays/search`, body)
          const props = Array.isArray(data) ? data : (data?.properties ?? [])

          if (props.length === 0) return [{ date, roomTypeId: "_none", roomTypeName: "", available: false }]

          const cells = []
          for (const prop of props) {
            const roomStays = prop.roomStays ?? []
            for (const stay of roomStays) {
              const rates = stay.ratePlans ?? stay.rates ?? [stay]
              let minPrice
              let currency = "RUB"
              for (const rp of rates) {
                const p = rp.totalPrice ?? rp.priceBeforeTax ?? 0
                if (p > 0 && (minPrice === undefined || p < minPrice)) {
                  minPrice = p
                  currency = rp.currency ?? "RUB"
                }
              }
              cells.push({
                date,
                roomTypeId: stay.roomTypeId ?? stay.roomCategoryId ?? stay.id ?? "",
                roomTypeName: stay.roomTypeName ?? stay.roomType?.name ?? stay.roomCategoryName ?? "",
                available: true,
                minPrice: minPrice ?? null,
                currency
              })
            }
            if (roomStays.length === 0) cells.push({ date, roomTypeId: "_none", roomTypeName: "", available: false })
          }
          return cells.length ? cells : [{ date, roomTypeId: "_none", roomTypeName: "", available: false }]
        } catch {
          return [{ date, roomTypeId: "_none", roomTypeName: "", available: false }]
        }
      })
    )

    return dayResults.flat()
  }

  // ─── Bulk availability ────────────────────────────────────────────────────────

  async searchPropertiesAvailability(input) {
    const arrival = new Date(input.arrival)
    const departure = new Date(input.departure)
    const nights = Math.max(1, Math.round((departure.getTime() - arrival.getTime()) / 86400000))

    const body = {
      arrivalDate: String(input.arrival).slice(0, 10),
      departureDate: String(input.departure).slice(0, 10),
      adults: input.adults ?? 1,
      include: "ratePlanShortContent"
    }

    if (input.childAges && input.childAges.length > 0) {
      body.childAges = input.childAges
    } else if ((input.children ?? 0) > 0) {
      body.childAges = Array(input.children).fill(10)
    }

    if (input.propertyIds && input.propertyIds.length > 0) {
      body.propertyIds = input.propertyIds
    }

    let data
    let raw

    try {
      const result = await this.request("POST", `${PREFIX_SEARCH}/v1/properties/room-stays/search`, body)
      data = result.data
      raw = result.raw
    } catch (err) {
      logger.error(`searchPropertiesAvailability failed: ${err?.message ?? err}`)
      return []
    }

    logger.info(`searchPropertiesAvailability response (first 800): ${raw.slice(0, 800)}`)

    const allRoomStays = data?.roomStays ?? []
    logger.info(`searchPropertiesAvailability: allRoomStays.length=${allRoomStays.length}`)

    const byProperty = new Map()
    for (const stay of allRoomStays) {
      const pid = String(stay.propertyId ?? "")
      if (!pid) continue
      if (!byProperty.has(pid)) byProperty.set(pid, [])
      byProperty.get(pid).push(stay)
    }

    // Покрытие питания по mealPlanCode
    const mealCoverage = (code) => {
      const c = String(code || "").toLowerCase()
      if (!c) return { b: false, l: false, d: false }
      if (c.includes("allinclusive") || c.includes("ai")) return { b: true, l: true, d: true }
      if (c.includes("fullboard") || c.includes("fb")) return { b: true, l: true, d: true }
      if (c.includes("halfboard") || c.includes("hb")) return { b: true, l: false, d: true }
      if (c.includes("breakfast") || c.includes("bb")) return { b: true, l: false, d: false }
      return { b: false, l: false, d: false }
    }

    const need = input.mealRequirement || null
    const mealFilterApplied = !!(need && (need.breakfast || need.lunch || need.dinner))

    const stayCoversMeal = (stay) => {
      if (!mealFilterApplied) return true
      const cov = mealCoverage(stay.mealPlanCode)
      if (need.breakfast && !cov.b) return false
      if (need.lunch && !cov.l) return false
      if (need.dinner && !cov.d) return false
      return true
    }

    // Гарантируем, что в ответе будут ВСЕ запрошенные propertyIds
    // (включая те, для которых TL не вернул ни одной ставки)
    const requestedIds = (input.propertyIds || []).map(String)
    for (const pid of requestedIds) {
      if (!byProperty.has(pid)) byProperty.set(pid, [])
    }

    return Array.from(byProperty.entries()).map(([propertyId, stays]) => {
      const matchingStays = stays.filter(stayCoversMeal)

      let minTotalPrice
      let minPricePerNight
      let currency = "RUB"

      for (const stay of matchingStays) {
        const total = stay.total?.priceBeforeTax ?? 0
        const perNight = nights > 0 && total > 0 ? total / nights : total
        const cur = stay.currencyCode ?? "RUB"

        if (minTotalPrice === undefined || total < minTotalPrice) {
          minTotalPrice = total
          minPricePerNight = perNight
          currency = cur
        }
      }

      const hasAvailability = matchingStays.length > 0
      const hasAnyRate = stays.length > 0

      let reason = null
      if (hasAvailability) {
        reason = "ok"
      } else if (mealFilterApplied && hasAnyRate) {
        reason = "no_meal_match"
      } else {
        reason = "no_dates"
      }

      return {
        propertyId,
        propertyName: null,
        hasAvailability,
        minPricePerNight: minPricePerNight && minPricePerNight > 0 ? minPricePerNight : null,
        minTotalPrice: minTotalPrice && minTotalPrice > 0 ? minTotalPrice : null,
        currency,
        nights,
        hasAnyRate,
        mealFilterApplied,
        reason
      }
    })
  }

  // ─── Reservation API ────────────────────────────────────────────────────────

  async createReservation(input) {
    const childAges =
      input.childAges && input.childAges.length > 0
        ? input.childAges
        : (input.children ?? 0) > 0
        ? Array(input.children).fill(10)
        : []

    const guest = input.guest ?? {}
    const customer = input.booker ?? guest

    const roomStay = this.buildRoomStay({
      roomTypeId: input.roomTypeId,
      roomTypePlacements: input.roomTypePlacements,
      ratePlanId: input.ratePlanId,
      arrival: input.arrival,
      departure: input.departure,
      adults: input.adults ?? 1,
      childAges,
      guests: [
        {
          firstName: guest.firstName ?? "",
          lastName: guest.lastName ?? ""
        }
      ],
      checksum: input.checksum,
      checkInTime: input.checkInTime,
      checkOutTime: input.checkOutTime
    })

    const phones = customer?.phone ? [{ phoneNumber: customer.phone }] : []
    const emails = customer?.email ? [{ emailAddress: customer.email }] : []

    const bookingCustomer = {
      firstName: customer?.firstName ?? "",
      lastName: customer?.lastName ?? "",
      contacts: { phones, emails }
    }

    const verifyBody = {
      booking: {
        propertyId: input.propertyId,
        roomStays: [roomStay],
        customer: bookingCustomer,
        bookingComments: input.comment ? [input.comment] : []
      }
    }

    const { data: verifyData } = await this.request(
      "POST",
      `${PREFIX_RESERVATION}/v1/bookings/verify`,
      verifyBody
    )

    logger.info(`verify response: ${JSON.stringify(verifyData)}`)

    const createBookingToken =
      verifyData?.createBookingToken ??
      verifyData?.token ??
      verifyData?.booking?.createBookingToken

    if (!createBookingToken) {
      throw new Error(
        `TravelLine: не удалось получить createBookingToken. Ответ: ${JSON.stringify(verifyData)}`
      )
    }

    const createBody = {
      booking: {
        ...verifyBody.booking,
        createBookingToken
      }
    }

    const { data, raw } = await this.request("POST", `${PREFIX_RESERVATION}/v1/bookings`, createBody)
    logger.info(`createReservation response keys: ${Object.keys(data?.booking ?? data ?? {}).join(", ")}`)
    const reservation = this.mapReservation(data?.booking ?? data, raw)

    try {
      await prisma.tlBookingRecord.upsert({
        where: { id: reservation.id },
        create: {
          id: reservation.id,
          propertyId: reservation.propertyId,
          propertyName: reservation.propertyName ?? null,
          roomTypeId: reservation.roomTypeId,
          ratePlanId: reservation.ratePlanId,
          arrival: reservation.arrival,
          departure: reservation.departure,
          adults: reservation.adults,
          children: reservation.children ?? 0,
          totalPrice: reservation.totalPrice,
          currency: reservation.currency,
          status: reservation.status,
          guestFirst: reservation.guest.firstName,
          guestLast: reservation.guest.lastName,
          guestEmail: reservation.guest.email ?? null,
          guestPhone: reservation.guest.phone ?? null,
          comment: input.comment ?? null,
          roomTypeName: input.roomTypeName ?? null,
          ratePlanName: input.ratePlanName ?? null,
          cancellationPoliciesRaw: input.cancellationPoliciesJson ?? null,
          raw: reservation.raw
        },
        update: { status: reservation.status, raw: reservation.raw }
      })
    } catch (err) {
      logger.warn(`TravelLine: не удалось сохранить бронь в БД: ${err?.message}`)
    }

    // Полноценное размещение, если передан requestId
    if (input.requestId) {
      try {
        const localHotel = await this.ensureTravellineHotel(input.propertyId)
        if (!localHotel) {
          throw new Error("TravelLine: не удалось создать локальный Hotel-двойник")
        }

        // Берём существующую заявку для personId, на случай если она есть
        const reqRow = await prisma.request.findUnique({
          where: { id: input.requestId },
          select: { personId: true }
        })

        const arrivalDate = reservation.arrival ? new Date(reservation.arrival) : null
        const departureDate = reservation.departure ? new Date(reservation.departure) : null

        const roomLabel =
          (input.roomTypeName && input.roomTypeName.trim()) ||
          (input.ratePlanName && input.ratePlanName.trim()) ||
          `TravelLine · ${reservation.id}`

        const mealPlanFromTl = mapTlMealPlanCode(input.mealPlanCode)

        let computedMealPlan = null
        if (mealPlanFromTl && arrivalDate && departureDate) {
          const mealTimes = {
            breakfast: localHotel.breakfast || { start: "07:00", end: "10:00" },
            lunch: localHotel.lunch || { start: "12:00", end: "15:00" },
            dinner: localHotel.dinner || { start: "18:00", end: "21:00" }
          }
          try {
            const calc = calculateMeal(
              arrivalDate,
              departureDate,
              mealTimes,
              {
                breakfast: mealPlanFromTl.breakfastEnabled,
                lunch: mealPlanFromTl.lunchEnabled,
                dinner: mealPlanFromTl.dinnerEnabled
              }
            )
            computedMealPlan = {
              included: mealPlanFromTl.included,
              breakfast: calc.totalBreakfast,
              breakfastEnabled: mealPlanFromTl.breakfastEnabled,
              lunch: calc.totalLunch,
              lunchEnabled: mealPlanFromTl.lunchEnabled,
              dinner: calc.totalDinner,
              dinnerEnabled: mealPlanFromTl.dinnerEnabled,
              dailyMeals: calc.dailyMeals
            }
          } catch (err) {
            logger.warn(`TravelLine: calculateMeal failed: ${err?.message}`)
          }
        }

        await prisma.request.update({
          where: { id: input.requestId },
          data: {
            hotelId: localHotel.id,
            status: "done",
            placementAt: new Date(),
            externalBookingNumber: reservation.id,
            externalSource: "travelline",
            roomCategory: roomLabel,
            roomNumber: roomLabel,
            ...(computedMealPlan
              ? { mealPlan: computedMealPlan }
              : mealPlanFromTl
              ? { mealPlan: mealPlanFromTl }
              : {})
          }
        })

        // Создаём запись HotelChess (без roomId — у virtual Hotel номеров нет)
        await prisma.hotelChess.create({
          data: {
            hotel: { connect: { id: localHotel.id } },
            request: { connect: { id: input.requestId } },
            start: arrivalDate,
            end: departureDate,
            ...(reqRow?.personId ? { client: { connect: { id: reqRow.personId } } } : {}),
            ...(computedMealPlan ? { mealPlan: computedMealPlan } : {}),
            public: false
          }
        })

        // Подписки — чтобы UI обновился без перезагрузки
        try {
          await publishRequestUpdated(input.requestId)
        } catch (subErr) {
          logger.warn(`publishRequestUpdated failed: ${subErr?.message}`)
        }

        logger.info(
          `TravelLine: Request ${input.requestId} placed in virtual Hotel ${localHotel.id} (booking ${reservation.id})`
        )
      } catch (err) {
        logger.warn(`TravelLine: не удалось разместить Request ${input.requestId}: ${err?.message}`)
      }
    }

    return reservation
  }

  async getReservation(bookingNumber) {
    const { data, raw } = await this.request("GET", `${PREFIX_RESERVATION}/v1/bookings/${bookingNumber}`)
    return this.mapReservation(data?.booking ?? data, raw)
  }

  async cancelReservation(bookingNumber, reason) {
    const body = {}
    if (reason) body.reason = reason

    const { data } = await this.request(
      "POST",
      `${PREFIX_RESERVATION}/v1/bookings/${bookingNumber}/cancel`,
      body
    )

    const status = data?.booking?.status?.toLowerCase() ?? "cancelled"
    await prisma.tlBookingRecord.updateMany({
      where: { id: bookingNumber },
      data: { status }
    })
    return true
  }

  async listReservations() {
    try {
      const localRecords = await prisma.tlBookingRecord.findMany({ select: { propertyId: true } })
      const propertyIds = [...new Set(localRecords.map((r) => r.propertyId))]

      for (const propertyId of propertyIds) {
        try {
          const { data } = await this.request(
            "GET",
            `${PREFIX_READ_RESERVATION}/v1/properties/${propertyId}/bookings`
          )
          const summaries = data?.bookingSummaries ?? data?.bookings ?? []
          for (const s of summaries) {
            const num = s.number ?? s.id
            if (!num) continue
            await prisma.tlBookingRecord.updateMany({
              where: { id: String(num) },
              data: { status: s.status ?? "confirmed" }
            })
          }
        } catch (err) {
          logger.warn(`listReservations: sync failed for property ${propertyId}: ${err?.message}`)
        }
      }
    } catch (err) {
      logger.warn(`listReservations: sync step failed: ${err?.message}`)
    }

    const records = await prisma.tlBookingRecord.findMany({
      orderBy: { createdAt: "desc" }
    })
    return records.map((r) => ({
      id: r.id,
      propertyId: r.propertyId,
      propertyName: r.propertyName ?? null,
      roomTypeId: r.roomTypeId,
      ratePlanId: r.ratePlanId,
      arrival: r.arrival,
      departure: r.departure,
      adults: r.adults,
      children: r.children,
      totalPrice: r.totalPrice,
      currency: r.currency,
      status: r.status,
      guest: {
        firstName: r.guestFirst,
        lastName: r.guestLast,
        email: r.guestEmail ?? null,
        phone: r.guestPhone ?? null
      },
      comment: r.comment ?? null,
      roomTypeName: r.roomTypeName ?? null,
      ratePlanName: r.ratePlanName ?? null,
      cancellationPoliciesJson: r.cancellationPoliciesRaw ?? null,
      createdAt: r.createdAt.toISOString(),
      raw: r.raw
    }))
  }

  // ─── Mappers ───────────────────────────────────────────────────────────────

  mapProperty(p, raw) {
    const addr = p.contactInfo?.address ?? p.address
    return {
      id: p.id ?? "",
      name: p.name ?? p.title ?? "",
      description: p.description ?? null,
      phone: p.contactInfo?.phone ?? p.phone ?? null,
      email: p.contactInfo?.email ?? p.email ?? null,
      address: addr
        ? {
            country: addr.countryCode ?? addr.country ?? null,
            city: addr.cityName ?? addr.city ?? null,
            street: addr.addressLine ?? addr.street ?? null,
            zip: addr.postalCode ?? addr.zip ?? null
          }
        : null,
      latitude: addr?.latitude ?? p.latitude ?? null,
      longitude: addr?.longitude ?? p.longitude ?? null,
      photos: (p.images ?? p.photos)?.map((i) => i.url ?? i) ?? null,
      stars: String(p.stars ?? p.starRating ?? p.category ?? "") || null,
      raw: raw ?? JSON.stringify(p)
    }
  }

  mapRoomType(r) {
    return {
      id: r.id ?? r.roomCategoryId ?? "",
      name: r.name ?? r.title ?? "",
      description: r.description ?? null,
      maxOccupancy: r.maxOccupancy ?? r.maxAdults ?? null,
      photos: r.photos ?? r.images ?? null,
      raw: JSON.stringify(r)
    }
  }

  mapRatePlan(r) {
    return {
      id: r.id ?? r.ratePlanId ?? "",
      name: r.name ?? r.title ?? "",
      description: r.description ?? null,
      includesBreakfast: r.includesBreakfast ?? r.breakfast ?? null,
      raw: JSON.stringify(r)
    }
  }

  mapReservation(r, raw) {
    const roomStay = r.roomStays?.[0] ?? r.placements?.[0] ?? {}

    const roomTypeId =
      roomStay.roomType?.id ?? roomStay.roomTypeId ?? r.roomType?.id ?? r.roomTypeId ?? ""

    const ratePlanId =
      roomStay.ratePlan?.id ?? roomStay.ratePlanId ?? r.ratePlan?.id ?? r.ratePlanId ?? ""

    const arrival =
      roomStay.stayDates?.arrivalDateTime ??
      roomStay.arrivalDate ??
      r.stayDates?.arrivalDateTime ??
      r.arrival ??
      r.checkIn ??
      ""

    const departure =
      roomStay.stayDates?.departureDateTime ??
      roomStay.departureDate ??
      r.stayDates?.departureDateTime ??
      r.departure ??
      r.checkOut ??
      ""

    const adults =
      roomStay.guestCount?.adultCount ?? roomStay.adultsCount ?? r.guestCount?.adultCount ?? r.adults ?? 1

    const childAges =
      roomStay.guestCount?.childAges ?? roomStay.childAges ?? r.guestCount?.childAges ?? r.childAges ?? []

    const status = (r.status ?? r.state ?? "unknown").toLowerCase()

    const totalPrice =
      r.totalPrice ??
      r.total?.priceBeforeTax ??
      r.total?.totalPrice ??
      (typeof r.total === "number" ? r.total : 0)

    return {
      id: r.number ?? r.id ?? r.reservationId ?? r.bookingId ?? "",
      propertyId: r.propertyId ?? "",
      propertyName: r.propertyName ?? null,
      roomTypeId,
      ratePlanId,
      arrival,
      departure,
      adults,
      children: Array.isArray(childAges) ? childAges.length : (r.children ?? 0),
      totalPrice,
      currency: r.currency ?? r.currencyCode ?? "RUB",
      status,
      guest: {
        firstName: r.customer?.firstName ?? r.guest?.firstName ?? "",
        lastName: r.customer?.lastName ?? r.guest?.lastName ?? "",
        email:
          r.customer?.contacts?.emails?.[0]?.emailAddress ?? r.customer?.email ?? r.guest?.email ?? null,
        phone:
          r.customer?.contacts?.phones?.[0]?.phoneNumber ?? r.customer?.phone ?? r.guest?.phone ?? null
      },
      comment: r.bookingComments?.[0] ?? r.comment ?? r.specialRequest ?? r.guestComment ?? null,
      roomTypeName: null,
      ratePlanName: null,
      cancellationPoliciesJson: null,
      createdAt: r.createdAt ?? r.createDate ?? r.createdDateTime ?? new Date().toISOString(),
      raw: raw ?? JSON.stringify(r)
    }
  }
}

export const travellineService = new TravellineService()

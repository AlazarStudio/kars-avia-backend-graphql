import { existsSync, mkdirSync } from "fs"
import { writeFile } from "fs/promises"
import path from "path"
import { prisma } from "../../prisma.js"
import { logger } from "../infra/logger.js"
import { publishRequestUpdated } from "../infra/subscriptionPayloads.js"
import calculateMeal from "../meal/calculateMeal.js"
import { buildStayDatesWithExtras, parseVerifyResponse } from "./travellineBooking.js"
import { extractCancellationPolicy, pickRoomTypeName } from "./travellineMappers.js"

const DEFAULT_BASE_URL = "https://partner.qatl.ru"
const CLIENT_ID_KEY = "travelline.client_id"
const CLIENT_SECRET_KEY = "travelline.client_secret"
const BASE_URL_KEY = "travelline.base_url"

// Скачивает URL-картинки в локальный uploads, возвращает массив локальных путей.
// При ошибке скачивания конкретной картинки — fallback на оригинальный URL.
async function downloadImages(urls, externalId) {
  if (!Array.isArray(urls) || urls.length === 0) return []
  const baseDir = path.resolve("uploads", "travelline", String(externalId))
  if (!existsSync(baseDir)) {
    try {
      mkdirSync(baseDir, { recursive: true })
    } catch (err) {
      logger.warn(`downloadImages: mkdir failed: ${err?.message}`)
      return urls
    }
  }
  const result = []
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i]
    if (!url || typeof url !== "string") continue
    try {
      const res = await fetch(url)
      if (!res.ok) {
        logger.warn(`downloadImages: HTTP ${res.status} for ${url}`)
        result.push(url)
        continue
      }
      const buf = Buffer.from(await res.arrayBuffer())
      const ext = (url.split("?")[0].match(/\.([a-z0-9]{2,5})$/i)?.[1] || "jpg").toLowerCase()
      const fileName = `photo-${i}.${ext}`
      await writeFile(path.join(baseDir, fileName), buf)
      result.push(`/uploads/travelline/${externalId}/${fileName}`)
    } catch (err) {
      logger.warn(`downloadImages: ${url} failed: ${err?.message}`)
      result.push(url)
    }
  }
  return result
}

// Собирает все URL картинок из любых полей prop.images / prop.photos / room.images …
function collectImageUrls(node, out = new Set()) {
  if (!node) return out
  if (typeof node === "string") {
    if (/^https?:\/\//i.test(node) && /\.(jpe?g|png|webp|gif)(\?|$)/i.test(node)) {
      out.add(node)
    }
    return out
  }
  if (Array.isArray(node)) {
    for (const x of node) collectImageUrls(x, out)
    return out
  }
  if (typeof node === "object") {
    if (typeof node.url === "string" && /^https?:\/\//i.test(node.url)) out.add(node.url)
    if (typeof node.src === "string" && /^https?:\/\//i.test(node.src)) out.add(node.src)
    for (const k of Object.keys(node)) {
      if (k === "raw") continue // не лезем внутрь сериализованного raw
      collectImageUrls(node[k], out)
    }
  }
  return out
}

// Скачивает множество URL и возвращает Map<url, localPath>.
// Если скачивание упало — в Map остаётся исходный URL → исходный URL.
async function downloadImagesMap(urls, externalId) {
  const map = new Map()
  if (!urls || (urls.size ?? urls.length) === 0) return map
  const list = Array.from(urls instanceof Set ? urls : urls)
  const baseDir = path.resolve("uploads", "travelline", String(externalId))
  if (!existsSync(baseDir)) {
    try { mkdirSync(baseDir, { recursive: true }) } catch { /* noop */ }
  }
  let i = 0
  for (const url of list) {
    try {
      const res = await fetch(url)
      if (!res.ok) {
        map.set(url, url)
        continue
      }
      const buf = Buffer.from(await res.arrayBuffer())
      const ext = (url.split("?")[0].match(/\.([a-z0-9]{2,5})$/i)?.[1] || "jpg").toLowerCase()
      const fileName = `photo-${i}.${ext}`
      await writeFile(path.join(baseDir, fileName), buf)
      map.set(url, `/uploads/travelline/${externalId}/${fileName}`)
    } catch (err) {
      logger.warn(`downloadImagesMap: ${url} failed: ${err?.message}`)
      map.set(url, url)
    }
    i++
  }
  return map
}

// Глубоко рекурсивно подменяет TL URL картинок в объекте на локальные пути
function patchRawImages(node, map) {
  if (!node || !map || map.size === 0) return node
  if (typeof node === "string") {
    return map.has(node) ? map.get(node) : node
  }
  if (Array.isArray(node)) {
    return node.map((x) => patchRawImages(x, map))
  }
  if (typeof node === "object") {
    const out = {}
    for (const k of Object.keys(node)) {
      if (k === "raw") {
        out[k] = node[k]
        continue
      }
      out[k] = patchRawImages(node[k], map)
    }
    return out
  }
  return node
}

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
const PREFIX_REFERENCE_DATA = "/api/reference-data"

class TravellineService {
  constructor() {
    this.tokenCache = null
    this.citiesCache = new Map() // countryCode -> { items, expiresAt }
    this.syncState = {
      running: false,
      total: 0,
      done: 0,
      currentName: null,
      startedAt: null,
      finishedAt: null,
      error: null
    }
  }

  // ─── Catalog sync ────────────────────────────────────────────────────────

  async getSyncStatus() {
    const [last, interval] = await Promise.all([
      prisma.systemSetting
        .findUnique({ where: { key: "travelline.last_sync_at" } })
        .catch(() => null),
      prisma.systemSetting
        .findUnique({ where: { key: "travelline.auto_sync_hours" } })
        .catch(() => null)
    ])
    return {
      ...this.syncState,
      lastSyncAt: last?.value ?? this.syncState.finishedAt ?? null,
      autoSyncHours: interval?.value ? Number(interval.value) : 24
    }
  }

  async setAutoSyncHours(hours) {
    const v = Math.max(1, Math.min(168, Number(hours) || 24))
    await prisma.systemSetting.upsert({
      where: { key: "travelline.auto_sync_hours" },
      create: {
        key: "travelline.auto_sync_hours",
        value: String(v),
        type: "number",
        group: "travelline",
        label: "TravelLine Auto-Sync Interval (hours)"
      },
      update: { value: String(v) }
    })
    return v
  }

  // Проверка тиком: запустить sync если прошло >= autoSyncHours с lastSyncAt
  async maybeAutoSync() {
    if (this.syncState.running) return
    try {
      const cfg = await this.getConfig()
      if (!cfg.isConfigured) return
      const st = await this.getSyncStatus()
      if (!st.lastSyncAt) return // первичная синхронизация — её делает фронт при заходе
      const last = new Date(st.lastSyncAt).getTime()
      const dueAfterMs = (st.autoSyncHours || 24) * 60 * 60 * 1000
      if (Date.now() - last >= dueAfterMs) {
        logger.info(`TravelLine auto-sync: starting (interval ${st.autoSyncHours}h)`)
        this.startCatalogSync()
      }
    } catch (err) {
      logger.warn(`maybeAutoSync error: ${err?.message}`)
    }
  }

  startCatalogSync(countryCode = "RUS") {
    if (this.syncState.running) {
      return this.getSyncStatus()
    }
    this.syncState = {
      running: true,
      total: 0,
      done: 0,
      currentName: null,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      error: null
    }
    // Запускаем фоном
    this._runSync(countryCode).catch((err) => {
      this.syncState.error = err?.message || String(err)
      this.syncState.running = false
      this.syncState.finishedAt = new Date().toISOString()
      logger.error(`TravelLine sync failed: ${this.syncState.error}`)
    })
    return this.getSyncStatus()
  }

  async _runSync(countryCode = "RUS") {
    logger.info(`TravelLine sync: starting for country ${countryCode}`)
    const { items } = await this.searchProperties({ pageSize: 200 })
    this.syncState.total = items.length
    logger.info(`TravelLine sync: ${items.length} properties to process`)
    for (const p of items) {
      this.syncState.currentName = p.name
      try {
        // Listing endpoint отдаёт неполные данные — берём полный property отдельно
        let fullProp = p
        try {
          fullProp = await this.getProperty(p.id)
        } catch (err) {
          logger.warn(`sync: getProperty(${p.id}) failed: ${err?.message}, using listing data`)
        }
        await this.ensureTravellineHotel(p.id, fullProp)
      } catch (err) {
        logger.warn(`TravelLine sync: ensureTravellineHotel(${p.id}) failed: ${err?.message}`)
      }
      this.syncState.done++
    }
    const finishedAt = new Date().toISOString()
    this.syncState.finishedAt = finishedAt
    this.syncState.running = false
    this.syncState.currentName = null
    try {
      await prisma.systemSetting.upsert({
        where: { key: "travelline.last_sync_at" },
        create: {
          key: "travelline.last_sync_at",
          value: finishedAt,
          type: "string",
          group: "travelline",
          label: "TravelLine Last Sync At"
        },
        update: { value: finishedAt }
      })
    } catch (err) {
      logger.warn(`TravelLine sync: failed to persist last_sync_at: ${err?.message}`)
    }
    logger.info(`TravelLine sync: done ${this.syncState.done}/${this.syncState.total}`)
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

  // Найти или создать локальный Hotel-двойник для TravelLine property.
  // Если передан preloadedProp — используем его вместо запроса к TL Content API.
  async ensureTravellineHotel(propertyId, preloadedProp = null) {
    if (!propertyId) return null
    const externalId = String(propertyId)
    const existing = await prisma.hotel.findFirst({
      where: { externalSource: "travelline", externalId }
    })

    // Если запись уже есть — при наличии preloadedProp обновим контент,
    // иначе вернём как есть (только дозальём дефолтные времена еды если их нет).
    if (existing) {
      if (preloadedProp) {
        try {
          // Парсим raw отеля чтобы выудить все URL картинок (photos, images, room photos)
          let rawObj = null
          try {
            rawObj = JSON.parse(JSON.stringify(preloadedProp.raw ? JSON.parse(preloadedProp.raw) : preloadedProp))
          } catch {
            rawObj = preloadedProp
          }
          const collectedUrls = collectImageUrls(rawObj)
          const downloadMap = await downloadImagesMap(collectedUrls, externalId)
          const patchedRaw = patchRawImages(rawObj, downloadMap)
          const localImages = (Array.isArray(preloadedProp?.photos) ? preloadedProp.photos : [])
            .map((u) => downloadMap.get(u) || u)

          return await prisma.hotel.update({
            where: { id: existing.id },
            data: {
              name: preloadedProp?.name ?? existing.name,
              images: localImages.length > 0 ? localImages : existing.images,
              stars: preloadedProp?.stars ?? existing.stars,
              externalRaw: JSON.stringify(patchedRaw),
              externalSyncedAt: new Date(),
              breakfast: existing.breakfast || { start: "07:00", end: "10:00" },
              lunch: existing.lunch || { start: "12:00", end: "15:00" },
              dinner: existing.dinner || { start: "18:00", end: "21:00" },
              information: {
                country: preloadedProp?.address?.country ?? existing.information?.country ?? "",
                city: preloadedProp?.address?.city ?? existing.information?.city ?? "",
                address: preloadedProp?.address?.street ?? existing.information?.address ?? ""
              }
            }
          })
        } catch (err) {
          logger.warn(`ensureTravellineHotel: update existing failed: ${err?.message}`)
          return existing
        }
      }
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

    let prop = preloadedProp
    if (!prop) {
      try {
        prop = await this.getProperty(propertyId)
      } catch (err) {
        logger.warn(`ensureTravellineHotel: getProperty(${propertyId}) failed: ${err?.message}`)
      }
    }

    let rawObj = null
    try {
      rawObj = JSON.parse(JSON.stringify(prop?.raw ? JSON.parse(prop.raw) : prop))
    } catch {
      rawObj = prop
    }
    const collectedUrls = collectImageUrls(rawObj)
    const downloadMap = await downloadImagesMap(collectedUrls, externalId)
    const patchedRaw = patchRawImages(rawObj, downloadMap)
    const localImages = (Array.isArray(prop?.photos) ? prop.photos : [])
      .map((u) => downloadMap.get(u) || u)

    const created = await prisma.hotel.create({
      data: {
        name: prop?.name ?? `TravelLine ${externalId}`,
        images: localImages,
        stars: prop?.stars ?? null,
        external: true,
        externalSource: "travelline",
        externalId,
        externalRaw: patchedRaw ? JSON.stringify(patchedRaw) : null,
        externalSyncedAt: new Date(),
        active: true,
        show: false,
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
    logger.info(`ensureTravellineHotel: created Hotel ${created.id} for property ${externalId}`)
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

  // ─── РЗПВ helpers ────────────────────────────────────────────────────────────

  _extractTimeServices(stay) {
    const services = stay.services ?? stay.additionalServices ?? stay.extraServices ?? []
    const currency = stay.currencyCode ?? "RUB"

    const mapPeriods = (s) => {
      const periods = s.periods ?? s.options ?? s.priceRanges ?? []
      if (periods.length > 0) {
        return periods.map((p) => ({
          periodFrom: p.from ?? p.periodFrom ?? p.checkInFrom ?? p.start ?? "",
          periodTo: p.to ?? p.periodTo ?? p.checkInTo ?? p.end ?? "",
          price: p.price ?? p.amount ?? p.priceBeforeTax ?? 0,
          currency: p.currency ?? p.currencyCode ?? currency
        }))
      }
      // Сервис без вложенных периодов — сам является периодом
      return [{
        periodFrom: s.from ?? s.periodFrom ?? s.checkInFrom ?? s.start ?? "",
        periodTo: s.to ?? s.periodTo ?? s.checkInTo ?? s.end ?? "",
        price: s.price ?? s.amount ?? s.priceBeforeTax ?? 0,
        currency: s.currency ?? s.currencyCode ?? currency
      }]
    }

    const earlyCheckInOptions = []
    const lateCheckOutOptions = []

    for (const s of services) {
      const type = String(s.type ?? s.serviceType ?? s.code ?? "").toLowerCase()
      if (type.includes("earlycheckin") || type.includes("early_check_in") || type === "earlyin") {
        earlyCheckInOptions.push(...mapPeriods(s))
      } else if (type.includes("latecheckout") || type.includes("late_check_out") || type === "lateout") {
        lateCheckOutOptions.push(...mapPeriods(s))
      }
    }

    return { earlyCheckInOptions, lateCheckOutOptions }
  }

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

    const corporateIds = input.corporateIds ?? []
    corporateIds.forEach((id) => params.append("corporateIds", String(id)))

    const { data, raw } = await this.request(
      "GET",
      `${PREFIX_SEARCH}/v1/properties/${input.propertyId}/room-stays?${params.toString()}`
    )

    const roomStays = data?.roomStays ?? []
    logger.info(`searchAvailability(${input.propertyId}): ${roomStays.length} roomStays`)

    let contentRoomTypes = []
    try {
      contentRoomTypes = await this.getRoomTypes(input.propertyId)
    } catch (err) {
      logger.warn(
        `searchAvailability(${input.propertyId}): getRoomTypes failed: ${err?.message}`
      )
    }

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

      const cancPolicy = extractCancellationPolicy(stay.cancellationPolicy, tz)
      const cancellationPolicies = cancPolicy ? [cancPolicy] : []

      const placements = stay.roomType?.placements ?? []
      const { earlyCheckInOptions, lateCheckOutOptions } = this._extractTimeServices(stay)
      const corporateIdsOnRate = stay.ratePlan?.corporateIds ?? stay.corporateIds ?? null

      rates.push({
        roomTypeId,
        roomTypeName: pickRoomTypeName(roomTypeId, contentRoomTypes, stay.roomType?.name),
        placementName: stay.fullPlacementsName ?? null,
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
        earlyCheckInOptions: earlyCheckInOptions.length > 0 ? earlyCheckInOptions : null,
        lateCheckOutOptions: lateCheckOutOptions.length > 0 ? lateCheckOutOptions : null,
        corporateIds: corporateIdsOnRate,
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
    const { stayDates, additionalServices } = buildStayDatesWithExtras({
      arrival: opts.arrival,
      departure: opts.departure,
      checkInTime: opts.checkInTime,
      checkOutTime: opts.checkOutTime,
      earlyCheckInDateTime: opts.earlyCheckInDateTime,
      lateCheckOutDateTime: opts.lateCheckOutDateTime
    })

    const roomStay = {
      roomType: {
        id: opts.roomTypeId,
        placements: (opts.roomTypePlacements ?? []).map((code) => ({ code }))
      },
      ratePlan: { id: opts.ratePlanId },
      stayDates,
      guestCount: {
        adultCount: opts.adults,
        ...(opts.childAges.length > 0 ? { childAges: opts.childAges } : {})
      },
      guests: opts.guests,
      ...(opts.checksum ? { checksum: opts.checksum } : {})
    }

    if (additionalServices.length > 0) {
      roomStay.additionalServices = additionalServices
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
      checkOutTime: input.checkOutTime,
      earlyCheckInDateTime: input.earlyCheckInDateTime,
      lateCheckOutDateTime: input.lateCheckOutDateTime
    })

    const body = {
      booking: {
        propertyId: input.propertyId,
        roomStays: [roomStay],
        customer: {
          firstName: "Guest",
          lastName: "Guest",
          contacts: { phones: [], emails: [] }
        },
        ...(input.corporateId ? { corporateId: input.corporateId } : {})
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

    if (input.corporateIds && input.corporateIds.length > 0) {
      body.corporateIds = input.corporateIds
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

    const summaries = Array.from(byProperty.entries()).map(([propertyId, stays]) => {
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

    // Подтянуть в БД все propertyIds, которых у нас ещё нет (фоном — не блокируем ответ)
    this._ensureMissingPropertiesAsync(summaries.map((s) => s.propertyId))

    return summaries
  }

  // Фоновая дозаливка незнакомых TL отелей в локальную БД
  async _ensureMissingPropertiesAsync(propertyIds) {
    try {
      const ids = (propertyIds || []).map(String).filter(Boolean)
      if (ids.length === 0) return
      const known = await prisma.hotel.findMany({
        where: { externalSource: "travelline", externalId: { in: ids } },
        select: { externalId: true }
      })
      const knownSet = new Set(known.map((h) => h.externalId))
      const missing = ids.filter((id) => !knownSet.has(id))
      if (missing.length === 0) return
      logger.info(`searchPropertiesAvailability: ingesting ${missing.length} new properties`)
      for (const id of missing) {
        try {
          await this.ensureTravellineHotel(id)
        } catch (err) {
          logger.warn(`_ensureMissingPropertiesAsync(${id}): ${err?.message}`)
        }
      }
    } catch (err) {
      logger.warn(`_ensureMissingPropertiesAsync error: ${err?.message}`)
    }
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
      checkOutTime: input.checkOutTime,
      earlyCheckInDateTime: input.earlyCheckInDateTime,
      lateCheckOutDateTime: input.lateCheckOutDateTime
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
        bookingComments: input.comment ? [input.comment] : [],
        ...(input.corporateId ? { corporateId: input.corporateId } : {})
      }
    }

    const { data: verifyData } = await this.request(
      "POST",
      `${PREFIX_RESERVATION}/v1/bookings/verify`,
      verifyBody
    )

    logger.info(`verify response: ${JSON.stringify(verifyData)}`)

    const parsedVerify = parseVerifyResponse(verifyData)

    // Цена/доступность изменились — бронь НЕ создаём, возвращаем альтернативу (№7)
    if (parsedVerify.conditionChange) {
      const alt = parsedVerify.alternative
      return {
        reservation: null,
        conditionChange: true,
        alternative: alt
          ? {
              newPriceBeforeTax: alt.newPriceBeforeTax,
              newTax: alt.newTax,
              newTotalPrice: alt.newTotalPrice,
              newPenaltyAmount: alt.newPenaltyAmount,
              newChecksum: alt.newChecksum,
              message: alt.message,
              cancellationPolicy: extractCancellationPolicy(alt.cancellationPolicy)
            }
          : null
      }
    }

    const createBookingToken = parsedVerify.createBookingToken

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
          earlyCheckInDateTime: input.earlyCheckInDateTime ?? null,
          lateCheckOutDateTime: input.lateCheckOutDateTime ?? null,
          corporateId: input.corporateId ?? null,
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

    return { reservation, conditionChange: false, alternative: null }
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

  async amendReservation(input) {
    const record = await prisma.tlBookingRecord.findUnique({
      where: { id: input.bookingId }
    })
    if (!record) {
      throw new Error(`TravelLine: бронь ${input.bookingId} не найдена в БД`)
    }

    // Fetch current booking from TravelLine to get up-to-date version and checksum
    // (stored raw may be stale; TravelLine rejects modify with outdated checksum/version)
    let bookingVersion = null
    let existingChecksum = null
    let existingGuests = [{ firstName: record.guestFirst ?? "Guest", lastName: record.guestLast ?? "Guest" }]
    let existingPlacements = []

    try {
      const { data: currentData } = await this.request(
        "GET",
        `${PREFIX_RESERVATION}/v1/bookings/${input.bookingId}`
      )
      const currentBooking = currentData?.booking ?? currentData
      bookingVersion = currentBooking?.version ?? null
      const currentStay = currentBooking?.roomStays?.[0] ?? currentBooking?.placements?.[0] ?? {}
      existingChecksum = currentStay?.checksum ?? null
      if (Array.isArray(currentStay?.guests) && currentStay.guests.length > 0) {
        existingGuests = currentStay.guests
      }
      if (Array.isArray(currentStay?.roomType?.placements)) {
        existingPlacements = currentStay.roomType.placements.map((p) => p.code)
      }
      logger.info(`amendReservation(${input.bookingId}): fetched live booking, version=${bookingVersion}, checksum=${existingChecksum}`)
    } catch (fetchErr) {
      // Fallback to stored raw if GET fails
      logger.warn(`amendReservation(${input.bookingId}): GET booking failed (${fetchErr?.message}), falling back to stored raw`)
      let rawBooking = {}
      try { rawBooking = JSON.parse(record.raw ?? "{}") } catch {}
      bookingVersion = rawBooking?.version ?? rawBooking?.booking?.version ?? null
      const storedStay = rawBooking?.roomStays?.[0] ?? rawBooking?.booking?.roomStays?.[0] ?? {}
      existingChecksum = storedStay?.checksum ?? null
      if (Array.isArray(storedStay?.guests) && storedStay.guests.length > 0) existingGuests = storedStay.guests
      if (Array.isArray(storedStay?.roomType?.placements)) existingPlacements = storedStay.roomType.placements.map((p) => p.code)
    }

    const childAges = input.childAges?.length > 0 ? input.childAges : []
    const placements = input.roomTypePlacements?.length > 0 ? input.roomTypePlacements : existingPlacements
    const adults = input.adults ?? record.adults ?? 1

    // Derive check-in/out times from existing booking
    let checkInTime = "15:00"
    let checkOutTime = "11:00"
    try {
      const rawFallback = JSON.parse(record.raw ?? "{}")
      const stayFallback = rawFallback?.roomStays?.[0] ?? rawFallback?.booking?.roomStays?.[0] ?? {}
      checkInTime = input.checkInTime ?? stayFallback?.stayDates?.arrivalDateTime?.slice(11, 16) ?? "15:00"
      checkOutTime = input.checkOutTime ?? stayFallback?.stayDates?.departureDateTime?.slice(11, 16) ?? "11:00"
    } catch {}

    // Search availability for NEW dates to get a fresh checksum
    // The checksum in modify must match current pricing conditions for the new dates
    let newChecksum = existingChecksum
    try {
      const arrivalDate = input.arrival.slice(0, 10)
      const departureDate = input.departure.slice(0, 10)
      const searchParams = new URLSearchParams({
        arrivalDate,
        departureDate,
        adults: String(adults)
      })
      childAges.forEach((age) => searchParams.append("childAges", String(age)))
      const effectiveCorporateId = input.corporateId ?? record.corporateId ?? null
      if (effectiveCorporateId) searchParams.append("corporateIds", effectiveCorporateId)

      const { data: searchData } = await this.request(
        "GET",
        `${PREFIX_SEARCH}/v1/properties/${record.propertyId}/room-stays?${searchParams.toString()}`
      )
      const matchingStay = (searchData?.roomStays ?? []).find(
        (s) => s.roomType?.id === record.roomTypeId && s.ratePlan?.id === record.ratePlanId
      )
      if (matchingStay?.checksum) {
        newChecksum = matchingStay.checksum
        logger.info(`amendReservation(${input.bookingId}): got fresh checksum from search`)
      } else {
        logger.warn(`amendReservation(${input.bookingId}): rate ${record.roomTypeId}/${record.ratePlanId} not found in search for new dates — room may be unavailable`)
      }
    } catch (searchErr) {
      logger.warn(`amendReservation(${input.bookingId}): availability search failed (${searchErr?.message}), using existing checksum`)
    }

    const { stayDates: amendStayDates, additionalServices: amendServices } =
      buildStayDatesWithExtras({
        arrival: input.arrival,
        departure: input.departure,
        checkInTime,
        checkOutTime,
        earlyCheckInDateTime: input.earlyCheckInDateTime,
        lateCheckOutDateTime: input.lateCheckOutDateTime
      })

    const roomStayBody = {
      roomType: {
        id: record.roomTypeId,
        placements: placements.map((code) => ({ code }))
      },
      ratePlan: { id: record.ratePlanId },
      stayDates: amendStayDates,
      guestCount: {
        adultCount: adults,
        ...(childAges.length > 0 ? { childAges } : {})
      },
      guests: existingGuests,
      checksum: newChecksum,
      ...(amendServices.length > 0 ? { additionalServices: amendServices } : {})
    }

    const amendBody = {
      booking: {
        propertyId: record.propertyId,
        ...(bookingVersion != null ? { version: bookingVersion } : {}),
        roomStays: [roomStayBody],
        customer: {
          firstName: record.guestFirst ?? "Guest",
          lastName: record.guestLast ?? "Guest",
          contacts: {
            phones: record.guestPhone ? [{ phoneNumber: record.guestPhone }] : [],
            emails: record.guestEmail ? [{ emailAddress: record.guestEmail }] : []
          }
        },
        ...(input.corporateId ?? record.corporateId ? { corporateId: input.corporateId ?? record.corporateId } : {}),
        ...(input.comment ? { bookingComments: [input.comment] } : {})
      }
    }

    // POST /api/reservation/v1/bookings/{number}/modify
    logger.info(`amendReservation(${input.bookingId}): POST /modify`)
    const { data: modifyData } = await this.request(
      "POST",
      `${PREFIX_RESERVATION}/v1/bookings/${input.bookingId}/modify`,
      amendBody
    )
    logger.info(`amendReservation(${input.bookingId}) modify response: ${JSON.stringify(modifyData)}`)

    const newStay = modifyData?.booking?.roomStays?.[0] ?? modifyData?.booking?.placements?.[0] ?? {}
    const newArrival = newStay.stayDates?.arrivalDateTime ?? input.arrival
    const newDeparture = newStay.stayDates?.departureDateTime ?? input.departure
    const newTotalPrice = modifyData?.booking?.totalPrice ?? newStay.total?.priceBeforeTax ?? null

    await prisma.tlBookingRecord.updateMany({
      where: { id: input.bookingId },
      data: {
        arrival: newArrival,
        departure: newDeparture,
        ...(input.earlyCheckInDateTime ? { earlyCheckInDateTime: input.earlyCheckInDateTime } : {}),
        ...(input.lateCheckOutDateTime ? { lateCheckOutDateTime: input.lateCheckOutDateTime } : {}),
        raw: JSON.stringify(modifyData?.booking ?? modifyData)
      }
    })

    return {
      ok: true,
      conditionChange: false,
      newArrival,
      newDeparture,
      newTotalPrice,
      newChecksum: newStay.checksum ?? null,
      message: modifyData?.message ?? null
    }
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
      earlyCheckInDateTime: r.earlyCheckInDateTime ?? null,
      lateCheckOutDateTime: r.lateCheckOutDateTime ?? null,
      corporateId: r.corporateId ?? null,
      createdAt: r.createdAt.toISOString(),
      raw: r.raw
    }))
  }

  // ─── Corporate clients ────────────────────────────────────────────────────

  async searchExtraStays(propertyId, input) {
    const body = {
      stayDates: {
        arrivalDateTime: input.arrivalDateTime,
        departureDateTime: input.departureDateTime
      },
      roomType: {
        id: input.roomTypeId,
        placements: (input.roomTypePlacements ?? []).map((code) => ({ code }))
      },
      ratePlan: {
        id: input.ratePlanId,
        ...(input.corporateId ? { corporateIds: [input.corporateId] } : {})
      },
      guestCount: {
        adultCount: input.adults ?? 1,
        childAges: input.childAges ?? []
      }
    }
    const { data } = await this.request(
      "POST",
      `${PREFIX_SEARCH}/v1/properties/${propertyId}/extra-stays`,
      body
    )
    const extraStays = data?.extraStays
    const mapOption = (s) => ({
      dateTimeLocal: s.dateTimeLocal,
      price: s.total?.priceBeforeTax ?? 0,
      currency: s.currencyCode ?? "RUB"
    })
    return {
      earlyCheckIn: (extraStays?.earlyCheckIn ?? []).map(mapOption),
      lateCheckOut: (extraStays?.lateCheckOut ?? []).map(mapOption)
    }
  }

  // ─── Corporate clients ────────────────────────────────────────────────────

  async createCorporate(data) {
    const body = {
      taxpayerIdentificationNumber: data.inn,
      registrationReasonCode: data.kpp
    }
    const { data: res } = await this.request(
      "POST",
      `${PREFIX_REFERENCE_DATA}/corporates`,
      body
    )
    const mapped = this._mapCorporate(res?.corporate ?? res)
    // Сохраняем в локальную БД — TravelLine не предоставляет endpoint для списка
    try {
      await prisma.tlCorporateRecord.upsert({
        where: { id: mapped.id },
        create: { id: mapped.id, legalName: mapped.legalName || null, inn: mapped.inn || null, kpp: mapped.kpp || null },
        update: { legalName: mapped.legalName || null }
      })
    } catch (err) {
      logger.warn(`createCorporate: failed to save locally: ${err?.message}`)
    }
    return mapped
  }

  async getCorporate(corporateId) {
    const { data } = await this.request(
      "GET",
      `${PREFIX_REFERENCE_DATA}/corporates/${corporateId}`
    )
    return this._mapCorporate(data?.corporate ?? data)
  }

  async listCorporates() {
    // TravelLine не предоставляет endpoint для получения списка корп. клиентов,
    // поэтому возвращаем из локальной БД (туда записываются при создании)
    const records = await prisma.tlCorporateRecord.findMany({ orderBy: { createdAt: "asc" } })
    return records.map((r) => ({ id: r.id, legalName: r.legalName ?? "", inn: r.inn ?? null, kpp: r.kpp ?? null, raw: "{}" }))
  }

  _mapCorporate(c) {
    if (!c) return null
    return {
      id: String(c.id ?? ""),
      legalName: c.legalName ?? "",
      inn: c.taxpayerIdentificationNumber ?? c.inn ?? null,
      kpp: c.registrationReasonCode ?? c.kpp ?? null,
      raw: JSON.stringify(c)
    }
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

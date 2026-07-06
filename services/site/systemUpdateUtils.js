const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/

export const SYSTEM_UPDATE_AUDIENCES = ["AIRLINE", "DISPATCHER", "HOTEL"]

const AUDIENCE_FIELD_MAP = {
  AIRLINE: "airline",
  DISPATCHER: "dispatcher",
  HOTEL: "hotel"
}

export function parseVersion(version) {
  if (!SEMVER_PATTERN.test(version)) return null
  return version.split(".").map((part) => Number(part))
}

export function compareVersions(a, b) {
  const partsA = parseVersion(a)
  const partsB = parseVersion(b)

  if (!partsA || !partsB) {
    throw new Error("Версия должна быть в формате X.Y.Z")
  }

  for (let i = 0; i < 3; i += 1) {
    if (partsA[i] > partsB[i]) return 1
    if (partsA[i] < partsB[i]) return -1
  }

  return 0
}

export function resolveSystemUpdateAudience(context) {
  if (context?.subjectType !== "USER" || !context?.subject) {
    return null
  }

  const { role, dispatcher } = context.subject

  if (role === "SUPERADMIN") {
    return "ALL"
  }

  if (
    role === "REPRESENTATIVE" ||
    (typeof role === "string" && role.startsWith("AIRLINE"))
  ) {
    return "AIRLINE"
  }

  if (typeof role === "string" && role.startsWith("HOTEL")) {
    return "HOTEL"
  }

  if (
    (typeof role === "string" && role.startsWith("DISPATCHER")) ||
    dispatcher === true
  ) {
    return "DISPATCHER"
  }

  return null
}

function emptySection() {
  return { new: [], updates: [], fixes: [] }
}

export function normalizeChangeItem(item) {
  const title = typeof item?.title === "string" ? item.title.trim() : ""
  const description =
    typeof item?.description === "string" && item.description.trim()
      ? item.description.trim()
      : null

  return { title, description }
}

export function normalizeSection(section) {
  const source = section ?? {}
  const normalizeList = (list) =>
    Array.isArray(list)
      ? list.map(normalizeChangeItem).filter((item) => item.title)
      : []

  return {
    new: normalizeList(source.new),
    updates: normalizeList(source.updates),
    fixes: normalizeList(source.fixes)
  }
}

export function hasSectionContent(section) {
  if (!section) return false
  return ["new", "updates", "fixes"].some(
    (key) => Array.isArray(section[key]) && section[key].length > 0
  )
}

export function getAudienceSection(record, audience) {
  const field = AUDIENCE_FIELD_MAP[audience]
  if (!field) return emptySection()
  return normalizeSection(record?.[field])
}

export function hasAnyReleaseContent(record) {
  return SYSTEM_UPDATE_AUDIENCES.some((audience) =>
    hasSectionContent(getAudienceSection(record, audience))
  )
}

export function hasVisibleContentForAudience(record, audienceKey) {
  if (audienceKey === "ALL") {
    return hasAnyReleaseContent(record)
  }

  if (!audienceKey) return false
  return hasSectionContent(getAudienceSection(record, audienceKey))
}

export function buildAudienceBlocks(record, audienceKey) {
  const audiences =
    audienceKey === "ALL" ? SYSTEM_UPDATE_AUDIENCES : [audienceKey]

  return audiences
    .filter(Boolean)
    .map((audience) => ({
      audience,
      sections: getAudienceSection(record, audience)
    }))
}

export function computeShouldShow(
  { enabled, version },
  lastSeenAppVersion,
  audienceKey,
  record
) {
  if (!enabled) return false
  if (!version) return false
  if (!audienceKey) return false
  if (!hasVisibleContentForAudience(record, audienceKey)) return false
  if (!lastSeenAppVersion) return true
  return version !== lastSeenAppVersion
}

export function toSystemUpdateResponse(
  record,
  lastSeenAppVersion = null,
  context = null
) {
  const version = record?.version ?? ""
  const title = record?.title ?? ""
  const enabled = record?.enabled ?? false
  const publishedAt = record?.publishedAt ?? null
  const audienceKey = context ? resolveSystemUpdateAudience(context) : null

  return {
    version: version || null,
    title: title || null,
    enabled,
    publishedAt,
    audiences: audienceKey ? buildAudienceBlocks(record, audienceKey) : [],
    shouldShow: computeShouldShow(
      { enabled, version },
      lastSeenAppVersion,
      audienceKey,
      record
    )
  }
}

export function audiencesInputToRecordData(audiences) {
  const data = {
    airline: emptySection(),
    dispatcher: emptySection(),
    hotel: emptySection()
  }

  if (!Array.isArray(audiences)) return data

  for (const block of audiences) {
    const field = AUDIENCE_FIELD_MAP[block?.audience]
    if (!field) continue
    data[field] = normalizeSection(block.sections)
  }

  return data
}

export function validateSystemUpdateInput({ enabled, version, title, audiences }) {
  const normalizedVersion = typeof version === "string" ? version.trim() : ""
  const normalizedTitle = typeof title === "string" ? title.trim() : ""

  if (!enabled) return

  if (!normalizedVersion || !parseVersion(normalizedVersion)) {
    throw new Error("Версия обязательна и должна быть в формате X.Y.Z")
  }

  if (!normalizedTitle) {
    throw new Error("Заголовок обязателен, когда уведомление включено")
  }

  if (!Array.isArray(audiences) || audiences.length !== 3) {
    throw new Error("Нужно передать ровно 3 аудитории: AIRLINE, DISPATCHER, HOTEL")
  }

  const seen = new Set()
  let hasAnyItem = false

  for (const block of audiences) {
    const audience = block?.audience
    if (!SYSTEM_UPDATE_AUDIENCES.includes(audience)) {
      throw new Error("Недопустимая аудитория обновления")
    }

    if (seen.has(audience)) {
      throw new Error("Аудитории не должны повторяться")
    }
    seen.add(audience)

    const section = normalizeSection(block.sections)
    for (const key of ["new", "updates", "fixes"]) {
      for (const item of section[key]) {
        if (!item.title) {
          throw new Error("У каждого пункта обновления должен быть заголовок")
        }
        hasAnyItem = true
      }
    }
  }

  if (!hasAnyItem) {
    throw new Error(
      "Добавьте хотя бы один пункт обновления в любой аудитории"
    )
  }
}

export function messageToLegacySection(message) {
  const lines = String(message ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({
      title: line.replace(/^[•\-]\s*/, ""),
      description: null
    }))
    .filter((item) => item.title)

  return {
    new: [],
    updates: lines,
    fixes: []
  }
}

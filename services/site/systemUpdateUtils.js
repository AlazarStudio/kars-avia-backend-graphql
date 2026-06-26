const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/

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

export function computeShouldShow({ enabled, version }, lastSeenAppVersion) {
  if (!enabled) return false
  if (!version) return false
  if (!lastSeenAppVersion) return true
  return version !== lastSeenAppVersion
}

export function toSystemUpdateResponse(record, lastSeenAppVersion = null) {
  const version = record?.version ?? ""
  const title = record?.title ?? ""
  const message = record?.message ?? ""
  const enabled = record?.enabled ?? false
  const publishedAt = record?.publishedAt ?? null

  return {
    version: version || null,
    title: title || null,
    message: message || null,
    enabled,
    publishedAt,
    shouldShow: computeShouldShow({ enabled, version }, lastSeenAppVersion)
  }
}

export function validateSystemUpdateInput({ enabled, version, title, message }) {
  const normalizedVersion = typeof version === "string" ? version.trim() : ""
  const normalizedTitle = typeof title === "string" ? title.trim() : ""
  const normalizedMessage = typeof message === "string" ? message.trim() : ""

  if (!enabled) return

  if (!normalizedVersion || !parseVersion(normalizedVersion)) {
    throw new Error("Версия обязательна и должна быть в формате X.Y.Z")
  }

  if (!normalizedTitle) {
    throw new Error("Заголовок обязателен, когда уведомление включено")
  }

  if (!normalizedMessage) {
    throw new Error("Текст обновления обязателен, когда уведомление включено")
  }
}

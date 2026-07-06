import { v4 as uuidv4 } from "uuid"

const normalizeOptionalString = (value) => {
  if (value == null) return null
  const trimmed = String(value).trim()
  return trimmed === "" ? null : trimmed
}

export const normalizePersonType = (value) =>
  value === "CREW" ? "CREW" : "PASSENGER"

// всё, кроме CHILD/INFANT (в т.ч. undefined у легаси), считаем взрослым
export const normalizePersonCategory = (value) =>
  value === "CHILD" || value === "INFANT" ? value : "ADULT"

export const normalizeFullNameKey = (fullName) =>
  String(fullName ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")

export const rosterMatchKey = (person) => person?.personId || null

// Схлопывает реестр по personId, оставляя первое вхождение.
// Подстраховка от дублей с одинаковым personId.
export const dedupeSavedPassengers = (roster) => {
  const list = Array.isArray(roster) ? roster : []
  const seen = new Set()
  const out = []
  for (const person of list) {
    const key = rosterMatchKey(person)
    if (!key) {
      out.push(person)
      continue
    }
    if (seen.has(key)) continue
    seen.add(key)
    out.push(person)
  }
  return out
}

export const ensurePersonId = (person) => ({
  ...person,
  personId: person?.personId || uuidv4()
})

export const snapshotFromServicePerson = (person) => ({
  personId: person?.personId ?? null,
  fullName: person?.fullName,
  phone: person?.phone ?? null,
  seat: person?.seat ?? null,
  personType: "PASSENGER",
  personCategory: normalizePersonCategory(person?.personCategory),
  airlinePersonalId: null
})

export const snapshotFromHotelPerson = (person) => ({
  personId: person?.personId ?? null,
  fullName: person?.fullName,
  phone: person?.phone ?? null,
  seat: null,
  personType: normalizePersonType(person?.personType),
  personCategory: normalizePersonCategory(person?.personCategory),
  airlinePersonalId: normalizeOptionalString(person?.airlinePersonalId)
})

export const snapshotFromDriverPerson = (person) => ({
  personId: person?.personId ?? null,
  fullName: person?.fullName,
  phone: person?.phone ?? null,
  seat: null,
  personType: normalizePersonType(person?.personType),
  personCategory: normalizePersonCategory(person?.personCategory),
  airlinePersonalId: normalizeOptionalString(person?.airlinePersonalId)
})

export const normalizeSavedPerson = (person, { isNew = false } = {}) => {
  const fullName = String(person?.fullName ?? "").trim()
  if (!fullName) {
    throw new Error("fullName is required")
  }

  const normalized = {
    personId: person?.personId || uuidv4(),
    fullName,
    phone: normalizeOptionalString(person?.phone),
    seat: normalizeOptionalString(person?.seat),
    personType: normalizePersonType(person?.personType),
    personCategory: normalizePersonCategory(person?.personCategory),
    airlinePersonalId: normalizeOptionalString(person?.airlinePersonalId),
    addedAt: person?.addedAt ? new Date(person.addedAt) : new Date()
  }

  if (!isNew && !person?.personId) {
    return normalized
  }

  return normalized
}

const mergeSavedPerson = (existing, incoming) => ({
  ...existing,
  fullName: incoming.fullName || existing.fullName,
  phone: incoming.phone ?? existing.phone,
  seat: incoming.seat ?? existing.seat,
  personType: incoming.personType ?? existing.personType,
  // первично захваченная категория не затирается дефолтным ADULT из повторного добавления;
  // явные правки категории придут в Этапе 2 через мутацию ростера
  personCategory: existing.personCategory ?? incoming.personCategory,
  airlinePersonalId:
    incoming.airlinePersonalId ?? existing.airlinePersonalId
})

/**
 * Добавляет или обновляет запись в savedPassengers по personId.
 */
export const upsertSavedPassenger = (roster, snapshot) => {
  const list = Array.isArray(roster) ? [...roster] : []
  const incoming = normalizeSavedPerson(snapshot, { isNew: true })
  const key = rosterMatchKey(incoming)
  if (!key) return list

  const index = list.findIndex((item) => rosterMatchKey(item) === key)
  if (index === -1) {
    return [...list, incoming]
  }

  const next = [...list]
  next[index] = mergeSavedPerson(
    ensurePersonId(list[index]),
    incoming
  )
  return next
}

// Backend-propagation: явная правка сервис-персоны переносит её идентичность в ростер
// (incoming-wins — правка приоритетнее захваченного значения).
// Сервис-объект несёт ТОЛЬКО свои поля как ключи, поэтому {...base, ...servicePerson}
// сохраняет поля ростера, которых у услуги нет (напр. seat у отеля, personType у воды),
// а normalizeSavedPerson выбирает лишь идентичность (placement-поля игнорируются).
export const patchSavedPersonIdentity = (roster, servicePerson) => {
  const list = Array.isArray(roster) ? [...roster] : []
  const personId = servicePerson?.personId
  if (!personId) return list
  if (!String(servicePerson?.fullName ?? "").trim()) return list

  const idx = list.findIndex((p) => p?.personId === personId)
  const base = idx === -1 ? {} : list[idx]
  const merged = normalizeSavedPerson(
    { ...base, ...servicePerson, personId },
    { isNew: idx === -1 }
  )
  if (idx === -1) return [...list, merged]

  const next = [...list]
  next[idx] = merged
  return next
}

export const updateSavedPersonInRoster = (roster, personId, patch) => {
  const list = Array.isArray(roster) ? [...roster] : []
  const index = list.findIndex((item) => item?.personId === personId)
  if (index === -1) {
    throw new Error("Saved passenger not found")
  }

  const merged = normalizeSavedPerson(
    {
      ...list[index],
      ...patch,
      personId
    },
    { isNew: false }
  )

  const key = rosterMatchKey(merged)
  const duplicateIndex = list.findIndex(
    (item, i) => i !== index && rosterMatchKey(item) === key
  )
  if (duplicateIndex !== -1) {
    throw new Error("Saved passenger with same identity already exists")
  }

  const next = [...list]
  next[index] = merged
  return next
}

export const removeSavedPersonFromRoster = (roster, personId) => {
  const list = Array.isArray(roster) ? roster : []
  const next = list.filter((item) => item?.personId !== personId)
  if (next.length === list.length) {
    throw new Error("Saved passenger not found")
  }
  return next
}

// Пакетный импорт (манифест): матчинг по нормализованному ФИО, жадный 1:1 —
// каждая входная персона поглощает максимум одну ещё-не-сматченную запись
// реестра (близнецы из файла = две записи, повторный импорт идемпотентен).
// Совпадение — existing-wins с дозаполнением пустых phone/seat и повышением
// категории ADULT → CHILD/INFANT (манифест авторитетнее дефолта; понижения нет).
// Записи с пустым fullName пропускаются, не роняя импорт.
export const mergeManifestPeopleIntoRoster = (roster, people) => {
  const list = Array.isArray(roster) ? [...roster] : []
  const consumed = new Set()
  let addedCount = 0
  let matchedCount = 0

  for (const person of Array.isArray(people) ? people : []) {
    const nameKey = normalizeFullNameKey(person?.fullName)
    if (!nameKey) continue

    const index = list.findIndex(
      (item, i) =>
        !consumed.has(i) && normalizeFullNameKey(item?.fullName) === nameKey
    )

    if (index === -1) {
      list.push(normalizeSavedPerson(person, { isNew: true }))
      consumed.add(list.length - 1)
      addedCount += 1
      continue
    }

    const existing = ensurePersonId(list[index])
    list[index] = {
      ...existing,
      phone: existing.phone ?? normalizeOptionalString(person?.phone),
      seat: existing.seat ?? normalizeOptionalString(person?.seat),
      personCategory:
        existing.personCategory == null || existing.personCategory === "ADULT"
          ? normalizePersonCategory(person?.personCategory)
          : existing.personCategory
    }
    consumed.add(index)
    matchedCount += 1
  }

  return { roster: list, addedCount, matchedCount }
}

// Нормализаторы ФАП: приведение персон, номеров и водителей к каноническому
// виду перед записью в composite-типы. Вынесены из резолвера как есть.

import { normalizeDriverPerson } from "./baggageDelivery.js"
import {
  normalizePersonCategory,
  normalizePersonType
} from "./savedPassengers.js"

// Локальные копии в резолвере дословно повторяли эти экспорты — реэкспортируем,
// чтобы правило жило в одном месте.
export { normalizePersonCategory, normalizePersonType }

export const normalizeOptionalString = (value) => {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed || null
}

export const ensureAccommodationChesses = (person, hotelIndex, hotelName) => {
  const existing = Array.isArray(person?.accommodationChesses)
    ? person.accommodationChesses
    : []
  if (existing.length > 0) return existing
  return [
    {
      hotelIndex,
      hotelName: hotelName || null,
      startAt: new Date(),
      endAt: null,
      reason: null
    }
  ]
}

export const ensureHotelPerson = (person, hotelIndex, hotelName) => ({
  ...person,
  arrival: person.arrival ?? null,
  departure: person.departure ?? null,
  roomCategory: person.roomCategory ?? null,
  roomKind: person.roomKind ?? null,
  personType: normalizePersonType(person?.personType),
  personCategory: normalizePersonCategory(person?.personCategory),
  airlinePersonalId: normalizeOptionalString(person?.airlinePersonalId),
  accommodationChesses: ensureAccommodationChesses(
    person,
    hotelIndex,
    hotelName
  )
})

export const makeRoomCategoryLabel = (roomCategory, roomKind) => {
  const category = roomCategory?.trim()
  const kind = roomKind?.trim()
  if (category && kind) return `${category} / ${kind}`
  return category || kind || ""
}

export const normalizeCrewMember = (member = {}) => ({
  airlinePersonalId: normalizeOptionalString(member?.airlinePersonalId),
  fullName: member?.fullName?.trim?.() || "",
  position: normalizeOptionalString(member?.position),
  gender: normalizeOptionalString(member?.gender),
  phone: normalizeOptionalString(member?.phone)
})

// Имя embedded-поля трансфера по направлению (ARRIVAL = аэропорт→гостиница)
export const getTransferField = (direction) => {
  if (direction === "DEPARTURE") return "departureTransferService"
  if (direction === "INTERCITY") return "intercityTransferService"
  return "transferService"
}

export const getTransferServiceKind = (direction) => {
  if (direction === "DEPARTURE") return "transfer_departure"
  if (direction === "INTERCITY") return "transfer_intercity"
  return "transfer"
}

// Белый список полей пассажира остаётся здесь: в composite-тип не должно утечь
// ничего лишнего. Три поля доставки багажа (бирки, цена, адрес) не нормализуем
// повторно — отдаём сырьё в normalizeDriverPerson, чтобы правила жили в одном
// месте (там же чинится null в baggageTags у легаси-пассажиров).
export const ensureDriverPerson = (p) =>
  normalizeDriverPerson({
    personId: p?.personId ?? null,
    fullName: (p?.fullName?.trim?.() ?? "") || "",
    phone: normalizeOptionalString(p?.phone),
    personType: normalizePersonType(p?.personType),
    personCategory: normalizePersonCategory(p?.personCategory),
    airlinePersonalId: normalizeOptionalString(p?.airlinePersonalId),
    baggageTags: p?.baggageTags,
    reportCost: p?.reportCost,
    addressTo: p?.addressTo
  })

export const normalizePassengerServiceDriver = (driver = {}) => ({
  ...driver,
  fullName: driver?.fullName?.trim?.() || "",
  phone: normalizeOptionalString(driver?.phone),
  link: normalizeOptionalString(driver?.link),
  addressFrom: normalizeOptionalString(driver?.addressFrom),
  addressTo: normalizeOptionalString(driver?.addressTo),
  description: normalizeOptionalString(driver?.description),
  hotelItemId: normalizeOptionalString(driver?.hotelItemId),
  people: Array.isArray(driver?.people)
    ? driver.people.map(ensureDriverPerson)
    : []
})

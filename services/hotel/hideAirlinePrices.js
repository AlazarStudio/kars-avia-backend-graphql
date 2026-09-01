import { resolveScope } from "../passengerRequest/fapScope.js"

const AIRLINE_PRICE_KEYS = [
  "mealPriceForAir",
  "mealPriceForAirReq",
  "transferPriceForAir",
  "transferPriceForAirReq",
  "priceForAirline",
  "priceForAirReq"
]

const NESTED_LISTS = ["roomKind", "rooms", "additionalServices"]

export function shouldHideAirlinePrices(context) {
  return resolveScope(context).kind === "hotel"
}

const omitAirlineKeys = (obj) => {
  if (obj == null || typeof obj !== "object") return obj
  const next = { ...obj }
  for (const key of AIRLINE_PRICE_KEYS) delete next[key]
  return next
}

// Гостиница не должна перезаписывать наценку Kars, даже если старый клиент
// прислал null после маскирования на чтении.
export function omitAirlinePriceWrites(input, context) {
  if (!input || !shouldHideAirlinePrices(context)) return input
  const next = omitAirlineKeys(input)
  for (const listKey of NESTED_LISTS) {
    if (Array.isArray(next[listKey])) {
      next[listKey] = next[listKey].map(omitAirlineKeys)
    }
  }
  return next
}

export const hiddenAirlinePrice = (value, context) =>
  shouldHideAirlinePrices(context) ? null : (value ?? null)

export const hiddenAirlineFlag = (value, context) =>
  shouldHideAirlinePrices(context) ? false : Boolean(value)

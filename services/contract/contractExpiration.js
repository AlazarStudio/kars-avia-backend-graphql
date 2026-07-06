const EXPIRING_SOON_MONTHS = 3

export const startOfUtcDay = (value) => {
  const date = new Date(value)
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  )
}

const addUtcMonths = (value, months) => {
  const date = new Date(value)
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth() + months,
      date.getUTCDate()
    )
  )
}

export const getContractExpirationMeta = (
  contractEndDate,
  now = new Date()
) => {
  if (!contractEndDate) {
    return {
      daysUntilEnd: null,
      isExpiringSoon: false,
      isExpired: false,
      expirationPriority: 500_000
    }
  }

  const end = startOfUtcDay(contractEndDate)
  const today = startOfUtcDay(now)
  const diffMs = end.getTime() - today.getTime()
  const daysUntilEnd = Math.ceil(diffMs / (24 * 60 * 60 * 1000))
  const isExpired = daysUntilEnd < 0
  const expiringSoonLimit = addUtcMonths(today, EXPIRING_SOON_MONTHS)
  const isExpiringSoon =
    !isExpired && end.getTime() <= expiringSoonLimit.getTime()

  let expirationPriority
  if (isExpired) {
    expirationPriority = 400_000 - daysUntilEnd
  } else if (isExpiringSoon) {
    expirationPriority = daysUntilEnd
  } else {
    expirationPriority = 100_000 + daysUntilEnd
  }

  return {
    daysUntilEnd,
    isExpiringSoon,
    isExpired,
    expirationPriority
  }
}

export const compareContractsByExpiration = (a, b) => {
  const metaA = getContractExpirationMeta(a.contractEndDate)
  const metaB = getContractExpirationMeta(b.contractEndDate)

  if (metaA.expirationPriority !== metaB.expirationPriority) {
    return metaA.expirationPriority - metaB.expirationPriority
  }

  const createdAtA = a.createdAt ? new Date(a.createdAt).getTime() : 0
  const createdAtB = b.createdAt ? new Date(b.createdAt).getTime() : 0
  return createdAtB - createdAtA
}

export const sortContractsByExpiration = (contracts) =>
  [...contracts].sort(compareContractsByExpiration)

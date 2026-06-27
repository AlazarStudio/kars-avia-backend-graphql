// Построение Prisma-where для списка трансферов.
// Зеркало services/request/buildRequestListWhere.js, адаптированное под модель Transfer:
// статус-enum, диапазон по scheduledPickupAt, текстовый поиск по №/адресам/авиакомпании/пассажиру.
export function buildTransferListWhere({ pagination = {}, user }) {
  const {
    search,
    status,
    scheduledFrom,
    scheduledTo,
    driverId,
    personId,
    dispatcherId,
    organizationId,
    airlineId: inputAirlineId
  } = pagination || {}

  // Доступ: авиакомпания видит только свои трансферы; guard на mismatch (как в исходном резолвере)
  const ctxAirlineId = user?.airlineId || null
  const finalAirlineId = ctxAirlineId || inputAirlineId || null
  if (ctxAirlineId && inputAirlineId && ctxAirlineId !== inputAirlineId) {
    throw new Error("Forbidden: airlineId mismatch with current user")
  }

  // exact-match — сохраняем поведение исходного резолвера
  const exactMatchFilters = {
    ...(driverId != undefined && { driverId }),
    ...(personId != undefined && {
      persons: { some: { personalId: personId } }
    }),
    ...(dispatcherId != undefined && { dispatcherId }),
    ...(organizationId != undefined && { organizationId }),
    ...(finalAirlineId != undefined && { airlineId: finalAirlineId })
  }

  const statusFilter =
    status && status.length > 0 && !status.includes("all")
      ? { status: { in: status } }
      : {}

  const dateFilter =
    scheduledFrom && scheduledTo
      ? {
          scheduledPickupAt: {
            gte: new Date(scheduledFrom),
            lte: new Date(
              new Date(scheduledTo).getTime() + 24 * 60 * 60 * 1000
            )
          }
        }
      : {}

  const searchFilter = search
    ? {
        OR: [
          { requestNumber: { contains: search, mode: "insensitive" } },
          { fromAddress: { contains: search, mode: "insensitive" } },
          { toAddress: { contains: search, mode: "insensitive" } },
          { airline: { name: { contains: search, mode: "insensitive" } } },
          {
            persons: {
              some: {
                personal: {
                  name: { contains: search, mode: "insensitive" }
                }
              }
            }
          },
          {
            persons: {
              some: {
                personal: {
                  email: { contains: search, mode: "insensitive" }
                }
              }
            }
          }
        ]
      }
    : null

  const filters = [
    exactMatchFilters,
    statusFilter,
    dateFilter,
    ...(searchFilter ? [searchFilter] : [])
  ]

  return { AND: filters }
}

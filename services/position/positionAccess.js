import { GraphQLError } from "graphql"

export const AIRLINE_POSITION_SEPARATORS = ["airline", "airlineUser"]

export function isAirlinePosition(position) {
  return (
    position &&
    AIRLINE_POSITION_SEPARATORS.includes(position.separator)
  )
}

export function resolveAirlineId(context, requestedAirlineId) {
  const { subject } = context
  if (!subject) {
    throw new GraphQLError("Access forbidden: No auth subject provided.", {
      extensions: { code: "UNAUTHORIZED" }
    })
  }

  const role = subject.role

  if (role === "AIRLINEADMIN") {
    if (!subject.airlineId) {
      throw new GraphQLError(
        "Пользователь не привязан к авиакомпании",
        { extensions: { code: "FORBIDDEN" } }
      )
    }
    if (requestedAirlineId && requestedAirlineId !== subject.airlineId) {
      throw new GraphQLError(
        "Доступ запрещён: можно работать только с должностями своей авиакомпании",
        { extensions: { code: "FORBIDDEN" } }
      )
    }
    return subject.airlineId
  }

  if (role === "SUPERADMIN" || role === "DISPATCHERADMIN") {
    if (!requestedAirlineId) {
      throw new GraphQLError("airlineId обязателен", {
        extensions: { code: "BAD_USER_INPUT" }
      })
    }
    return requestedAirlineId
  }

  throw new GraphQLError("Access forbidden: Insufficient rights.", {
    extensions: { code: "FORBIDDEN" }
  })
}

export async function assertAirlinePositionForUser(prisma, positionId, airlineId) {
  if (!positionId) {
    return
  }

  const position = await prisma.position.findUnique({
    where: { id: positionId }
  })

  if (!position) {
    throw new GraphQLError("Должность не найдена", {
      extensions: { code: "NOT_FOUND" }
    })
  }

  if (!isAirlinePosition(position)) {
    return
  }

  if (!airlineId) {
    throw new GraphQLError(
      "Для назначения должности авиакомпании необходимо указать airlineId",
      { extensions: { code: "BAD_USER_INPUT" } }
    )
  }

  if (!position.airlineId || position.airlineId !== airlineId) {
    throw new GraphQLError(
      "Должность не принадлежит указанной авиакомпании",
      { extensions: { code: "FORBIDDEN" } }
    )
  }
}

export function assertPositionAccess(context, position, requestedAirlineId) {
  if (!position) {
    throw new GraphQLError("Должность не найдена", {
      extensions: { code: "NOT_FOUND" }
    })
  }

  if (!isAirlinePosition(position)) {
    return
  }

  const airlineId = resolveAirlineId(context, requestedAirlineId ?? position.airlineId)

  if (!position.airlineId || position.airlineId !== airlineId) {
    throw new GraphQLError(
      "Доступ запрещён: должность не принадлежит указанной авиакомпании",
      { extensions: { code: "FORBIDDEN" } }
    )
  }
}

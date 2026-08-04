// «Конверт» мутаций ФАП: чтение заявки, публикация в подписку, проверки
// аргументов и дефолты embedded-сервисов. Вынесено из резолвера как есть.

import { GraphQLError } from "graphql"
import { prisma } from "../../prisma.js"
import { pubsub, PASSENGER_REQUEST_UPDATED } from "../infra/pubsub.js"
import { hydratePassengerRequest } from "./hydratePassengerRequest.js"

export const getSubjectName = (context) => {
  if (context.user?.name) return context.user.name
  if (context.externalUser?.name) return context.externalUser.name
  if (context.externalUser?.email)
    return `Внеш. пользователь (${context.externalUser.email})`
  if (context.subject?.name) return context.subject.name
  if (context.subject?.email) return context.subject.email
  return "Неизвестный пользователь"
}

// ── Общие хелперы мутаций ФАП (единый «конверт») ──
// ВНИМАНИЕ: мутации читают заявку ТОЛЬКО отсюда — это сырьё из Prisma, и менять
// это на hydratePassengerRequest нельзя. Гидрация накладывает на пассажира ключ
// seat, которого нет в composite-типе PassengerServiceDriverPerson, а
// normalizeDriversForWrite пассажиров не фильтрует, а спредит как есть — любой
// путь записи водителей, прочитавший заявку через гидрацию, упадёт на неизвестном
// аргументе. Гидрация — исключительно для чтения и публикации в подписку.
export const loadRequestOrThrow = async (id) => {
  const existing = await prisma.passengerRequest.findUnique({ where: { id } })
  if (!existing) throw new GraphQLError("PassengerRequest not found")
  return existing
}

export const publishPassengerRequestUpdated = (passengerRequest) =>
  pubsub.publish(PASSENGER_REQUEST_UPDATED, {
    passengerRequestUpdated: hydratePassengerRequest(passengerRequest)
  })

export const assertIndex = (index, length, label) => {
  if (index < 0 || index >= length) {
    throw new GraphQLError(`Invalid ${label}`)
  }
}

export const assertReason = (reason) => {
  const trimmed = reason?.trim()
  if (!trimmed) throw new GraphQLError("Reason is required")
  return trimmed
}

// Дефолты embedded-сервисов, когда сервис ещё не создан
export const emptyPeopleService = () => ({
  plan: null,
  status: "NEW",
  times: null,
  earlyCompletionReason: null,
  earlyCompletedAt: null,
  people: []
})

export const emptyLivingService = () => ({
  plan: null,
  status: "NEW",
  times: null,
  hotels: [],
  evictions: []
})

export const emptyDriversService = () => ({
  plan: null,
  status: "NEW",
  times: null,
  drivers: []
})

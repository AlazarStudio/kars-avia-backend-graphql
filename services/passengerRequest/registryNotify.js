// Уведомления по реестру услуг ФАП: сайтовое + письмо. Образец —
// services/report/notifyReportSubmit.js и notifyReportDecision.js (черновики
// Отчётов v2 — тоже документ без заявки). Оба канала обёрнуты: побочка не
// должна ронять уже записанную стадию.

import { prisma } from "../../prisma.js"
import { pubsub, NOTIFICATION } from "../infra/pubsub.js"
import { shouldSendNotification } from "../notification/notificationRateGuard.js"
import { sendRequestPartyEmail } from "../notification/sendRequestPartyEmail.js"
import { escapeHtml } from "../email/escapeHtml.js"
import {
  buildRegistrySubmittedEmail,
  buildRegistryApprovedEmail,
  buildRegistryRevokedEmail,
  registryTitle
} from "../email/registryEmailTemplates.js"

export const REGISTRY_ACTIONS = {
  submit: "submit_passenger_service_registry",
  approve: "approve_passenger_service_registry_airline",
  revoke: "revoke_passenger_service_registry_airline"
}

const ENTITY_TYPE = "passenger_service_registry"

async function loadParties(registry) {
  const [airline, airport] = await Promise.all([
    prisma.airline.findUnique({ where: { id: registry.airlineId } }),
    registry.airportId
      ? prisma.airport.findUnique({ where: { id: registry.airportId } })
      : null
  ])
  return { airline, city: airport?.city ?? null }
}

async function notifySite({ registry, airline, action, descriptionHtml }) {
  const allowed = shouldSendNotification({
    channel: "site",
    action,
    entityType: ENTITY_TYPE,
    entityId: registry.id
  }).allowed
  if (!allowed) return

  await prisma.notification.create({
    data: {
      airline: { connect: { id: registry.airlineId } },
      description: { action, description: descriptionHtml }
    }
  })

  pubsub.publish(NOTIFICATION, {
    notification: {
      __typename: "PassengerServiceRegistryNotification",
      action,
      registryId: registry.id,
      airlineId: registry.airlineId,
      airline: airline || null
    }
  })
}

// wasApproved — было ли утверждение до отказа авиакомпании. Отказ от
// неутверждённого реестра это возврат на доработку, отозвать в нём нечего.
async function deliver({ registry, actor, kind, comment = null, wasApproved = true }) {
  if (!registry?.id || !registry?.airlineId) return
  const action = REGISTRY_ACTIONS[kind]
  const { airline, city } = await loadParties(registry)
  const title = registryTitle(registry, city)

  const revokeHtml = wasApproved
    ? `Авиакомпания отозвала утверждение: <span style='color:#545873'>${escapeHtml(title)}</span>`
    : `Авиакомпания вернула на доработку: <span style='color:#545873'>${escapeHtml(title)}</span>`
  const descriptionHtml =
    kind === "submit"
      ? `<span style='color:#545873'>${escapeHtml(title)}</span> отправлен на утверждение`
      : kind === "approve"
        ? `<span style='color:#545873'>${escapeHtml(title)}</span> утверждён авиакомпанией`
        : revokeHtml

  try {
    await notifySite({ registry, airline, action, descriptionHtml })
  } catch (error) {
    console.error("Ошибка сайтового уведомления по реестру:", error)
  }

  try {
    const build =
      kind === "submit"
        ? buildRegistrySubmittedEmail
        : kind === "approve"
          ? buildRegistryApprovedEmail
          : buildRegistryRevokedEmail
    const { subject, html } = build({
      registry,
      airlineName: airline?.name,
      city,
      comment,
      wasApproved
    })
    // Направление выбирает sendRequestPartyEmail по актору: решение авиакомпании
    // уходит диспетчерским отделам, отправка диспетчером — отделам авиакомпании.
    // alsoNotifyAirline у отправки: диспетчерский пользователь без флага
    // `dispatcher` ушёл бы веткой диспетчеров — тогда АК получает письмо вторым списком.
    await sendRequestPartyEmail({
      actor,
      airlineId: registry.airlineId,
      action,
      subject,
      html,
      entityType: ENTITY_TYPE,
      entityId: registry.id,
      dispatcherFallbackTo: "EMAIL_RECEIVER",
      alsoNotifyAirline: kind === "submit"
    })
  } catch (error) {
    console.error("Ошибка отправки email по реестру:", error)
  }
}

export function notifyRegistrySubmitted({ registry, actor }) {
  return deliver({ registry, actor, kind: "submit" })
}

export function notifyRegistryApproved({ registry, actor, comment }) {
  return deliver({ registry, actor, kind: "approve", comment })
}

export function notifyRegistryRevoked({ registry, actor, comment, wasApproved }) {
  return deliver({ registry, actor, kind: "revoke", comment, wasApproved })
}

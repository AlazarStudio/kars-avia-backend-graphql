import { prisma } from "../../prisma.js"
import { sendNotificationToSubject } from "../infra/fbsendtoken.js"

const SUBJECT = {
  USER: "USER",
  DRIVER: "DRIVER",
  AIRLINE_PERSONAL: "AIRLINE_PERSONAL"
}

const STATUS_BROADCAST_SET = new Set([
  "ACCEPTED",
  "ARRIVED",
  "IN_PROGRESS_TO_CLIENT",
  "IN_PROGRESS_TO_HOTEL",
  "COMPLETED",
  "CANCELLED"
])

const recipientKey = (recipient) => `${recipient.subjectType}:${recipient.subjectId}`

const withoutActor = (recipients, actor) =>
  recipients.filter(
    (recipient) =>
      !(recipient.subjectType === actor.subjectType && recipient.subjectId === actor.subjectId)
  )

const dedupeRecipients = (recipients) => {
  const map = new Map()
  for (const recipient of recipients) {
    map.set(recipientKey(recipient), recipient)
  }
  return Array.from(map.values())
}

const sendToRecipients = async (recipients, title, body, data = {}) => {
  const settled = await Promise.allSettled(
    recipients.map((recipient) =>
      sendNotificationToSubject(
        recipient.subjectType,
        recipient.subjectId,
        title,
        body,
        data
      )
    )
  )

  return settled
}

const resolveTransferActor = (context) => ({
  subjectType: context.subjectType,
  subjectId: context.subject?.id
})

const getPersonRecipients = async (transferId) => {
  const persons = await prisma.transferPassenger.findMany({
    where: { transferId },
    select: { personalId: true }
  })

  return persons
    .map((item) => item.personalId)
    .filter(Boolean)
    .map((personalId) => ({
      subjectType: SUBJECT.AIRLINE_PERSONAL,
      subjectId: personalId
    }))
}

const getCreatedByRecipientIfNotDispatcher = async (createdById) => {
  if (!createdById) return null

  const createdBy = await prisma.user.findUnique({
    where: { id: createdById },
    select: { id: true, dispatcher: true }
  })

  if (!createdBy || createdBy.dispatcher === true) {
    return null
  }

  return {
    subjectType: SUBJECT.USER,
    subjectId: createdBy.id
  }
}

export const notifyTransferCreated = async ({ transfer, context }) => {
  const actor = resolveTransferActor(context)
  if (!actor.subjectType || !actor.subjectId) return

  const dispatchers = await prisma.user.findMany({
    where: {
      dispatcher: true,
      active: true
    },
    select: { id: true }
  })

  const recipients = dedupeRecipients(
    withoutActor(
      dispatchers.map((item) => ({
        subjectType: SUBJECT.USER,
        subjectId: item.id
      })),
      actor
    )
  )

  if (!recipients.length) return

  await sendToRecipients(
    recipients,
    "Новая заявка трансфера",
    `${transfer.fromAddress || "Не указано"} -> ${transfer.toAddress || "Не указано"}`,
    {
      type: "new_transfer",
      transferId: transfer.id,
      status: transfer.status || "PENDING"
    }
  )
}

export const notifyTransferUpdated = async ({
  beforeTransfer,
  afterTransfer,
  input,
  context
}) => {
  const actor = resolveTransferActor(context)
  if (!actor.subjectType || !actor.subjectId) return

  const recipients = []

  const assignedToDriver =
    afterTransfer.status === "ASSIGNED" &&
    Boolean(afterTransfer.driverId) &&
    (input.driverId !== undefined || beforeTransfer.status !== "ASSIGNED")

  if (assignedToDriver) {
    recipients.push({
      subjectType: SUBJECT.DRIVER,
      subjectId: afterTransfer.driverId
    })
  }

  const statusChanged = beforeTransfer.status !== afterTransfer.status
  if (statusChanged && STATUS_BROADCAST_SET.has(afterTransfer.status)) {
    const personRecipients = await getPersonRecipients(afterTransfer.id)
    recipients.push(...personRecipients)

    const createdByRecipient = await getCreatedByRecipientIfNotDispatcher(
      afterTransfer.createdById
    )
    if (createdByRecipient) {
      recipients.push(createdByRecipient)
    }
  }

  const finalRecipients = dedupeRecipients(withoutActor(recipients, actor))
  if (!finalRecipients.length) return

  await sendToRecipients(
    finalRecipients,
    "Обновление заявки трансфера",
    `Статус: ${afterTransfer.status || "UPDATED"}`,
    {
      type: "transfer_status_update",
      transferId: afterTransfer.id,
      status: afterTransfer.status || "UPDATED",
      previousStatus: beforeTransfer.status || ""
    }
  )
}

export const notifyTransferChatMessage = async ({
  chat,
  messageText,
  authorType,
  senderUserId,
  senderDriverId,
  senderPersonalId
}) => {
  const recipients = []
  if (chat.dispatcherId) {
    recipients.push({ subjectType: SUBJECT.USER, subjectId: chat.dispatcherId })
  }
  if (chat.driverId) {
    recipients.push({ subjectType: SUBJECT.DRIVER, subjectId: chat.driverId })
  }
  for (const person of chat.persons || []) {
    if (person.personalId) {
      recipients.push({
        subjectType: SUBJECT.AIRLINE_PERSONAL,
        subjectId: person.personalId
      })
    }
  }

  const actor =
    authorType === "USER"
      ? { subjectType: SUBJECT.USER, subjectId: senderUserId }
      : authorType === "DRIVER"
        ? { subjectType: SUBJECT.DRIVER, subjectId: senderDriverId }
        : { subjectType: SUBJECT.AIRLINE_PERSONAL, subjectId: senderPersonalId }

  const finalRecipients = dedupeRecipients(withoutActor(recipients, actor))
  if (!finalRecipients.length) return

  await sendToRecipients(
    finalRecipients,
    "Новое сообщение в чате трансфера",
    messageText.length > 100 ? `${messageText.slice(0, 100)}...` : messageText,
    {
      type: "transfer_message",
      chatId: chat.id,
      transferId: chat.transferId,
      senderType: authorType
    }
  )
}


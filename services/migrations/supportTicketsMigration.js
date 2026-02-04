/**
 * Миграция: создание SupportTicket для существующих support-чатов.
 * Для каждого чата с isSupport: true без тикетов создаётся один SupportTicket
 * с текущим статусом чата. Сообщения привязываются к этому тикету.
 *
 * Запуск: node services/migrations/supportTicketsMigration.js
 */
import { prisma } from "../../prisma.js"

async function migrateSupportTickets() {
  const supportChats = await prisma.chat.findMany({
    where: { isSupport: true },
    include: {
      tickets: true,
      messages: true
    }
  })

  let migrated = 0
  let skipped = 0

  for (const chat of supportChats) {
    if (chat.tickets.length > 0) {
      skipped++
      continue
    }

    const ticket = await prisma.supportTicket.create({
      data: {
        chatId: chat.id,
        ticketNumber: 1,
        status: chat.supportStatus || "OPEN",
        assignedToId: chat.assignedToId,
        resolvedAt: chat.resolvedAt,
        resolvedById: chat.resolvedById
      }
    })

    if (chat.messages.length > 0) {
      await prisma.message.updateMany({
        where: { chatId: chat.id },
        data: { supportTicketId: ticket.id }
      })
    }

    migrated++
    console.log(`Migrated chat ${chat.id}: created ticket #${ticket.ticketNumber}`)
  }

  console.log(`Done. Migrated: ${migrated}, Skipped (already has tickets): ${skipped}`)
}

migrateSupportTickets()
  .catch((e) => {
    console.error("Migration failed:", e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())

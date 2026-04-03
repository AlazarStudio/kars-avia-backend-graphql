import { PrismaClient } from "@prisma/client"
import dotenv from "dotenv"

dotenv.config()

const prisma = new PrismaClient()

const ACTION_FIELDS = [
  {
    legacy: "requestCreate",
    email: "emailRequestCreate",
    sitePush: "sitePushRequestCreate"
  },
  {
    legacy: "requestDatesChange",
    email: "emailRequestDatesChange",
    sitePush: "sitePushRequestDatesChange"
  },
  {
    legacy: "requestPlacementChange",
    email: "emailRequestPlacementChange",
    sitePush: "sitePushRequestPlacementChange"
  },
  {
    legacy: "requestCancel",
    email: "emailRequestCancel",
    sitePush: "sitePushRequestCancel"
  },
  {
    legacy: "reserveCreate",
    email: "emailReserveCreate",
    sitePush: "sitePushReserveCreate"
  },
  {
    legacy: "reserveDatesChange",
    email: "emailReserveDatesChange",
    sitePush: "sitePushReserveDatesChange"
  },
  {
    legacy: "reserveUpdate",
    email: "emailReserveUpdate",
    sitePush: "sitePushReserveUpdate"
  },
  {
    legacy: "reservePlacementChange",
    email: "emailReservePlacementChange",
    sitePush: "sitePushReservePlacementChange"
  },
  {
    legacy: "passengerRequestCreate",
    email: "emailPassengerRequestCreate",
    sitePush: "sitePushPassengerRequestCreate"
  },
  {
    legacy: "passengerRequestDatesChange",
    email: "emailPassengerRequestDatesChange",
    sitePush: "sitePushPassengerRequestDatesChange"
  },
  {
    legacy: "passengerRequestUpdate",
    email: "emailPassengerRequestUpdate",
    sitePush: "sitePushPassengerRequestUpdate"
  },
  {
    legacy: "passengerRequestPlacementChange",
    email: "emailPassengerRequestPlacementChange",
    sitePush: "sitePushPassengerRequestPlacementChange"
  },
  {
    legacy: "passengerRequestCancel",
    email: "emailPassengerRequestCancel",
    sitePush: "sitePushPassengerRequestCancel"
  },
  {
    legacy: "newMessage",
    email: "emailNewMessage",
    sitePush: "sitePushNewMessage"
  }
]

const MENU_OWNERS = [
  "airlineDepartment",
  "dispatcherDepartment",
  "representativeDepartment"
]

function isBoolean(value) {
  return typeof value === "boolean"
}

function buildNotificationMenuBackfill(menu) {
  const nextMenu = { ...(menu || {}) }
  let changed = false

  for (const { legacy, email, sitePush } of ACTION_FIELDS) {
    const legacyValue = isBoolean(nextMenu[legacy]) ? nextMenu[legacy] : true

    if (!isBoolean(nextMenu[legacy])) {
      nextMenu[legacy] = legacyValue
      changed = true
    }

    if (!isBoolean(nextMenu[email])) {
      nextMenu[email] = legacyValue
      changed = true
    }

    if (!isBoolean(nextMenu[sitePush])) {
      nextMenu[sitePush] = legacyValue
      changed = true
    }
  }

  return { nextMenu, changed }
}

async function backfillForModel(modelName) {
  const model = prisma[modelName]
  const rows = await model.findMany({
    select: { id: true, notificationMenu: true }
  })

  const updates = []
  for (const row of rows) {
    if (!row.notificationMenu) continue

    const { nextMenu, changed } = buildNotificationMenuBackfill(
      row.notificationMenu
    )
    if (!changed) continue

    updates.push(
      model.update({
        where: { id: row.id },
        data: {
          notificationMenu: { set: nextMenu }
        }
      })
    )
  }

  if (updates.length === 0) {
    console.log(`[${modelName}] no updates needed`)
    return
  }

  const chunkSize = 200
  for (let i = 0; i < updates.length; i += chunkSize) {
    await prisma.$transaction(updates.slice(i, i + chunkSize))
  }

  console.log(`[${modelName}] updated ${updates.length} rows`)
}

async function main() {
  for (const modelName of MENU_OWNERS) {
    await backfillForModel(modelName)
  }
}

main()
  .then(() => {
    console.log("NotificationMenu channel backfill completed.")
  })
  .catch((error) => {
    console.error("NotificationMenu channel backfill failed:", error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

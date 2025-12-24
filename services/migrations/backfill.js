import { PrismaClient } from "./generated/client/index.js"
import dotenv from "dotenv"

dotenv.config()

export const prisma = new PrismaClient(
  process.env.DATABASE_URL
    ? {
        datasourceUrl: process.env.DATABASE_URL
      }
    : {}
)

const DEFAULT = {
  requestMenu: true,
  requestCreate: true,
  requestUpdate: true,
  requestChat: true,
  personalMenu: true,
  personalCreate: true,
  personalUpdate: true,
  reserveMenu: true,
  reserveCreate: true,
  reserveUpdate: true,
  analyticsMenu: true,
  analyticsUpload: true,
  reportMenu: true,
  reportCreate: true,
  userMenu: true,
  userCreate: true,
  userUpdate: true,
  airlineMenu: true,
  airlineUpdate: true,
  contracts: true
}

async function main() {
  // читаем только id и текущее accessMenu
  const rows = await prisma.airlineDepartment.findMany({
    select: { id: true, accessMenu: true }
  })

  const toUpdate = rows
    .filter((r) => r.accessMenu == null)
    .map((r) =>
      prisma.airlineDepartment.update({
        where: { id: r.id },
        data: { accessMenu: { set: DEFAULT } } // composite → через set
      })
    )

  if (toUpdate.length) {
    // батчами, чтобы не упереться в лимиты
    const chunk = 200
    for (let i = 0; i < toUpdate.length; i += chunk) {
      await prisma.$transaction(toUpdate.slice(i, i + chunk))
    }
  }
  console.log("Backfill done.")
}

main().finally(() => prisma.$disconnect())

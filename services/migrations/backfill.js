import { PrismaClient } from "./generated/client/index.js"

export const prisma = new PrismaClient()

const DEFAULT = {
  requestMenu: true,
  requestCreate: true,
  requestUpdate: true,
  requestChat: true,
  transferMenu: true,
  transferCreate: true,
  transferUpdate: true,
  transferChat: true,
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
  const airlineRows = await prisma.airlineDepartment.findMany({
    select: { id: true, accessMenu: true }
  })
  const dispatcherRows = await prisma.dispatcherDepartment.findMany({
    select: { id: true, accessMenu: true }
  })

  const buildTransferMerge = (accessMenu) => ({
    ...accessMenu,
    transferMenu: accessMenu?.transferMenu ?? true,
    transferCreate: accessMenu?.transferCreate ?? true,
    transferUpdate: accessMenu?.transferUpdate ?? true,
    transferChat: accessMenu?.transferChat ?? true
  })

  const toUpdate = []

  for (const row of airlineRows) {
    if (row.accessMenu == null) {
      toUpdate.push(
        prisma.airlineDepartment.update({
          where: { id: row.id },
          data: { accessMenu: { set: DEFAULT } } // composite → через set
        })
      )
      continue
    }

    const needsTransfer =
      row.accessMenu.transferMenu == null ||
      row.accessMenu.transferCreate == null ||
      row.accessMenu.transferUpdate == null ||
      row.accessMenu.transferChat == null

    if (needsTransfer) {
      toUpdate.push(
        prisma.airlineDepartment.update({
          where: { id: row.id },
          data: { accessMenu: { set: buildTransferMerge(row.accessMenu) } }
        })
      )
    }
  }

  for (const row of dispatcherRows) {
    if (row.accessMenu == null) {
      toUpdate.push(
        prisma.dispatcherDepartment.update({
          where: { id: row.id },
          data: { accessMenu: { set: DEFAULT } } // composite → через set
        })
      )
      continue
    }

    const needsTransfer =
      row.accessMenu.transferMenu == null ||
      row.accessMenu.transferCreate == null ||
      row.accessMenu.transferUpdate == null ||
      row.accessMenu.transferChat == null

    if (needsTransfer) {
      toUpdate.push(
        prisma.dispatcherDepartment.update({
          where: { id: row.id },
          data: { accessMenu: { set: buildTransferMerge(row.accessMenu) } }
        })
      )
    }
  }

  if (toUpdate.length) {
    const chunk = 200
    for (let i = 0; i < toUpdate.length; i += chunk) {
      await prisma.$transaction(toUpdate.slice(i, i + chunk))
    }
  }
  console.log("Backfill done.")
}

main().finally(() => prisma.$disconnect())

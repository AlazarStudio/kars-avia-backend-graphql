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
  contracts: true,
  organizationMenu: true,
  organizationCreate: true,
  organizationUpdate: true,
  organizationAddDrivers: true,
  organizationAcceptDrivers: true
}

async function main() {
  const airlineRows = await prisma.airlineDepartment.findMany({
    select: { id: true, accessMenu: true }
  })
  const dispatcherRows = await prisma.dispatcherDepartment.findMany({
    select: { id: true, accessMenu: true }
  })

  const buildMerge = (accessMenu) => ({
    ...accessMenu,
    transferMenu: accessMenu?.transferMenu ?? true,
    transferCreate: accessMenu?.transferCreate ?? true,
    transferUpdate: accessMenu?.transferUpdate ?? true,
    transferChat: accessMenu?.transferChat ?? true,
    organizationMenu: accessMenu?.organizationMenu ?? true,
    organizationCreate: accessMenu?.organizationCreate ?? true,
    organizationUpdate: accessMenu?.organizationUpdate ?? true,
    organizationAddDrivers: accessMenu?.organizationAddDrivers ?? true,
    organizationAcceptDrivers: accessMenu?.organizationAcceptDrivers ?? true
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

    const needsUpdate =
      row.accessMenu.transferMenu == null ||
      row.accessMenu.transferCreate == null ||
      row.accessMenu.transferUpdate == null ||
      row.accessMenu.transferChat == null ||
      row.accessMenu.organizationMenu == null ||
      row.accessMenu.organizationCreate == null ||
      row.accessMenu.organizationUpdate == null ||
      row.accessMenu.organizationAddDrivers == null ||
      row.accessMenu.organizationAcceptDrivers == null

    if (needsUpdate) {
      toUpdate.push(
        prisma.airlineDepartment.update({
          where: { id: row.id },
          data: { accessMenu: { set: buildMerge(row.accessMenu) } }
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

    const needsUpdate =
      row.accessMenu.transferMenu == null ||
      row.accessMenu.transferCreate == null ||
      row.accessMenu.transferUpdate == null ||
      row.accessMenu.transferChat == null ||
      row.accessMenu.organizationMenu == null ||
      row.accessMenu.organizationCreate == null ||
      row.accessMenu.organizationUpdate == null ||
      row.accessMenu.organizationAddDrivers == null ||
      row.accessMenu.organizationAcceptDrivers == null

    if (needsUpdate) {
      toUpdate.push(
        prisma.dispatcherDepartment.update({
          where: { id: row.id },
          data: { accessMenu: { set: buildMerge(row.accessMenu) } }
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

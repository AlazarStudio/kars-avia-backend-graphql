import { mergeAccessMenus } from "./resolveEffectiveAccessMenu.js"

/**
 * Load and merge accessMenu for a user.
 * Priority (low to high): department -> POD (airline) -> Position -> User.
 */
export async function loadEffectiveAccessMenuForUser(prisma, user) {
  const layers = []

  if (user.airlineDepartmentId) {
    const department = await prisma.airlineDepartment.findUnique({
      where: { id: user.airlineDepartmentId },
      select: { accessMenu: true }
    })
    layers.push(department?.accessMenu ?? null)

    if (user.positionId) {
      const positionOnDepartment =
        await prisma.positionOnDepartment.findFirst({
          where: {
            airlineDepartmentId: user.airlineDepartmentId,
            positionId: user.positionId
          },
          select: { accessMenu: true }
        })
      layers.push(positionOnDepartment?.accessMenu ?? null)
    }
  } else if (user.dispatcherDepartmentId) {
    const department = await prisma.dispatcherDepartment.findUnique({
      where: { id: user.dispatcherDepartmentId },
      select: { accessMenu: true }
    })
    layers.push(department?.accessMenu ?? null)
  } else if (user.representativeDepartmentId) {
    const department = await prisma.representativeDepartment.findUnique({
      where: { id: user.representativeDepartmentId },
      select: { accessMenu: true }
    })
    layers.push(department?.accessMenu ?? null)
  }

  if (user.positionId) {
    const position = await prisma.position.findUnique({
      where: { id: user.positionId },
      select: { accessMenu: true }
    })
    layers.push(position?.accessMenu ?? null)
  }

  if (user.accessMenu != null) {
    layers.push(user.accessMenu)
  }

  return mergeAccessMenus(...layers)
}
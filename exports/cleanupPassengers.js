// cleanupPassengers.js

import { prisma } from "./prisma.js"

async function cleanupPassengers() {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - 7) // Удаляем пассажиров старше 7 дней

  await prisma.passenger.deleteMany({
    where: {
      temporary: true,
      createdAt: { lt: cutoffDate }
    }
  })
  console.log("Очистка временных пассажиров завершена")
}

cleanupPassengers().catch((e) => {
  console.error(e)
  process.exit(1)
})

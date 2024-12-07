// cronTasks.js
import { prisma } from "../../prisma.js"
import { pubsub, REQUEST_UPDATED } from "../../exports/pubsub.js" // Импортируйте необходимые модули

const checkAndArchiveRequests = async () => {
  const currentDateTime = new Date()
  const requests = await prisma.request.findMany({
    where: {
      status: { not: "archived" } // Исключаем уже архивированные заявки
    }
  })
  // Обновляем статус для каждой заявки, если время выселения прошло
  for (const request of requests) {
    // Создаем объект даты для выселения
    const departureDate =  request.departure.date
    // new Date(`${request.departure.date}T${request.departure.time}:00`)
    // Преобразуем время в локальное
    const localDepartureDate = new Date(
      departureDate.getTime() - departureDate.getTimezoneOffset() * 60000
    )
    if (localDepartureDate < currentDateTime) {
      // Обновляем статус
      await prisma.request.update({
        where: { id: request.id },
        data: { status: "archiving" }
      })
      // Отправляем уведомление о заархивированной заявке
      pubsub.publish(REQUEST_UPDATED, {
        requestUpdated: request
      })
      console.log(`Заявка: ${request.requestNumber} готова к архивированию`)
    }
  }
}

export const startArchivingJob = () => {
  // Запускаем проверку каждые 6 часов  
  setInterval(checkAndArchiveRequests, 6 * 60 * 60 * 1000)
}

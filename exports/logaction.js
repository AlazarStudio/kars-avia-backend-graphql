import { prisma } from "../prisma.js"
import { logger } from "../utils/logger.js"

const safeStringify = (data) => {
  try {
    return JSON.stringify(data)
  } catch (error) {
    console.error("Ошибка при преобразовании данных в JSON:", error)
    return null
  }
}

const createLog = async ({
  userId,
  action,
  reason = null,
  description,
  hotelId = null,
  airlineId = null,
  requestId = null,
  reserveId = null,
  oldData = null,
  newData = null
}) => {
  try {
    const currentTime = new Date()
    const adjustedTime = new Date(currentTime.getTime() + 3 * 60 * 60 * 1000)
    const formattedTime = adjustedTime.toISOString()

    await prisma.log.create({
      data: {
        userId,
        action,
        reason: reason ? reason : null,
        description: safeStringify(description),
        hotelId: hotelId ? hotelId : null,
        airlineId: airlineId ? airlineId : null,
        requestId: requestId ? requestId : null,
        reserveId: reserveId ? reserveId : null,
        oldData: oldData ? safeStringify(oldData) : null,
        newData: newData ? safeStringify(newData) : null,
        createdAt: formattedTime
      }
    })
  } catch (error) {
    logger.error('Ошибка логирования', error)
    console.error("Ошибка при логировании действия:", error)
  }
}

const logAction = async ({
  context,
  action,
  reason = null,
  description,
  oldData = null,
  newData = null,
  hotelId = null,
  airlineId = null,
  requestId = null,
  reserveId = null
}) => {
  await createLog({
    userId: context.user.id,
    action,
    reason,
    description,
    hotelId,
    airlineId,
    requestId,
    reserveId,
    oldData,
    newData
  })
}

export default logAction

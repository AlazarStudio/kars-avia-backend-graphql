import { prisma } from "../prisma.js"

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
  reason,
  description,
  hotelId,
  airlineId,
  requestId,
  reserveId,
  oldData = null,
  newData = null
}) => {
  try {
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
        newData: newData ? safeStringify(newData) : null
      }
    })
  } catch (error) {
    console.error("Ошибка при логировании действия:", error)
  }
}

const logAction = async (
  context,
  action,
  reason,
  description,
  oldData,
  newData,
  hotelId = null,
  airlineId = null,
  requestId = null,
  reserveId = null
) => {
  console.log('con', context)
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
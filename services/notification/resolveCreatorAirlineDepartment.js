import { prisma } from "../../prisma.js"

/**
 * Определяет отдел-создатель по senderId (и personId для заявки).
 * Возвращает null, если отправитель — диспетчер.
 */
export async function resolveCreatorDepartmentFromSender({
  senderId,
  personId = null
}) {
  if (!senderId) return null

  const sender = await prisma.user.findUnique({
    where: { id: senderId },
    select: { dispatcher: true, airlineDepartmentId: true }
  })

  if (!sender || sender.dispatcher === true) return null

  if (sender.airlineDepartmentId) return sender.airlineDepartmentId

  if (personId) {
    const person = await prisma.airlinePersonal.findUnique({
      where: { id: personId },
      select: { departmentId: true }
    })
    if (person?.departmentId) return person.departmentId
  }

  return null
}

/**
 * Возвращает airlineDepartmentId заявки/брони для scoped email.
 * Сначала сохранённое поле, иначе derive из sender/person (legacy).
 */
export async function resolveCreatorAirlineDepartment(entityType, entityId) {
  if (!entityId) return null

  if (entityType === "request") {
    const request = await prisma.request.findUnique({
      where: { id: entityId },
      select: {
        airlineDepartmentId: true,
        personId: true,
        sender: { select: { dispatcher: true, airlineDepartmentId: true } },
        person: { select: { departmentId: true } }
      }
    })
    if (!request) return null
    if (request.airlineDepartmentId) return request.airlineDepartmentId
    if (request.sender?.dispatcher === true) return null
    return (
      request.sender?.airlineDepartmentId ??
      request.person?.departmentId ??
      null
    )
  }

  if (entityType === "reserve") {
    const reserve = await prisma.reserve.findUnique({
      where: { id: entityId },
      select: {
        airlineDepartmentId: true,
        sender: { select: { dispatcher: true, airlineDepartmentId: true } }
      }
    })
    if (!reserve) return null
    if (reserve.airlineDepartmentId) return reserve.airlineDepartmentId
    if (reserve.sender?.dispatcher === true) return null
    return reserve.sender?.airlineDepartmentId ?? null
  }

  if (entityType === "passenger_request") {
    const passengerRequest = await prisma.passengerRequest.findUnique({
      where: { id: entityId },
      select: {
        createdBy: {
          select: { dispatcher: true, airlineDepartmentId: true }
        }
      }
    })
    if (!passengerRequest) return null
    if (passengerRequest.createdBy?.dispatcher === true) return null
    return passengerRequest.createdBy?.airlineDepartmentId ?? null
  }

  return null
}

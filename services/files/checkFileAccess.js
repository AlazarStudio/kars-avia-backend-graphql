import { prisma } from "../../prisma.js"
import { logger } from "../infra/logger.js"
import path from "path"

/**
 * Определяет тип файла и связанную сущность по пути
 * @param {string} filePath - путь к файлу (например, "/uploads/requests/123/2024/01/15/file.png")
 * @returns {Promise<{type: string, entityId: string | null, bucket: string} | null>}
 */
async function resolveFileOwner(filePath) {
  // Нормализуем путь: убираем префикс /files/ если есть
  let normalizedPath = filePath.replace(/^\/+/, "").replace(/\\/g, "/")
  
  // Убираем префикс /files/ если он есть
  if (normalizedPath.startsWith("files/")) {
    normalizedPath = normalizedPath.replace(/^files\//, "")
  }
  
  // Проверяем различные типы файлов
  const parts = normalizedPath.split("/")
  
  // Формат: uploads/bucket/entityId/YYYY/MM/DD/file.ext
  // или: uploads/bucket/YYYY/MM/DD/file.ext
  if (parts[0] === "uploads" && parts.length >= 5) {
    const bucket = parts[1]
    // Проверяем, является ли третий элемент entityId (проверяем по длине и формату ObjectId)
    const possibleEntityId = parts[2]
    const isEntityId = /^[0-9a-fA-F]{24}$/.test(possibleEntityId)
    
    if (isEntityId) {
      return { type: bucket, entityId: possibleEntityId, bucket }
    } else {
      return { type: bucket, entityId: null, bucket }
    }
  }
  
  // Формат: reserve_files/filename.ext
  if (parts[0] === "reserve_files") {
    // Извлекаем reserveId из имени файла (формат: reserve_<id>_timestamp.ext)
    const filename = parts[parts.length - 1]
    const match = filename.match(/^reserve_([0-9a-fA-F]{24})_/)
    if (match) {
      return { type: "reserve", entityId: match[1], bucket: "reserve_files" }
    }
    return { type: "reserve_files", entityId: null, bucket: "reserve_files" }
  }
  
  // Формат: reports/filename.ext
  if (parts[0] === "reports") {
    return { type: "reports", entityId: null, bucket: "reports" }
  }
  
  return null
}

/**
 * Проверяет доступ пользователя к файлу заявки (Request)
 */
async function checkRequestAccess(user, requestId) {
  // SUPERADMIN и диспетчеры видят все
  if (user.role === "SUPERADMIN" || user.dispatcher === true) {
    return true
  }
  
  // Проверяем доступ через airlineId
  const request = await prisma.request.findUnique({
    where: { id: requestId },
    select: { airlineId: true, hotelId: true, senderId: true, receiverId: true, postedId: true }
  })
  
  if (!request) return false
  
  // Пользователь авиакомпании видит файлы своих заявок
  if (user.airlineId && request.airlineId === user.airlineId) {
    return true
  }
  
  // Отель видит файлы заявок, связанных с ним
  if (user.hotelId && request.hotelId === user.hotelId) {
    return true
  }
  
  // Пользователь видит файлы заявок, где он отправитель, получатель или разместил
  if (
    request.senderId === user.id ||
    request.receiverId === user.id ||
    request.postedId === user.id
  ) {
    return true
  }
  
  return false
}

/**
 * Проверяет доступ пользователя к файлу резерва (Reserve)
 */
async function checkReserveAccess(user, reserveId) {
  // SUPERADMIN и диспетчеры видят все
  if (user.role === "SUPERADMIN" || user.dispatcher === true) {
    return true
  }
  
  // Проверяем доступ через airlineId
  const reserve = await prisma.reserve.findUnique({
    where: { id: reserveId },
    select: {
      airlineId: true,
      senderId: true,
      hotel: {
        select: { hotelId: true }
      }
    }
  })
  
  if (!reserve) return false
  
  // Пользователь авиакомпании видит файлы своих резервов
  if (user.airlineId && reserve.airlineId === user.airlineId) {
    return true
  }
  
  // Отель видит файлы резервов, связанных с ним
  if (user.hotelId && reserve.hotel) {
    const hasAccess = reserve.hotel.some((hotel) => hotel.hotelId === user.hotelId)
    if (hasAccess) return true
  }
  
  // Пользователь видит файлы резервов, где он отправитель
  if (reserve.senderId === user.id) {
    return true
  }
  
  return false
}

/**
 * Проверяет доступ пользователя к файлу пользователя (User)
 */
async function checkUserFileAccess(user, targetUserId) {
  // SUPERADMIN и диспетчеры видят все
  if (user.role === "SUPERADMIN" || user.dispatcher === true) {
    return true
  }
  
  // Пользователь видит свои файлы
  if (user.id === targetUserId) {
    return true
  }
  
  // Пользователи одной авиакомпании могут видеть файлы друг друга
  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { airlineId: true }
  })
  
  if (targetUser && user.airlineId && targetUser.airlineId === user.airlineId) {
    return true
  }
  
  return false
}

/**
 * Проверяет доступ пользователя к файлу
 * @param {object} context - контекст авторизации (из buildAuthContext)
 * @param {string} filePath - путь к файлу
 * @returns {Promise<boolean>}
 */
export async function checkFileAccess(context, filePath) {
  const { subject, subjectType } = context
  
  // Только авторизованные пользователи могут получать файлы
  if (!subject || subjectType !== "USER") {
    return false
  }
  
  const user = subject
  
  // Определяем владельца файла
  const fileOwner = await resolveFileOwner(filePath)
  
  if (!fileOwner) {
    logger.warn(`[FILE ACCESS] Cannot resolve file owner for path: ${filePath}`)
    return false
  }
  
  const { type, entityId, bucket } = fileOwner
  
  // Для файлов без привязки к сущности (misc, reports без entityId)
  if (!entityId) {
    // SUPERADMIN и диспетчеры имеют доступ ко всем файлам
    if (user.role === "SUPERADMIN" || user.dispatcher === true) {
      return true
    }
    
    // Для reports - проверяем, может ли пользователь генерировать отчеты
    if (bucket === "reports") {
      // Пока разрешаем всем авторизованным пользователям
      // Можно добавить более строгую проверку по ролям
      return true
    }
    
    // Для остальных файлов без entityId - только SUPERADMIN и диспетчеры
    return user.role === "SUPERADMIN" || user.dispatcher === true
  }
  
  // Проверяем доступ в зависимости от типа файла
  switch (type) {
    case "requests":
      return await checkRequestAccess(user, entityId)
    
    case "reserves":
    case "reserve":
      return await checkReserveAccess(user, entityId)
    
    case "users":
      return await checkUserFileAccess(user, entityId)
    
    case "airline-personal":
      // Для файлов персонала авиакомпании - проверяем через airlineId
      if (user.role === "SUPERADMIN" || user.dispatcher === true) {
        return true
      }
      const personal = await prisma.airlinePersonal.findUnique({
        where: { id: entityId },
        select: { airlineId: true }
      })
      if (personal && user.airlineId && personal.airlineId === user.airlineId) {
        return true
      }
      return false
    
    case "reserve_files":
      // Файлы резервов из папки reserve_files
      return await checkReserveAccess(user, entityId)
    
    default:
      // Для неизвестных типов - только SUPERADMIN и диспетчеры
      logger.warn(`[FILE ACCESS] Unknown file type: ${type} for path: ${filePath}`)
      return user.role === "SUPERADMIN" || user.dispatcher === true
  }
}

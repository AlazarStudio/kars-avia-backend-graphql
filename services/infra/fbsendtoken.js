import admin from "firebase-admin"
import { readFileSync } from "fs"
import { fileURLToPath } from "url"
import { dirname, join } from "path"
import { logger } from "./logger.js"
import { prisma } from "../../prisma.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Инициализация Firebase Admin
let firebaseApp = null

try {
  // Проверяем переменные окружения
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    // Если указан путь к файлу с credentials
    const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
    const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, "utf8"))
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    })
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    // Если JSON задан как строка в переменной окружения
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    })
  } else {
    // Пытаемся загрузить из файла (предполагаем, что это может быть service account JSON)
    // ВАЖНО: google-services.json НЕ является service account файлом
    // Нужен файл с type: "service_account", private_key и т.д.
    // Если у вас есть service account JSON, положите его в services/infra/serviceAccountKey.json
    try {
      // Попробуем найти service account файл в разных местах
      const possiblePaths = [
        join(__dirname, "../service_account.json"), // services/service_account.json
        join(__dirname, "../serviceAccountKey.json"), // services/serviceAccountKey.json
        join(__dirname, "../../serviceAccountKey.json"), // корень проекта/serviceAccountKey.json
        join(process.cwd(), "serviceAccountKey.json"),
        join(process.cwd(), "services", "service_account.json")
      ]
      
      let serviceAccount = null
      for (const path of possiblePaths) {
        try {
          const content = readFileSync(path, "utf8")
          serviceAccount = JSON.parse(content)
          if (serviceAccount && serviceAccount.type === "service_account") {
            firebaseApp = admin.initializeApp({
              credential: admin.credential.cert(serviceAccount)
            })
            logger.info(`[FIREBASE] Initialized with service account from ${path}`)
            break
          }
        } catch (e) {
          // Файл не найден или невалидный, пробуем следующий
          continue
        }
      }
      
      if (!firebaseApp) {
        logger.warn("[FIREBASE] Service account not found. Firebase notifications will be disabled. Use GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT_JSON env variable, or place serviceAccountKey.json in the project root.")
      }
    } catch (error) {
      logger.warn("[FIREBASE] Error looking for service account file:", error.message)
    }
  }
} catch (error) {
  logger.error("[FIREBASE] Failed to initialize Firebase Admin", error)
  // Не бросаем ошибку, чтобы приложение могло работать без Firebase
  logger.warn("[FIREBASE] Firebase notifications will be disabled")
}

/**
 * Отправка уведомления на одно устройство по токену
 * @param {string} token - FCM токен устройства
 * @param {string} title - Заголовок уведомления
 * @param {string} body - Текст уведомления
 * @param {object} data - Дополнительные данные (будут преобразованы в строки)
 * @returns {Promise<string>} - ID сообщения
 */
export const sendToToken = async (token, title, body, data = {}) => {
  if (!firebaseApp) {
    logger.warn("[FIREBASE] Firebase not initialized, skipping notification")
    return null
  }

  if (!token) {
    throw new Error("Token is required")
  }

  try {
    const message = {
      token,
      notification: {
        title,
        body
      },
      data: Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, String(v)])
      ),
      android: {
        priority: "high",
        notification: {
          channelId: "transfers",
          sound: "default"
        }
      },
      apns: {
        payload: {
          aps: {
            sound: "default",
            contentAvailable: true,
            badge: 1
          }
        }
      }
    }

    const response = await admin.messaging().send(message)
    logger.info(`[FIREBASE] Message sent successfully: ${response}`)
    return response
  } catch (error) {
    logger.error(`[FIREBASE] Error sending message to token ${token}`, error)
    
    // Если токен недействителен, удаляем его из БД
    if (error.code === "messaging/invalid-registration-token" || 
        error.code === "messaging/registration-token-not-registered") {
      try {
        await prisma.device_tokens.deleteMany({
          where: { token }
        })
        logger.info(`[FIREBASE] Removed invalid token from database: ${token}`)
      } catch (dbError) {
        logger.error("[FIREBASE] Error removing invalid token from database", dbError)
      }
    }
    
    throw error
  }
}

/**
 * Отправка уведомления нескольким устройствам
 * @param {string[]} tokens - Массив FCM токенов
 * @param {string} title - Заголовок уведомления
 * @param {string} body - Текст уведомления
 * @param {object} data - Дополнительные данные
 * @returns {Promise<object>} - Результаты отправки
 */
export const sendToTokens = async (tokens, title, body, data = {}) => {
  if (!firebaseApp) {
    logger.warn("[FIREBASE] Firebase not initialized, skipping notifications")
    return { successCount: 0, failureCount: 0, responses: [] }
  }

  if (!tokens || tokens.length === 0) {
    logger.warn("[FIREBASE] No tokens provided")
    return { successCount: 0, failureCount: 0, responses: [] }
  }

  try {
    const message = {
      notification: {
        title,
        body
      },
      data: Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, String(v)])
      ),
      android: {
        priority: "high",
        notification: {
          channelId: "transfers",
          sound: "default"
        }
      },
      apns: {
        payload: {
          aps: {
            sound: "default",
            contentAvailable: true,
            badge: 1
          }
        }
      },
      tokens
    }

    const response = await admin.messaging().sendEachForMulticast(message)
    logger.info(`[FIREBASE] Multicast message sent. Success: ${response.successCount}, Failure: ${response.failureCount}`)

    // Удаляем недействительные токены
    if (response.failureCount > 0) {
      const invalidTokens = []
      response.responses.forEach((resp, idx) => {
        if (!resp.success && (
          resp.error?.code === "messaging/invalid-registration-token" ||
          resp.error?.code === "messaging/registration-token-not-registered"
        )) {
          invalidTokens.push(tokens[idx])
        }
      })

      if (invalidTokens.length > 0) {
        try {
          await prisma.device_tokens.deleteMany({
            where: { token: { in: invalidTokens } }
          })
          logger.info(`[FIREBASE] Removed ${invalidTokens.length} invalid tokens from database`)
        } catch (dbError) {
          logger.error("[FIREBASE] Error removing invalid tokens from database", dbError)
        }
      }
    }

    return {
      successCount: response.successCount,
      failureCount: response.failureCount,
      responses: response.responses
    }
  } catch (error) {
    logger.error("[FIREBASE] Error sending multicast message", error)
    throw error
  }
}

/**
 * Отправка уведомления пользователю по его ID
 * Получает все токены устройства пользователя из БД и отправляет уведомления
 * @param {string} userId - ID пользователя
 * @param {string} title - Заголовок уведомления
 * @param {string} body - Текст уведомления
 * @param {object} data - Дополнительные данные
 * @returns {Promise<object>} - Результаты отправки
 */
export const sendNotificationToUser = async (userId, title, body, data = {}) => {
  if (!userId) {
    throw new Error("User ID is required")
  }

  try {
    // Получаем все токены устройства пользователя
    const deviceTokens = await prisma.device_tokens.findMany({
      where: { userId },
      select: { token: true }
    })

    if (deviceTokens.length === 0) {
      logger.info(`[FIREBASE] No device tokens found for user ${userId}`)
      return { successCount: 0, failureCount: 0, responses: [] }
    }

    const tokens = deviceTokens.map(dt => dt.token)
    logger.info(`[FIREBASE] Sending notification to user ${userId} (${tokens.length} devices)`)

    return await sendToTokens(tokens, title, body, data)
  } catch (error) {
    logger.error(`[FIREBASE] Error sending notification to user ${userId}`, error)
    throw error
  }
}

/**
 * Отправка уведомления нескольким пользователям
 * @param {string[]} userIds - Массив ID пользователей
 * @param {string} title - Заголовок уведомления
 * @param {string} body - Текст уведомления
 * @param {object} data - Дополнительные данные
 * @returns {Promise<object>} - Результаты отправки
 */
export const sendNotificationToUsers = async (userIds, title, body, data = {}) => {
  if (!userIds || userIds.length === 0) {
    logger.warn("[FIREBASE] No user IDs provided")
    return { successCount: 0, failureCount: 0, responses: [] }
  }

  try {
    // Получаем все токены устройств для всех пользователей
    const deviceTokens = await prisma.device_tokens.findMany({
      where: { userId: { in: userIds } },
      select: { token: true }
    })

    if (deviceTokens.length === 0) {
      logger.info(`[FIREBASE] No device tokens found for users ${userIds.join(", ")}`)
      return { successCount: 0, failureCount: 0, responses: [] }
    }

    const tokens = deviceTokens.map(dt => dt.token)
    logger.info(`[FIREBASE] Sending notification to ${userIds.length} users (${tokens.length} devices)`)

    return await sendToTokens(tokens, title, body, data)
  } catch (error) {
    logger.error(`[FIREBASE] Error sending notification to users`, error)
    throw error
  }
}

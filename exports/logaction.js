import { prisma } from "../prisma.js"
import winston from "winston"

// const logger = winston.createLogger({
//   level: "verbose",
//   format: winston.format.prettyPrint(),
//   transports: [
//     new winston.transports.Console(),
//     new winston.transports.File({ filename: "logs/combined.log" }),
//   ],
// });

// const logger = winston.createLogger({
//   transports: [
//     new winston.transports.MongoDB({
//       level: "error",
//       db: "mongodb://localhost:27017/logs",
//       collection: "log",
//       format: winston.format.json(),
//     }),
//   ],
// });

const logger = winston.createLogger({
  // level: "info",
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: "logs/info.log", level: "info" }),
    new winston.transports.File({ filename: "logs/debug.log", level: "debug" }),
    new winston.transports.File({ filename: "logs/error.log", level: "error" }),
    new winston.transports.File({ filename: "logs/warning.log", level: "warning" }),
    new winston.transports.File({ filename: "logs/critical.log", level: "critical" }),
    new winston.transports.File({ filename: "logs/combined.log", level: "combined" })
  ]
})

if (process.env.NODE_ENV !== "production") {
  logger.add(
    new winston.transports.Console({
      format: winston.format.simple()
    })
  )
}

// export const logAction = (userId, action, description) => {
//   logger.info({
//     userId,
//     action,
//     description,
//     timestamp: new Date().toISOString()
//   })
// }

const safeStringify = (data) => {
  try {
    return JSON.stringify(data);
  } catch (error) {
    console.error("Ошибка при преобразовании данных в JSON:", error);
    return null; // Возвращаем null, если произошла ошибка
  }
}

export const logAction = async (
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
) => {
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

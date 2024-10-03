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

// const logger = winston.createLogger({
//   level: "info",
//   format: winston.format.json(),
//   transports: [
//     new winston.transports.File({ filename: "logs/error.log", level: "error" }),
//     new winston.transports.File({ filename: "logs/combined.log" }),
//   ],
// });

// if (process.env.NODE_ENV !== "production") {
//   logger.add(new winston.transports.Console({
//     format: winston.format.simple(),
//   }));
// }

// export const logAction = (userId, action, description) => {
//   logger.info({
//     userId,
//     action,
//     description,
//     timestamp: new Date().toISOString(),
//   });
// }

export async function logAction({
  userId,
  action,
  description,
  hotelId,
  airlineId
}) {
  try {
    await prisma.log.create({
      data: {
        userId,
        action,
        description: JSON.stringify(description), // Преобразуем объект в строку
        hotelId: hotelId ? hotelId : null,
        airlineId: airlineId ? airlineId : null
      }
    })
  } catch (error) {
    console.error("Ошибка при логировании действия:", error)
  }
}

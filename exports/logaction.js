import winston from "winston";



const logger = winston.createLogger({
  level: "verbose",
//   format: winston.format.json(),
  format: winston.format.prettyPrint(),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: "logs/combined.log" }),
  ],
});

export const logAction = (userId, action, description) => {
  logger.info({
    userId,
    action,
    description,
    timestamp: new Date().toISOString(),
  });
}


export const logAction2 = async (userId, action, description) => {
  try {
    await prisma.log.create({
      data: {
        userId: userId || null, // ID пользователя, если доступен
        action: action,
        description: description
      }
    })
  } catch (error) {
    console.error("Ошибка при записи логов:", error)
  }
}

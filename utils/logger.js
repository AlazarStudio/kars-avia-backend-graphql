import fs from "fs"
import path from "path"

// Папка для логов
const logDir = path.resolve("logs")
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir)
}

// Формат даты и времени
function getTimeStamp() {
  return new Date().toISOString()
}

// Получение имени файла лога по месяцу
function getLogFileName(type) {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, "0") // Месяцы от 0 до 11
  const year = now.getFullYear()
  return `${type}-${month}-${year}.log`
}

// Главная функция логирования
function logToFile(type, message, error = null) {
  const logFile = path.join(logDir, getLogFileName(type))
  const logEntry = `[${getTimeStamp()}] ${type.toUpperCase()}: ${message}${
    error ? "\n" + error.stack : ""
  }\n`

  fs.appendFile(logFile, logEntry, (err) => {
    if (err) {
      console.error(`Ошибка при записи лога (${type}):`, err)
    }
  })
}

// Экспортируем удобные методы
export const logger = {
  info: (msg) => logToFile("info", msg),
  warn: (msg) => logToFile("warn", msg),
  error: (msg, err = null) => logToFile("error", msg, err)
}

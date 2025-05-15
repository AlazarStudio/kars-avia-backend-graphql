import fs from 'fs';
import path from 'path';

// Папка для логов
const logDir = path.resolve('logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// Формат даты
function getTimeStamp() {
  return new Date().toISOString();
}

// Главная функция логирования
function logToFile(type, message, error = null) {
  const logFile = path.join(logDir, `${type}.log`);
  const logEntry = `[${getTimeStamp()}] ${type.toUpperCase()}: ${message}${error ? '\n' + error.stack : ''}\n`;

  fs.appendFile(logFile, logEntry, (err) => {
    if (err) {
      console.error(`Ошибка при записи лога (${type}):`, err);
    }
  });
}

// Экспортируем удобные методы
export const logger = {
  info: (msg) => logToFile('info', msg),
  warn: (msg) => logToFile('warn', msg),
  error: (msg, err = null) => logToFile('error', msg, err),
};

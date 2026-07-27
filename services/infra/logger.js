import fs from "fs"
import path from "path"

const logDir = path.resolve("logs")
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir)
}

const ensuredDirs = new Set()

function getTimeStamp() {
  return new Date().toISOString()
}

function getLogFilePath(filePrefix, date = new Date()) {
  const day = String(date.getDate()).padStart(2, "0")
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const year = date.getFullYear()

  const branch = filePrefix === "auth-error" ? "error" : filePrefix
  const dir = path.join(logDir, branch, String(year), month)
  const fileName = `${filePrefix}-${day}-${month}-${year}.log`
  return path.join(dir, fileName)
}

function ensureLogDir(filePath) {
  const dir = path.dirname(filePath)
  if (ensuredDirs.has(dir)) return
  fs.mkdirSync(dir, { recursive: true })
  ensuredDirs.add(dir)
}

function appendLog(filePath, logEntry, label) {
  ensureLogDir(filePath)
  fs.appendFile(filePath, logEntry, (err) => {
    if (err) {
      console.error(`Ошибка при записи лога (${label}):`, err)
    }
  })
}

function logToFile(type, message, error = null) {
  const logFile = getLogFilePath(type)
  const logEntry = `[${getTimeStamp()}] ${type.toUpperCase()}: ${message}${
    error ? "\n" + error.stack : ""
  }\n`

  appendLog(logFile, logEntry, type)
}

function logAuthError(message, error = null, details = null) {
  const logFile = getLogFilePath("auth-error")
  const detailsLine = details ? `\nDETAILS: ${JSON.stringify(details)}` : ""
  const stackLine = error?.stack ? `\n${error.stack}` : ""
  const logEntry = `[${getTimeStamp()}] AUTH_ERROR: ${message}${detailsLine}${stackLine}\n`

  appendLog(logFile, logEntry, "auth-error")
}

export const logger = {
  info: (msg) => logToFile("info", msg),
  warn: (msg) => logToFile("warn", msg),
  error: (msg, err = null) => logToFile("error", msg, err),
  authError: (msg, err = null, details = null) => logAuthError(msg, err, details)
}

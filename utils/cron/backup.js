import { fileURLToPath } from "url"
import { dirname, join, resolve } from "path"
import { existsSync, mkdirSync, readdirSync } from "fs"
import { spawn } from "child_process"
import cron from "node-cron"
import dotenv from "dotenv"

dotenv.config()

// Эмуляция __dirname
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Параметры резервного копирования
const BACKUP_DIR = join(__dirname, "../../backups")
const DB_NAME = process.env.DB_NAME
const MONGO_URI = process.env.DATABASE_URL

if (!DB_NAME || !MONGO_URI) {
  throw new Error("Не установлены переменные среды DB_NAME или DATABASE_URL.")
}

if (!existsSync(BACKUP_DIR)) {
  mkdirSync(BACKUP_DIR, { recursive: true })
}

// Функция для создания резервной копии
const createBackup = () => {
  const timestamp = new Date().toISOString().replace(/:/g, "-")
  const backupFile = `${BACKUP_DIR}/${DB_NAME}-${timestamp}.gz`

  const args = [
    `--uri=${MONGO_URI}`,
    `--db=${DB_NAME}`,
    `--archive=${backupFile}`,
    `--gzip`
  ]

  const process = spawn("mongodump", args)

  process.stdout.on("data", (data) => console.log(`stdout: ${data}`))
  process.stderr.on("data", (data) => console.error(`stderr: ${data}`))
  process.on("close", (code) => {
    if (code === 0) {
      console.log(`Резервное копирование завершено. Архив: ${backupFile}`)
    } else {
      console.error(`Процесс завершился с кодом: ${code}`)
    }
  })
}

// Функция для восстановления из резервной копии
const restoreBackup = (backupFile) => {
  // Убедимся, что путь включает папку backups
  const fullBackupPath = resolve(join(BACKUP_DIR, backupFile))
  console.log(`Попытка восстановления из: ${fullBackupPath}`)

  if (!existsSync(fullBackupPath)) {
    console.error(`Файл ${fullBackupPath} не найден.`)
    return
  }

  const args = [`--uri=${MONGO_URI}`, `--archive=${fullBackupPath}`, `--gzip`]

  const process = spawn("mongorestore", args)

  process.stdout.on("data", (data) => console.log(`stdout: ${data}`))
  process.stderr.on("data", (data) => console.error(`stderr: ${data}`))
  process.on("close", (code) => {
    if (code === 0) {
      console.log(`Восстановление завершено из файла: ${fullBackupPath}`)
    } else {
      console.error(`Процесс завершился с кодом: ${code}`)
    }
  })
}

// Функция для получения списка доступных бэкапов
const listBackups = () => {
  const files = readdirSync(BACKUP_DIR)
  return files.filter((file) => file.endsWith(".gz"))
}

// Запускаем cron задачу для автоматического резервного копирования
cron.schedule("0 4,16 * * *", () => {
  console.log("Запуск задачи резервного копирования...")
  createBackup()
})

console.log("Сервис резервного копирования запущен.")

// Экспортируем функции для использования
export { createBackup, restoreBackup, listBackups }

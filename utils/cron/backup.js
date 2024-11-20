import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { spawn } from 'child_process';
import cron from 'node-cron';

// Эмуляция __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Параметры резервного копирования
const BACKUP_DIR = join(__dirname, "../../backups");
const DB_NAME = process.env.DB_NAME;
const MONGO_URI = process.env.DATABASE_URL;

if (!DB_NAME || !MONGO_URI) {
  throw new Error("Не установлены переменные среды DB_NAME или DATABASE_URL.");
}

if (!existsSync(BACKUP_DIR)) {
  mkdirSync(BACKUP_DIR, { recursive: true });
}

// Функция для выполнения mongodump
const createBackup = () => {
  const timestamp = new Date().toISOString().replace(/:/g, "-");
  const backupPath = `${BACKUP_DIR}/${DB_NAME}-${timestamp}`;

  const args = [`--uri=${MONGO_URI}`, `--db=${DB_NAME}`, `--out=${backupPath}`];
  const process = spawn("mongodump", args);

  process.stdout.on("data", (data) => console.log(`stdout: ${data}`));
  process.stderr.on("data", (data) => console.error(`stderr: ${data}`));
  process.on("close", (code) => {
    if (code === 0) {
      console.log(`Резервное копирование завершено. Данные сохранены в: ${backupPath}`);
    } else {
      console.error(`Процесс завершился с кодом: ${code}`);
    }
  });
};

// Запускаем cron задачу для автоматического резервного копирования
cron.schedule("0 2 * * *", () => {
  console.log("Запуск задачи резервного копирования...");
  createBackup();
});

console.log("Сервис резервного копирования запущен.");

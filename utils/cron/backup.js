import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { exec } from 'child_process';
import cron from 'node-cron';

// Эмуляция __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Параметры резервного копирования
const BACKUP_DIR = join(__dirname, "../../backups"); 
const DB_NAME = "replicaSet=rs0"; 
const MONGO_URI = process.env.DATABASE_URL; 

// Функция для выполнения mongodump
const createBackup = () => {
  const timestamp = new Date().toISOString().replace(/:/g, "-"); // Формат времени
  const backupPath = `${BACKUP_DIR}/${DB_NAME}-${timestamp}`;

  const command = `mongodump --uri="${MONGO_URI}" --db="${DB_NAME}" --out="${backupPath}"`;
  console.log(`Выполняется резервное копирование: ${command}`);

  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error(`Ошибка резервного копирования: ${error.message}`);
      return;
    }
    if (stderr) {
      console.error(`stderr: ${stderr}`);
      return;
    }
    console.log(`Резервное копирование завершено. Данные сохранены в: ${backupPath}`);
  });
};

// Запускаем cron задачу для автоматического резервного копирования
cron.schedule("* * * * *", () => {
  console.log("Запуск задачи резервного копирования...");
  createBackup();
});

console.log("Сервис резервного копирования запущен.");

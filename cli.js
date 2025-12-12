import {
  createBackup,
  restoreBackup,
  listBackups
} from "./services/cron/backup.js"
import readline from "readline"

// CLI интерфейс
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

const showMenu = () => {
  console.log(`
  Выберите действие:
  1. Создать резервную копию
  2. Восстановить из резервной копии
  3. Посмотреть список доступных бэкапов
  4. Выйти
  `)
}

const handleUserInput = (input) => {
  switch (input.trim()) {
    case "1":
      console.log("Создаём резервную копию...")
      createBackup()
      rl.close()
      break

    case "2":
      const backups = listBackups()
      if (backups.length === 0) {
        console.log("Нет доступных резервных копий.")
        rl.close()
        break
      }

      console.log("Доступные резервные копии:")
      backups.forEach((file, index) => {
        console.log(`${index + 1}. ${file}`)
      })

      rl.question(
        "Введите номер резервной копии для восстановления: ",
        (index) => {
          const selectedBackup = backups[parseInt(index.trim()) - 1]
          if (selectedBackup) {
            console.log(`Восстанавливаем из бэкапа: ${selectedBackup}`)
            restoreBackup(selectedBackup)
          } else {
            console.log("Некорректный выбор.")
          }
          rl.close()
        }
      )
      break

    case "3":
      const availableBackups = listBackups()
      if (availableBackups.length === 0) {
        console.log("Нет доступных резервных копий.")
      } else {
        console.log("Доступные резервные копии:")
        availableBackups.forEach((file, index) => {
          console.log(`${index + 1}. ${file}`)
        })
      }
      rl.close()
      break

    case "4":
      console.log("Выход...")
      rl.close()
      break

    default:
      console.log("Некорректный ввод. Попробуйте ещё раз.")
      showMenu()
      rl.prompt()
      break
  }
}

console.log("Добро пожаловать в CLI для резервного копирования MongoDB!")
showMenu()
rl.prompt()

rl.on("line", handleUserInput)

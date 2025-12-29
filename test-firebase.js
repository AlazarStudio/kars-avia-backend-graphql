/**
 * Скрипт для тестирования Firebase уведомлений
 * Использование: node test-firebase.js <userId> [title] [body]
 * 
 * Примеры:
 * node test-firebase.js 507f1f77bcf86cd799439011
 * node test-firebase.js 507f1f77bcf86cd799439011 "Тестовое уведомление" "Это тестовое сообщение"
 */

import { sendNotificationToUser } from "./services/infra/fbsendtoken.js"

const userId = process.argv[2]
const title = process.argv[3] || "Тестовое уведомление"
const body = process.argv[4] || "Это тестовое сообщение для проверки Firebase"

if (!userId) {
  console.error("❌ Ошибка: необходимо указать userId")
  console.log("\nИспользование:")
  console.log("  node test-firebase.js <userId> [title] [body]")
  console.log("\nПримеры:")
  console.log('  node test-firebase.js 507f1f77bcf86cd799439011')
  console.log('  node test-firebase.js 507f1f77bcf86cd799439011 "Мой заголовок" "Мой текст"')
  process.exit(1)
}

console.log("🚀 Отправка тестового Firebase уведомления...")
console.log(`   User ID: ${userId}`)
console.log(`   Заголовок: ${title}`)
console.log(`   Текст: ${body}`)
console.log("")

try {
  const result = await sendNotificationToUser(userId, title, body, {
    type: "test",
    timestamp: new Date().toISOString()
  })

  console.log("✅ Уведомление отправлено успешно!")
  console.log(`   Успешно: ${result.successCount}`)
  console.log(`   Ошибок: ${result.failureCount}`)
  
  if (result.failureCount > 0) {
    console.log("\n⚠️  Некоторые отправки завершились ошибкой:")
    result.responses.forEach((resp, idx) => {
      if (!resp.success) {
        console.log(`   Токен ${idx + 1}: ${resp.error?.message || "Unknown error"}`)
      }
    })
  }
} catch (error) {
  console.error("❌ Ошибка при отправке уведомления:")
  console.error(error.message)
  
  if (error.stack) {
    console.error("\nДетали ошибки:")
    console.error(error.stack)
  }
  
  process.exit(1)
}


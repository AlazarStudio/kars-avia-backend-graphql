/**
 * Одноразовая нормализация User.login: trim + нижний регистр.
 *
 * Перед запуском сделайте бэкап БД. Если после toLowerCase() у нескольких
 * пользователей совпадает логин, скрипт выведет конфликты и завершится с кодом 1 —
 * такие пары нужно разрешить вручную (переименовать одного из пользователей).
 *
 * Запуск: node services/migrations/normalizeUserLogins.js
 */

import dotenv from "dotenv"
import { prisma } from "../../prisma.js"
import { normalizeUserLogin } from "../auth/normalizeUserLogin.js"

dotenv.config()

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, login: true }
  })

  const byNorm = new Map()
  for (const u of users) {
    const norm = normalizeUserLogin(u.login)
    if (!byNorm.has(norm)) byNorm.set(norm, [])
    byNorm.get(norm).push(u)
  }

  const conflicts = [...byNorm.entries()].filter(
    ([, list]) => list.length > 1
  )
  if (conflicts.length) {
    console.error(
      "Конфликты: несколько записей с одним логином без учёта регистра (исправьте вручную):"
    )
    for (const [norm, list] of conflicts) {
      console.error(norm, list.map((x) => ({ id: x.id, login: x.login })))
    }
    process.exitCode = 1
    return
  }

  let updated = 0
  for (const u of users) {
    const norm = normalizeUserLogin(u.login)
    if (u.login !== norm) {
      await prisma.user.update({
        where: { id: u.id },
        data: { login: norm }
      })
      updated++
    }
  }

  console.log(`Нормализация логинов завершена. Обновлено записей: ${updated}.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

/**
 * Синхронизация Airport из JSON-справочника:
 * - существующим по code/iata проставляет только address
 * - отсутствующие создаёт (name, code, city, address)
 *
 * Запуск:
 *   node services/migrations/syncAirportsFromJson.js
 *   node services/migrations/syncAirportsFromJson.js /path/to/airports.json
 */

import dotenv from "dotenv"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { prisma } from "../../prisma.js"

dotenv.config()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const defaultJsonPath = path.join(__dirname, "data", "airports.json")

async function main() {
  const jsonPath = process.argv[2] || defaultJsonPath
  if (!fs.existsSync(jsonPath)) {
    console.error(`Файл не найден: ${jsonPath}`)
    process.exitCode = 1
    return
  }

  const payload = JSON.parse(fs.readFileSync(jsonPath, "utf8"))
  const fileAirports = Array.isArray(payload.airports) ? payload.airports : []
  console.log(`Файл: ${jsonPath}`)
  console.log(`Записей в файле: ${fileAirports.length}`)

  const dbAirports = await prisma.airport.findMany({
    select: { id: true, code: true, address: true }
  })

  const byCode = new Map()
  for (const a of dbAirports) {
    const key = (a.code || "").toUpperCase()
    if (!key) continue
    if (!byCode.has(key)) byCode.set(key, [])
    byCode.get(key).push(a)
  }

  let updated = 0
  let created = 0
  let skipped = 0

  for (const item of fileAirports) {
    const iata = (item.iata || "").toString().trim().toUpperCase()
    const address = (item.address || "").toString().trim()

    if (!iata || !address) {
      skipped++
      continue
    }

    const existing = byCode.get(iata)
    if (existing?.length) {
      for (const row of existing) {
        if (row.address === address) continue
        await prisma.airport.update({
          where: { id: row.id },
          data: { address }
        })
        row.address = address
        updated++
      }
      continue
    }

    const createdRow = await prisma.airport.create({
      data: {
        name: item.name ?? null,
        code: iata,
        city: item.city ?? null,
        address
      },
      select: { id: true, code: true, address: true }
    })
    byCode.set(iata, [createdRow])
    created++
  }

  console.log(
    `Готово. updated=${updated}, created=${created}, skipped=${skipped}`
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

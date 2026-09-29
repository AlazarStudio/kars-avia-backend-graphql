// Backfill: проставляет title существующим SavedReport, у которых его нет.
// Название реестра до правки 29.09 нигде не сохранялось — оно есть только в самом
// файле отчёта, в ячейке A4 первого листа (exporter.js). Читаем его оттуда.
// Файла нет или ячейка пустая — отчёт пропускается: список покажет имя АК/гостиницы.
// updatedAt у SavedReport нигде не читается (авто-архив идёт по endDate,
// reportArchive.js), поэтому обычный prisma.update здесь безопасен.
//
// Запуск:  node scripts/backfill-saved-report-titles.js --dry   (только посчитать)
//          node scripts/backfill-saved-report-titles.js         (записать)

import path from "path"
import fs from "fs"
import ExcelJS from "exceljs"
import { prisma } from "../prisma.js"

const DRY = process.argv.includes("--dry")

const cellText = (value) => {
  if (value == null) return ""
  if (typeof value === "string") return value.trim()
  if (Array.isArray(value.richText)) {
    return value.richText.map((part) => part.text || "").join("").trim()
  }
  if (value.result != null) return String(value.result).trim()
  return String(value).trim()
}

async function main() {
  const reports = await prisma.savedReport.findMany({
    where: { OR: [{ title: null }, { title: { isSet: false } }] },
    select: { id: true, name: true }
  })
  console.log(`Отчётов без названия: ${reports.length}${DRY ? " (сухой прогон)" : ""}`)

  const stats = { updated: 0, missing: 0, empty: 0, failed: 0 }
  for (const report of reports) {
    const file = path.resolve("./reports", report.name)
    if (!fs.existsSync(file)) {
      stats.missing += 1
      continue
    }
    try {
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.readFile(file)
      const title = cellText(workbook.worksheets[0]?.getCell("A4").value)
      if (!title) {
        stats.empty += 1
        continue
      }
      if (!DRY) {
        await prisma.savedReport.update({
          where: { id: report.id },
          data: { title }
        })
      }
      stats.updated += 1
    } catch (e) {
      stats.failed += 1
      console.error(`${report.id} ${report.name}: ${e.message}`)
    }
  }

  console.log(
    `${DRY ? "Будет обновлено" : "Обновлено"}: ${stats.updated}, нет файла: ${stats.missing}, пустая A4: ${stats.empty}, ошибок: ${stats.failed}`
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())

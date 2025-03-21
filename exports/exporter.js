import ExcelJS from "exceljs"
import pdfMake from "pdfmake/build/pdfmake.js"
import * as pdfFonts from "pdfmake/build/vfs_fonts.js"
import fs from "fs"

pdfMake.vfs = pdfFonts.default?.pdfMake?.vfs || pdfFonts.pdfMake?.vfs

const formatCurrency = (value) => {
  if (!value || isNaN(value)) return "0 ₽"
  return `${Number(value).toLocaleString("ru-RU")} ₽`
}

export const generateExcelAvia = async (reportData, filePath) => {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet("Отчет по авиакомпаниям")

  sheet.columns = [
    { header: "п/п", key: "index", width: 5 },
    { header: "Дата/время заезда", key: "arrival", width: 20 },
    { header: "Дата/время выезда", key: "departure", width: 20 },
    { header: "кол-во суток", key: "totalDays", width: 10 },
    { header: "Категория ном.", key: "category", width: 15 },
    { header: "ФИО", key: "personName", width: 30 },
    { header: "Тип", key: "personPosition", width: 20 },
    { header: "Номер", key: "roomName", width: 10 },
    { header: "Завтрак", key: "breakfastCount", width: 10 },
    { header: "Обед", key: "lunchCount", width: 10 },
    { header: "Ужин", key: "dinnerCount", width: 10 },
    { header: "Стоимость питания", key: "totalMealCost", width: 18 },
    { header: "Стоимость проживания", key: "totalLivingCost", width: 18 },
    { header: "Итоговая стоимость", key: "totalDebt", width: 18 }
  ]

  reportData.forEach((row) => {
    sheet.addRow({
      index: row.index,
      arrival: row.arrival,
      departure: row.departure,
      totalDays: row.totalDays,
      category: row.category,
      personName: row.personName,
      personPosition: row.personPosition,
      roomName: row.roomName,
      breakfastCount: row.breakfastCount,
      lunchCount: row.lunchCount,
      dinnerCount: row.dinnerCount,
      totalMealCost: formatCurrency(row.totalMealCost),
      totalLivingCost: formatCurrency(row.totalLivingCost),
      totalDebt: formatCurrency(row.totalDebt)
    })
  })

  sheet.addRow({})
  sheet.addRow({
    personName: "ИТОГО:",
    totalMealCost: formatCurrency(
      reportData.reduce((sum, row) => sum + row.totalMealCost, 0)
    ),
    totalLivingCost: formatCurrency(
      reportData.reduce((sum, row) => sum + row.totalLivingCost, 0)
    ),
    totalDebt: formatCurrency(
      reportData.reduce((sum, row) => sum + row.totalDebt, 0)
    )
  })

  await workbook.xlsx.writeFile(filePath)
}

export const generateExcelHotel = async (reportData, filePath) => {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet("Развёрнутый отчёт")

  sheet.columns = [
    { header: "п/п", key: "index", width: 5 },
    { header: "Дата/время заезда", key: "arrival", width: 20 },
    { header: "Дата/время выезда", key: "departure", width: 20 },
    { header: "кол-во суток", key: "totalDays", width: 10 },
    { header: "Категория ном.", key: "category", width: 15 },
    { header: "ФИО", key: "personName", width: 30 },
    { header: "Тип", key: "personPosition", width: 20 },
    { header: "Номер", key: "roomName", width: 10 },
    { header: "Завтрак", key: "breakfastCount", width: 10 },
    { header: "Обед", key: "lunchCount", width: 10 },
    { header: "Ужин", key: "dinnerCount", width: 10 },
    { header: "Стоимость питания", key: "totalMealCost", width: 18 },
    { header: "Стоимость проживания", key: "totalLivingCost", width: 18 },
    { header: "Итоговая стоимость", key: "totalDebt", width: 18 }
  ]

  reportData.forEach((row) => {
    sheet.addRow({
      index: row.index,
      arrival: row.arrival,
      departure: row.departure,
      totalDays: row.totalDays,
      category: row.category,
      personName: row.personName,
      personPosition: row.personPosition,
      roomName: row.roomName,
      breakfastCount: row.breakfastCount,
      lunchCount: row.lunchCount,
      dinnerCount: row.dinnerCount,
      totalMealCost: formatCurrency(row.totalMealCost),
      totalLivingCost: formatCurrency(row.totalLivingCost),
      totalDebt: formatCurrency(row.totalDebt)
    })
  })

  sheet.addRow({})
  sheet.addRow({
    date: "ИТОГО",
    totalDays: reportData.reduce((sum, row) => sum + row.totalDays, 0),
    breakfastCount: reportData.reduce(
      (sum, row) => sum + row.breakfastCount,
      0
    ),
    lunchCount: reportData.reduce((sum, row) => sum + row.lunchCount, 0),
    dinnerCount: reportData.reduce((sum, row) => sum + row.dinnerCount, 0),
    totalMealCost: formatCurrency(
      reportData.reduce((sum, row) => sum + row.totalMealCost, 0)
    ),
    totalDebt: formatCurrency(
      reportData.reduce((sum, row) => sum + row.totalDebt, 0)
    )
  })

  await workbook.xlsx.writeFile(filePath)
}

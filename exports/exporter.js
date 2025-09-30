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

  const font = { name: "Times New Roman", size: 12 }

  const sheet = workbook.addWorksheet("Отчет по авиакомпаниям")

  sheet.columns = [
    { header: "п/п", key: "index", width: 6 },
    // { header: "id", key: "id", width: 30 },
    { header: "Дата/время заезда", key: "arrival", width: 25 },
    { header: "Дата/время выезда", key: "departure", width: 25 },
    { header: "кол-во суток", key: "totalDays", width: 10 },
    // { header: "Full log", key: "breakdown", width: 400 },
    { header: "Категория ном.", key: "category", width: 30 },
    { header: "ФИО", key: "personName", width: 30 },
    { header: "room", key: "roomName", width: 30 },
    { header: "roommate", key: "roommateName", width: 30 },
    { header: "Должность", key: "personPosition", width: 20 },
    // { header: "Номер", key: "roomName", width: 10 },
    { header: "Завтрак", key: "breakfastCount", width: 10 },
    { header: "Обед", key: "lunchCount", width: 10 },
    { header: "Ужин", key: "dinnerCount", width: 10 },
    { header: "Стоимость питания", key: "totalMealCost", width: 22 },
    { header: "Стоимость проживания", key: "totalLivingCost", width: 22 },
    { header: "Итоговая стоимость", key: "totalDebt", width: 22 },
    { header: "Гостиница", key: "hotelName", width: 30 }
  ]

  reportData.forEach((row) => {
    sheet.addRow({
      index: row.index,
      // id: row.id,
      arrival: row.arrival,
      departure: row.departure,
      totalDays: row.totalDays,
      // breakdown: row.breakdown,
      category: row.category,
      personName: row.personName,
      roomName: row.roomName,
      roommateName: row.roommateName,
      personPosition: row.personPosition,
      roomName: row.roomName,
      breakfastCount: row.breakfastCount,
      lunchCount: row.lunchCount,
      dinnerCount: row.dinnerCount,
      totalMealCost: formatCurrency(row.totalMealCost),
      totalLivingCost: formatCurrency(row.totalLivingCost),
      totalDebt: formatCurrency(row.totalDebt),
      hotelName: row.hotelName
    })
  })

  sheet.addRow({})
  sheet.addRow({
    personPosition: "ИТОГО:",
    // totalDays: reportData.reduce((sum, row) => sum + row.totalDays, 0),
    // breakfastCount: reportData.reduce(
    //   (sum, row) => sum + row.breakfastCount,
    //   0
    // ),
    // lunchCount: reportData.reduce((sum, row) => sum + row.lunchCount, 0),
    // dinnerCount: reportData.reduce((sum, row) => sum + row.dinnerCount, 0),
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

  sheet.getColumn("index").alignment = { horizontal: "left" }
  sheet.getColumn("totalDays").alignment = { horizontal: "left" }
  sheet.getColumn("breakfastCount").alignment = { horizontal: "center" }
  sheet.getColumn("lunchCount").alignment = { horizontal: "center" }
  sheet.getColumn("dinnerCount").alignment = { horizontal: "center" }
  sheet.getColumn("totalMealCost").alignment = { horizontal: "center" }
  sheet.getColumn("totalLivingCost").alignment = { horizontal: "center" }
  sheet.getColumn("totalDebt").alignment = { horizontal: "center" }

  sheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.font = {
        name: "Times New Roman",
        size: 12
      }
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" }
      }
      // ---------------------------------------------------------------- ↓↓↓↓
      if (row.hasValues) {
        const isOdd = row.number % 2 === 1
        const fillColor = isOdd ? "FFEEEEEE" : "FFCCCCCC"

        row.eachCell((cell) => {
          cell.font = { name: "Times New Roman", size: 12 }
          cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" }
          }
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: fillColor }
          }
        })
      }
      // ---------------------------------------------------------------- ↑↑↑↑
    })
  })

  const headerRow = sheet.getRow(1)
  headerRow.font = { name: "Times New Roman", size: 12, bold: true }
  headerRow.height = 30

  // ---------------------------------------------------------------- ↓↓↓↓
  const header = sheet.getRow(1)
  header.font = { name: "Times New Roman", size: 12, bold: true }
  header.height = 30
  header.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF999999" }
    }
  })
  // ---------------------------------------------------------------- ↑↑↑↑

  await workbook.xlsx.writeFile(filePath)
}

export const generateExcelHotel = async (reportData, filePath) => {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet("Развёрнутый отчёт")

  sheet.columns = [
    { header: "п/п", key: "index", width: 6 },
    { header: "Номер", key: "roomName", width: 15 },
    { header: "ФИО", key: "personName", width: 30 },
    { header: "Дата/время заезда", key: "arrival", width: 25 },
    { header: "Дата/время выезда", key: "departure", width: 25 },
    { header: "кол-во суток", key: "totalDays", width: 10 },
    { header: "Категория ном.", key: "category", width: 30 },
    // { header: "Должность", key: "personPosition", width: 20 },
    { header: "Завтрак", key: "breakfastCount", width: 10 },
    { header: "Обед", key: "lunchCount", width: 10 },
    { header: "Ужин", key: "dinnerCount", width: 10 },
    { header: "Стоимость питания", key: "totalMealCost", width: 20 },
    { header: "Стоимость проживания", key: "totalLivingCost", width: 20 },
    { header: "Итоговая стоимость", key: "totalDebt", width: 20 }
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
    breakfastCount: "ИТОГО",
    // totalDays: reportData.reduce((sum, row) => sum + row.totalDays, 0),
    // breakfastCount: reportData.reduce(
    //   (sum, row) => sum + row.breakfastCount,
    //   0
    // ),
    // lunchCount: reportData.reduce((sum, row) => sum + row.lunchCount, 0),
    // dinnerCount: reportData.reduce((sum, row) => sum + row.dinnerCount, 0),
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

  sheet.getColumn("index").alignment = { horizontal: "left" }
  sheet.getColumn("totalDays").alignment = { horizontal: "left" }
  sheet.getColumn("breakfastCount").alignment = { horizontal: "center" }
  sheet.getColumn("lunchCount").alignment = { horizontal: "center" }
  sheet.getColumn("dinnerCount").alignment = { horizontal: "center" }
  sheet.getColumn("totalMealCost").alignment = { horizontal: "center" }
  sheet.getColumn("totalLivingCost").alignment = { horizontal: "center" }
  sheet.getColumn("totalDebt").alignment = { horizontal: "center" }

  sheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.font = {
        name: "Times New Roman",
        size: 12
      }
    })
  })

  await workbook.xlsx.writeFile(filePath)
}
